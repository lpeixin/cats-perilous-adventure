# -*- coding: utf-8 -*-
"""
零依赖的高性能 PIL (Pillow) 兼容渲染层（C + CoreGraphics/CoreText 亚像素抗锯齿版）
==================================================================================
当系统 Python 未安装 Pillow 时，`tools/gen_assets.py` 自动回退到本模块。
利用 macOS 原生 clang 编译一个轻量级 -O3 C + CoreGraphics/CoreText 动态库，
实现亚像素距离场（SDF smoothstep）抗锯齿图元、双线性平滑旋转、高质量区域积分降采样与原生中文字体渲染。
"""

import ctypes
from ctypes import c_uint8, c_uint32, c_int, c_float, POINTER, c_char_p
import math
import os
import subprocess
import struct
import zlib

_DYLIB_PATH = "/tmp/_catmario_pil_c_v4.dylib"

_C_SOURCE = r"""
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreText/CoreText.h>
#include <CoreFoundation/CoreFoundation.h>

static inline float clamp01(float v) {
    return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
}

static inline float smooth_cov(float signed_dist) {
    // signed_dist < 0 在形状内部，> 0 在外部；[-0.65, +0.65] 平滑过渡消除一切锯齿
    float t = clamp01(0.5f - signed_dist / 1.3f);
    return t * t * (3.0f - 2.0f * t);
}

static inline void blend_px_cov(uint8_t *dst, int idx, uint32_t rgba, float cov) {
    if (cov <= 0.001f) return;
    uint32_t base_a = rgba & 0xFF;
    uint32_t sa = (uint32_t)(base_a * cov + 0.5f);
    if (sa == 0) return;
    uint8_t sr = (uint8_t)((rgba >> 24) & 0xFF);
    uint8_t sg = (uint8_t)((rgba >> 16) & 0xFF);
    uint8_t sb = (uint8_t)((rgba >> 8) & 0xFF);
    if (sa >= 255) {
        dst[idx] = sr; dst[idx+1] = sg; dst[idx+2] = sb; dst[idx+3] = 255;
        return;
    }
    uint32_t da = dst[idx+3];
    if (da == 0) {
        dst[idx] = sr; dst[idx+1] = sg; dst[idx+2] = sb; dst[idx+3] = (uint8_t)sa;
        return;
    }
    uint32_t inv = 255 - sa;
    uint32_t oa = sa * 255 + da * inv;
    uint32_t out_a = (oa + 127) / 255;
    if (out_a == 0) {
        dst[idx] = dst[idx+1] = dst[idx+2] = dst[idx+3] = 0;
        return;
    }
    dst[idx]   = (uint8_t)((sr * sa * 255 + dst[idx]   * da * inv + oa / 2) / oa);
    dst[idx+1] = (uint8_t)((sg * sa * 255 + dst[idx+1] * da * inv + oa / 2) / oa);
    dst[idx+2] = (uint8_t)((sb * sa * 255 + dst[idx+2] * da * inv + oa / 2) / oa);
    dst[idx+3] = (uint8_t)out_a;
}

static inline void blend_px(uint8_t *dst, int idx, uint32_t rgba) {
    blend_px_cov(dst, idx, rgba, 1.0f);
}

void c_alpha_composite(uint8_t *dst, int dw, int dh, const uint8_t *src, int sw, int sh, int dx, int dy) {
    for (int sy = 0; sy < sh; sy++) {
        int ty = dy + sy;
        if (ty < 0 || ty >= dh) continue;
        for (int sx = 0; sx < sw; sx++) {
            int tx = dx + sx;
            if (tx < 0 || tx >= dw) continue;
            int si = (sy * sw + sx) * 4;
            uint8_t sa = src[si + 3];
            if (sa == 0) continue;
            int di = (ty * dw + tx) * 4;
            uint32_t rgba = ((uint32_t)src[si] << 24) | ((uint32_t)src[si+1] << 16) | ((uint32_t)src[si+2] << 8) | sa;
            blend_px(dst, di, rgba);
        }
    }
}

void c_paste_masked(uint8_t *dst, int dw, int dh, const uint8_t *src, int sw, int sh,
                    const uint8_t *mask, int m_stride, int dx, int dy) {
    for (int sy = 0; sy < sh; sy++) {
        int ty = dy + sy;
        if (ty < 0 || ty >= dh) continue;
        for (int sx = 0; sx < sw; sx++) {
            int tx = dx + sx;
            if (tx < 0 || tx >= dw) continue;
            int si = (sy * sw + sx) * 4;
            int mi = (sy * sw + sx) * m_stride + (m_stride == 4 ? 3 : 0);
            uint8_t ma = mask ? mask[mi] : 255;
            if (ma == 0) continue;
            int di = (ty * dw + tx) * 4;
            uint32_t sa = (src[si+3] * ma + 127) / 255;
            if (ma == 255) {
                dst[di] = src[si]; dst[di+1] = src[si+1]; dst[di+2] = src[si+2]; dst[di+3] = (uint8_t)sa;
            } else {
                uint32_t rgba = ((uint32_t)src[si] << 24) | ((uint32_t)src[si+1] << 16) | ((uint32_t)src[si+2] << 8) | sa;
                blend_px(dst, di, rgba);
            }
        }
    }
}

static inline float lanczos_w(float x, float a) {
    float ax = fabsf(x);
    if (ax < 1e-5f) return 1.0f;
    if (ax >= a) return 0.0f;
    float pix = (float)M_PI * x;
    return (a * sinf(pix) * sinf(pix / a)) / (pix * pix);
}

void c_resize_rgba(const uint8_t *src, int sw, int sh, uint8_t *dst, int dw, int dh) {
    float sx_scale = (float)sw / (float)dw;
    float sy_scale = (float)sh / (float)dh;

    // 高精度盒式+亚像素加权预乘 Alpha 降采样，彻底杜绝边缘锯齿与黑边
    for (int dy = 0; dy < dh; dy++) {
        float src_y0 = dy * sy_scale;
        float src_y1 = (dy + 1.0f) * sy_scale;
        int iy0 = (int)floorf(src_y0);
        int iy1 = (int)ceilf(src_y1);
        if (iy1 <= iy0) iy1 = iy0 + 1;

        for (int dx = 0; dx < dw; dx++) {
            float src_x0 = dx * sx_scale;
            float src_x1 = (dx + 1.0f) * sx_scale;
            int ix0 = (int)floorf(src_x0);
            int ix1 = (int)ceilf(src_x1);
            if (ix1 <= ix0) ix1 = ix0 + 1;

            double r_sum = 0, g_sum = 0, b_sum = 0, a_sum = 0, w_sum = 0;
            for (int y = iy0; y < iy1; y++) {
                int sy = y < 0 ? 0 : (y >= sh ? sh - 1 : y);
                float wy = fminf(src_y1, y + 1.0f) - fmaxf(src_y0, (float)y);
                if (wy <= 0.0f) wy = 1.0f;
                for (int x = ix0; x < ix1; x++) {
                    int sx = x < 0 ? 0 : (x >= sw ? sw - 1 : x);
                    float wx = fminf(src_x1, x + 1.0f) - fmaxf(src_x0, (float)x);
                    if (wx <= 0.0f) wx = 1.0f;
                    double w = (double)(wx * wy);
                    int si = (sy * sw + sx) * 4;
                    double a = src[si + 3] * w;
                    r_sum += src[si] * a;
                    g_sum += src[si + 1] * a;
                    b_sum += src[si + 2] * a;
                    a_sum += a;
                    w_sum += w;
                }
            }
            int di = (dy * dw + dx) * 4;
            if (a_sum <= 0.001 || w_sum <= 0.0) {
                dst[di] = dst[di+1] = dst[di+2] = dst[di+3] = 0;
            } else {
                dst[di]   = (uint8_t)fmin(255.0, fmax(0.0, r_sum / a_sum + 0.5));
                dst[di+1] = (uint8_t)fmin(255.0, fmax(0.0, g_sum / a_sum + 0.5));
                dst[di+2] = (uint8_t)fmin(255.0, fmax(0.0, b_sum / a_sum + 0.5));
                dst[di+3] = (uint8_t)fmin(255.0, fmax(0.0, a_sum / w_sum + 0.5));
            }
        }
    }
}

void c_rotate_rgba(const uint8_t *src, int w, int h, uint8_t *dst, float angle_deg, float cx, float cy) {
    float rad = -angle_deg * (float)M_PI / 180.0f;
    float cs = cosf(rad);
    float sn = sinf(rad);
    // 双线性预乘 Alpha 插值旋转，消除尾巴/四肢旋转时的阶梯锯齿
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            float dx = x - cx;
            float dy = y - cy;
            float sx = cx + dx * cs - dy * sn;
            float sy = cy + dx * sn + dy * cs;
            int x0 = (int)floorf(sx);
            int y0 = (int)floorf(sy);
            float fx = sx - x0;
            float fy = sy - y0;
            int di = (y * w + x) * 4;
            if (x0 < -1 || x0 >= w || y0 < -1 || y0 >= h) {
                dst[di] = dst[di+1] = dst[di+2] = dst[di+3] = 0;
                continue;
            }
            float r_acc = 0.0f, g_acc = 0.0f, b_acc = 0.0f, a_acc = 0.0f;
            for (int oy = 0; oy <= 1; oy++) {
                int yy = y0 + oy;
                if (yy < 0 || yy >= h) continue;
                float wy = oy == 0 ? (1.0f - fy) : fy;
                for (int ox = 0; ox <= 1; ox++) {
                    int xx = x0 + ox;
                    if (xx < 0 || xx >= w) continue;
                    float wx = ox == 0 ? (1.0f - fx) : fx;
                    float wgt = wx * wy;
                    int si = (yy * w + xx) * 4;
                    float a = src[si + 3] * wgt;
                    r_acc += src[si] * a;
                    g_acc += src[si + 1] * a;
                    b_acc += src[si + 2] * a;
                    a_acc += a;
                }
            }
            if (a_acc <= 0.01f) {
                dst[di] = dst[di+1] = dst[di+2] = dst[di+3] = 0;
            } else {
                dst[di]   = (uint8_t)fminf(255.0f, r_acc / a_acc + 0.5f);
                dst[di+1] = (uint8_t)fminf(255.0f, g_acc / a_acc + 0.5f);
                dst[di+2] = (uint8_t)fminf(255.0f, b_acc / a_acc + 0.5f);
                dst[di+3] = (uint8_t)fminf(255.0f, a_acc + 0.5f);
            }
        }
    }
}

void c_box_blur(const uint8_t *src, uint8_t *dst, int w, int h, int radius) {
    if (radius < 1) {
        memcpy(dst, src, w * h * 4);
        return;
    }
    for (int y = 0; y < h; y++) {
        int y0 = y - radius < 0 ? 0 : y - radius;
        int y1 = y + radius >= h ? h - 1 : y + radius;
        for (int x = 0; x < w; x++) {
            int x0 = x - radius < 0 ? 0 : x - radius;
            int x1 = x + radius >= w ? w - 1 : x + radius;
            uint32_t r = 0, g = 0, b = 0, a = 0, cnt = 0;
            for (int yy = y0; yy <= y1; yy += 2) {
                for (int xx = x0; xx <= x1; xx += 2) {
                    int si = (yy * w + xx) * 4;
                    r += src[si]; g += src[si+1]; b += src[si+2]; a += src[si+3];
                    cnt++;
                }
            }
            int di = (y * w + x) * 4;
            dst[di] = r / cnt; dst[di+1] = g / cnt; dst[di+2] = b / cnt; dst[di+3] = a / cnt;
        }
    }
}

void c_draw_rrect(uint8_t *buf, int w, int h, int stride,
                  float x0, float y0, float x1, float y1, float r,
                  int has_fill, uint32_t f_rgba, int has_out, uint32_t o_rgba, float ow) {
    if (x1 < x0) { float t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { float t = y0; y0 = y1; y1 = t; }
    float rw = x1 - x0, rh = y1 - y0;
    if (r > rw * 0.5f) r = rw * 0.5f;
    if (r < 0.0f) r = 0.0f;

    float pad = has_out ? ow + 2.0f : 2.0f;
    int iy0 = (int)floorf(y0 - pad); if (iy0 < 0) iy0 = 0;
    int iy1 = (int)ceilf(y1 + pad);  if (iy1 >= h) iy1 = h - 1;
    int ix0 = (int)floorf(x0 - pad); if (ix0 < 0) ix0 = 0;
    int ix1 = (int)ceilf(x1 + pad);  if (ix1 >= w) ix1 = w - 1;

    float cx0 = x0 + r, cx1 = x1 - r;
    float cy0 = y0 + r, cy1 = y1 - r;
    float half_w = ow * 0.5f;
    uint8_t f_l = (uint8_t)((f_rgba >> 24) & 0xFF);
    uint8_t o_l = (uint8_t)((o_rgba >> 24) & 0xFF);

    for (int y = iy0; y <= iy1; y++) {
        float py = y + 0.5f;
        float dy = (py < cy0) ? (cy0 - py) : ((py > cy1) ? (py - cy1) : 0.0f);
        for (int x = ix0; x <= ix1; x++) {
            float px = x + 0.5f;
            float dx = (px < cx0) ? (cx0 - px) : ((px > cx1) ? (px - cx1) : 0.0f);
            float dist;
            if (dx > 0.0f && dy > 0.0f) {
                dist = sqrtf(dx * dx + dy * dy) - r;
            } else {
                float ox = fmaxf(x0 - px, px - x1);
                float oy = fmaxf(y0 - py, py - y1);
                dist = fmaxf(ox, oy);
            }
            int idx = (y * w + x) * stride;
            if (has_fill && dist < 0.7f) {
                float cov = smooth_cov(dist);
                if (stride == 1) {
                    uint8_t v = (uint8_t)(f_l * cov + buf[idx] * (1.0f - cov) + 0.5f);
                    if (v > buf[idx]) buf[idx] = v;
                } else {
                    blend_px_cov(buf, idx, f_rgba, cov);
                }
            }
            if (has_out) {
                float odist = fabsf(dist) - half_w;
                if (odist < 0.7f) {
                    float cov = smooth_cov(odist);
                    if (stride == 1) {
                        uint8_t v = (uint8_t)(o_l * cov + buf[idx] * (1.0f - cov) + 0.5f);
                        if (v > buf[idx]) buf[idx] = v;
                    } else {
                        blend_px_cov(buf, idx, o_rgba, cov);
                    }
                }
            }
        }
    }
}

void c_draw_ellipse(uint8_t *buf, int w, int h, int stride,
                    float x0, float y0, float x1, float y1,
                    int has_fill, uint32_t f_rgba, int has_out, uint32_t o_rgba, float ow) {
    float cx = (x0 + x1) * 0.5f;
    float cy = (y0 + y1) * 0.5f;
    float rx = (x1 - x0) * 0.5f;
    float ry = (y1 - y0) * 0.5f;
    if (rx <= 0.1f || ry <= 0.1f) return;

    float pad = has_out ? ow + 2.5f : 2.0f;
    int iy0 = (int)floorf(y0 - pad); if (iy0 < 0) iy0 = 0;
    int iy1 = (int)ceilf(y1 + pad);  if (iy1 >= h) iy1 = h - 1;
    int ix0 = (int)floorf(x0 - pad); if (ix0 < 0) ix0 = 0;
    int ix1 = (int)ceilf(x1 + pad);  if (ix1 >= w) ix1 = w - 1;

    float avg_r = 0.5f * (rx + ry);
    float half_w = ow * 0.5f;
    uint8_t f_l = (uint8_t)((f_rgba >> 24) & 0xFF);
    uint8_t o_l = (uint8_t)((o_rgba >> 24) & 0xFF);

    for (int y = iy0; y <= iy1; y++) {
        float dy = ((y + 0.5f) - cy) / ry;
        for (int x = ix0; x <= ix1; x++) {
            float dx = ((x + 0.5f) - cx) / rx;
            float norm_d = sqrtf(dx * dx + dy * dy);
            float dist = (norm_d - 1.0f) * avg_r;
            int idx = (y * w + x) * stride;
            if (has_fill && dist < 0.7f) {
                float cov = smooth_cov(dist);
                if (stride == 1) {
                    uint8_t v = (uint8_t)(f_l * cov + buf[idx] * (1.0f - cov) + 0.5f);
                    if (v > buf[idx]) buf[idx] = v;
                } else {
                    blend_px_cov(buf, idx, f_rgba, cov);
                }
            }
            if (has_out) {
                float odist = fabsf(dist) - half_w;
                if (odist < 0.7f) {
                    float cov = smooth_cov(odist);
                    if (stride == 1) {
                        uint8_t v = (uint8_t)(o_l * cov + buf[idx] * (1.0f - cov) + 0.5f);
                        if (v > buf[idx]) buf[idx] = v;
                    } else {
                        blend_px_cov(buf, idx, o_rgba, cov);
                    }
                }
            }
        }
    }
}

void c_draw_pie_arc(uint8_t *buf, int w, int h, int stride,
                    float x0, float y0, float x1, float y1, float a0, float a1, int is_pie,
                    int has_fill, uint32_t f_rgba, int has_out, uint32_t o_rgba, float ow) {
    float cx = (x0 + x1) * 0.5f;
    float cy = (y0 + y1) * 0.5f;
    float rx = (x1 - x0) * 0.5f;
    float ry = (y1 - y0) * 0.5f;
    if (rx <= 0.1f || ry <= 0.1f) return;

    while (a0 < 0.0f) { a0 += 360.0f; a1 += 360.0f; }
    while (a1 < a0) a1 += 360.0f;

    float pad = ow + 2.5f;
    int iy0 = (int)floorf(y0 - pad); if (iy0 < 0) iy0 = 0;
    int iy1 = (int)ceilf(y1 + pad);  if (iy1 >= h) iy1 = h - 1;
    int ix0 = (int)floorf(x0 - pad); if (ix0 < 0) ix0 = 0;
    int ix1 = (int)ceilf(x1 + pad);  if (ix1 >= w) ix1 = w - 1;

    float avg_r = 0.5f * (rx + ry);
    float half_w = ow * 0.5f;
    uint8_t f_l = (uint8_t)((f_rgba >> 24) & 0xFF);
    uint8_t o_l = (uint8_t)((o_rgba >> 24) & 0xFF);

    for (int y = iy0; y <= iy1; y++) {
        float dy = (y + 0.5f) - cy;
        for (int x = ix0; x <= ix1; x++) {
            float dx = (x + 0.5f) - cx;
            float ang = atan2f(dy / ry, dx / rx) * 180.0f / (float)M_PI;
            if (ang < 0.0f) ang += 360.0f;
            int in_ang = ((ang >= a0 && ang <= a1) || (ang + 360.0f >= a0 && ang + 360.0f <= a1));
            if (!in_ang) continue;

            int idx = (y * w + x) * stride;
            float norm_d = sqrtf((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
            float dist = (norm_d - 1.0f) * avg_r;
            if (is_pie && has_fill && dist < 0.7f) {
                float cov = smooth_cov(dist);
                if (stride == 1) buf[idx] = (uint8_t)(f_l * cov);
                else blend_px_cov(buf, idx, f_rgba, cov);
            }
            if (has_out) {
                float odist = fabsf(dist) - half_w;
                if (odist < 0.7f) {
                    float cov = smooth_cov(odist);
                    if (stride == 1) buf[idx] = (uint8_t)(o_l * cov);
                    else blend_px_cov(buf, idx, o_rgba, cov);
                }
            }
        }
    }
}

void c_draw_seg(uint8_t *buf, int w, int h, int stride,
                float ax, float ay, float bx, float by, float width, uint32_t rgba) {
    float rad = fmaxf(0.5f, width * 0.5f);
    float minx = fminf(ax, bx) - rad - 2.0f;
    float maxx = fmaxf(ax, bx) + rad + 2.0f;
    float miny = fminf(ay, by) - rad - 2.0f;
    float maxy = fmaxf(ay, by) + rad + 2.0f;
    int ix0 = (int)floorf(minx); if (ix0 < 0) ix0 = 0;
    int ix1 = (int)ceilf(maxx);  if (ix1 >= w) ix1 = w - 1;
    int iy0 = (int)floorf(miny); if (iy0 < 0) iy0 = 0;
    int iy1 = (int)ceilf(maxy);  if (iy1 >= h) iy1 = h - 1;

    float vx = bx - ax, vy = by - ay;
    float len2 = vx * vx + vy * vy;
    uint8_t l_val = (uint8_t)((rgba >> 24) & 0xFF);

    for (int y = iy0; y <= iy1; y++) {
        float py = y + 0.5f;
        for (int x = ix0; x <= ix1; x++) {
            float px = x + 0.5f;
            float t = 0.0f;
            if (len2 > 1e-6f) {
                t = ((px - ax) * vx + (py - ay) * vy) / len2;
                if (t < 0.0f) t = 0.0f;
                else if (t > 1.0f) t = 1.0f;
            }
            float dx = px - (ax + t * vx);
            float dy = py - (ay + t * vy);
            float dist = sqrtf(dx * dx + dy * dy) - rad;
            if (dist < 0.7f) {
                float cov = smooth_cov(dist);
                int idx = (y * w + x) * stride;
                if (stride == 1) {
                    uint8_t v = (uint8_t)(l_val * cov + buf[idx] * (1.0f - cov) + 0.5f);
                    if (v > buf[idx]) buf[idx] = v;
                } else {
                    blend_px_cov(buf, idx, rgba, cov);
                }
            }
        }
    }
}

void c_fill_poly(uint8_t *buf, int w, int h, int stride,
                 const float *pts, int npts, uint32_t rgba) {
    if (npts < 3) return;
    float miny = pts[1], maxy = pts[1];
    for (int i = 1; i < npts; i++) {
        float py = pts[i * 2 + 1];
        if (py < miny) miny = py;
        if (py > maxy) maxy = py;
    }
    int iy0 = (int)floorf(miny); if (iy0 < 0) iy0 = 0;
    int iy1 = (int)ceilf(maxy);  if (iy1 >= h) iy1 = h - 1;
    uint8_t l_val = (uint8_t)((rgba >> 24) & 0xFF);

    float nodes[256];
    for (int y = iy0; y <= iy1; y++) {
        float py = y + 0.5f;
        int k = 0;
        int j = npts - 1;
        for (int i = 0; i < npts; i++) {
            float xi = pts[i * 2], yi = pts[i * 2 + 1];
            float xj = pts[j * 2], yj = pts[j * 2 + 1];
            if ((yi < py && yj >= py) || (yj < py && yi >= py)) {
                if (k < 255) {
                    nodes[k++] = xi + (py - yi) / (yj - yi) * (xj - xi);
                }
            }
            j = i;
        }
        for (int i = 0; i < k - 1; i++) {
            for (int m = i + 1; m < k; m++) {
                if (nodes[m] < nodes[i]) {
                    float tmp = nodes[i]; nodes[i] = nodes[m]; nodes[m] = tmp;
                }
            }
        }
        for (int i = 0; i + 1 < k; i += 2) {
            float left = nodes[i], right = nodes[i + 1];
            int x0 = (int)floorf(left - 1.0f);  if (x0 < 0) x0 = 0;
            int x1 = (int)ceilf(right + 1.0f);  if (x1 >= w) x1 = w - 1;
            for (int x = x0; x <= x1; x++) {
                float px = x + 0.5f;
                float d = fmaxf(left - px, px - right);
                if (d < 0.65f) {
                    float cov = smooth_cov(d);
                    int idx = (y * w + x) * stride;
                    if (stride == 1) {
                        uint8_t v = (uint8_t)(l_val * cov + buf[idx] * (1.0f - cov) + 0.5f);
                        if (v > buf[idx]) buf[idx] = v;
                    } else {
                        blend_px_cov(buf, idx, rgba, cov);
                    }
                }
            }
        }
    }
}

void c_draw_text(uint8_t *buf, int w, int h, float x, float y,
                 const char *utf8_text, float font_size, uint32_t rgba) {
    uint8_t r = (uint8_t)((rgba >> 24) & 0xFF);
    uint8_t g = (uint8_t)((rgba >> 16) & 0xFF);
    uint8_t b = (uint8_t)((rgba >> 8) & 0xFF);
    uint8_t a = (uint8_t)(rgba & 0xFF);

    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
    CGContextRef ctx = CGBitmapContextCreate(NULL, w, h, 8, w * 4, cs, kCGImageAlphaPremultipliedLast);
    if (!ctx) { CGColorSpaceRelease(cs); return; }

    uint8_t *cg_data = (uint8_t *)CGBitmapContextGetData(ctx);
    memset(cg_data, 0, w * h * 4);

    CFStringRef str = CFStringCreateWithCString(NULL, utf8_text, kCFStringEncodingUTF8);
    CFStringRef font_name = CFSTR("PingFangSC-Semibold");
    CTFontRef font = CTFontCreateWithName(font_name, font_size, NULL);
    CGFloat comps[4] = { r / 255.0, g / 255.0, b / 255.0, a / 255.0 };
    CGColorRef col = CGColorCreate(cs, comps);

    const void *keys[] = { kCTFontAttributeName, kCTForegroundColorAttributeName };
    const void *vals[] = { font, col };
    CFDictionaryRef attrs = CFDictionaryCreate(NULL, keys, vals, 2,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFAttributedStringRef attr_str = CFAttributedStringCreate(NULL, str, attrs);
    CTLineRef line = CTLineCreateWithAttributedString(attr_str);

    CGContextSetTextPosition(ctx, x, h - y - font_size * 0.88);
    CTLineDraw(line, ctx);

    for (int py = 0; py < h; py++) {
        for (int px = 0; px < w; px++) {
            int i = (py * w + px) * 4;
            uint8_t sa = cg_data[i + 3];
            if (sa == 0) continue;
            uint8_t sr = sa == 255 ? cg_data[i]   : (uint8_t)fmin(255, (cg_data[i]   * 255) / sa);
            uint8_t sg = sa == 255 ? cg_data[i+1] : (uint8_t)fmin(255, (cg_data[i+1] * 255) / sa);
            uint8_t sb = sa == 255 ? cg_data[i+2] : (uint8_t)fmin(255, (cg_data[i+2] * 255) / sa);
            uint32_t px_rgba = ((uint32_t)sr << 24) | ((uint32_t)sg << 16) | ((uint32_t)sb << 8) | sa;
            blend_px(buf, i, px_rgba);
        }
    }

    CFRelease(line);
    CFRelease(attr_str);
    CFRelease(attrs);
    CGColorRelease(col);
    CFRelease(font);
    CFRelease(str);
    CGContextRelease(ctx);
    CGColorSpaceRelease(cs);
}
"""


def _load_c_lib():
    if not os.path.exists(_DYLIB_PATH):
        p = subprocess.Popen(
            [
                "/usr/bin/clang", "-O3", "-dynamiclib",
                "-framework", "CoreGraphics",
                "-framework", "CoreText",
                "-framework", "CoreFoundation",
                "-x", "c", "-", "-o", _DYLIB_PATH,
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        _, err = p.communicate(_C_SOURCE.encode("utf-8"))
        if p.returncode != 0:
            raise RuntimeError("Failed to compile C rasterizer: " + err.decode("utf-8", "ignore"))
    lib = ctypes.CDLL(_DYLIB_PATH)
    u8p = POINTER(c_uint8)
    fp = POINTER(c_float)
    lib.c_alpha_composite.argtypes = [u8p, c_int, c_int, u8p, c_int, c_int, c_int, c_int]
    lib.c_paste_masked.argtypes = [u8p, c_int, c_int, u8p, c_int, c_int, u8p, c_int, c_int, c_int]
    lib.c_resize_rgba.argtypes = [u8p, c_int, c_int, u8p, c_int, c_int]
    lib.c_rotate_rgba.argtypes = [u8p, c_int, c_int, u8p, c_float, c_float, c_float]
    lib.c_box_blur.argtypes = [u8p, u8p, c_int, c_int, c_int]
    lib.c_draw_rrect.argtypes = [
        u8p, c_int, c_int, c_int,
        c_float, c_float, c_float, c_float, c_float,
        c_int, c_uint32, c_int, c_uint32, c_float,
    ]
    lib.c_draw_ellipse.argtypes = [
        u8p, c_int, c_int, c_int,
        c_float, c_float, c_float, c_float,
        c_int, c_uint32, c_int, c_uint32, c_float,
    ]
    lib.c_draw_pie_arc.argtypes = [
        u8p, c_int, c_int, c_int,
        c_float, c_float, c_float, c_float, c_float, c_float, c_int,
        c_int, c_uint32, c_int, c_uint32, c_float,
    ]
    lib.c_draw_seg.argtypes = [
        u8p, c_int, c_int, c_int,
        c_float, c_float, c_float, c_float, c_float, c_uint32,
    ]
    lib.c_fill_poly.argtypes = [u8p, c_int, c_int, c_int, fp, c_int, c_uint32]
    lib.c_draw_text.argtypes = [u8p, c_int, c_int, c_float, c_float, c_char_p, c_float, c_uint32]
    return lib


_LIB = _load_c_lib()


def _u8_ptr(buf):
    return (c_uint8 * len(buf)).from_buffer(buf)


def _norm_col(col, mode="RGBA"):
    if col is None:
        return None
    if mode == "L":
        if isinstance(col, (tuple, list)):
            return (int(col[0]), 0, 0, 255)
        return (int(col), 0, 0, 255)
    if isinstance(col, int):
        return (col, col, col, 255)
    if len(col) == 3:
        return (int(col[0]), int(col[1]), int(col[2]), 255)
    return (int(col[0]), int(col[1]), int(col[2]), int(col[3]))


def _pack_rgba(col, mode="RGBA"):
    c = _norm_col(col, mode)
    if not c:
        return 0
    return ((c[0] & 0xFF) << 24) | ((c[1] & 0xFF) << 16) | ((c[2] & 0xFF) << 8) | (c[3] & 0xFF)


class ImageFilter:
    class GaussianBlur:
        def __init__(self, radius=1.0):
            self.radius = radius


class ImageFont:
    def __init__(self, size=20):
        self.size = size

    @staticmethod
    def truetype(path, size=20):
        return ImageFont(size=size)


class Image:
    LANCZOS = 1
    BICUBIC = 2

    def __init__(self, mode, size, buf=None):
        self.mode = mode
        self.width, self.height = int(size[0]), int(size[1])
        self.size = (self.width, self.height)
        self.stride = 4 if mode == "RGBA" else 1
        if buf is not None:
            self.buf = buf
        else:
            self.buf = bytearray(self.width * self.height * self.stride)

    @staticmethod
    def new(mode, size, bg=0):
        w, h = int(size[0]), int(size[1])
        im = Image(mode, (w, h))
        if bg is not None and bg != 0 and bg != (0, 0, 0, 0):
            if mode == "RGBA":
                r, g, b, a = _norm_col(bg, "RGBA")
                im.buf[:] = bytes([r, g, b, a]) * (w * h)
            else:
                v = bg[0] if isinstance(bg, (tuple, list)) else int(bg)
                im.buf[:] = bytes([v]) * (w * h)
        return im

    def copy(self):
        return Image(self.mode, self.size, bytearray(self.buf))

    def convert(self, mode):
        if mode == self.mode:
            return self.copy()
        if mode == "RGBA" and self.mode == "L":
            out = Image("RGBA", self.size)
            for i, v in enumerate(self.buf):
                j = i * 4
                out.buf[j] = v
                out.buf[j + 1] = v
                out.buf[j + 2] = v
                out.buf[j + 3] = 255
            return out
        return self.copy()

    def getchannel(self, ch):
        out = Image("L", self.size)
        off = {"R": 0, "G": 1, "B": 2, "A": 3}.get(ch, 3)
        out.buf[:] = self.buf[off::4]
        return out

    def crop(self, box):
        x0, y0, x1, y1 = [int(round(v)) for v in box]
        cw, ch = max(1, x1 - x0), max(1, y1 - y0)
        out = Image(self.mode, (cw, ch))
        s = self.stride
        for y in range(ch):
            sy = y0 + y
            if 0 <= sy < self.height:
                sx0 = max(0, x0)
                sx1 = min(self.width, x1)
                if sx1 > sx0:
                    dx0 = sx0 - x0
                    n = (sx1 - sx0) * s
                    si = (sy * self.width + sx0) * s
                    di = (y * cw + dx0) * s
                    out.buf[di : di + n] = self.buf[si : si + n]
        return out

    def resize(self, size, resample=1):
        nw, nh = int(round(size[0])), int(round(size[1]))
        if nw == self.width and nh == self.height:
            return self.copy()
        rgba = self if self.mode == "RGBA" else self.convert("RGBA")
        out = Image("RGBA", (nw, nh))
        _LIB.c_resize_rgba(
            _u8_ptr(rgba.buf), rgba.width, rgba.height,
            _u8_ptr(out.buf), nw, nh,
        )
        return out

    def rotate(self, angle, resample=2, center=None):
        cx, cy = center if center else (self.width * 0.5, self.height * 0.5)
        out = Image("RGBA", self.size)
        _LIB.c_rotate_rgba(
            _u8_ptr(self.buf), self.width, self.height,
            _u8_ptr(out.buf), float(angle), float(cx), float(cy),
        )
        return out

    def filter(self, flt):
        out = Image("RGBA", self.size)
        rad = int(max(1, round(getattr(flt, "radius", 1))))
        _LIB.c_box_blur(_u8_ptr(self.buf), _u8_ptr(out.buf), self.width, self.height, rad)
        return out

    def alpha_composite(self, other, dest=(0, 0)):
        dx, dy = int(round(dest[0])), int(round(dest[1]))
        _LIB.c_alpha_composite(
            _u8_ptr(self.buf), self.width, self.height,
            _u8_ptr(other.buf), other.width, other.height,
            dx, dy,
        )
        return self

    def paste(self, other, box=None, mask=None):
        dx, dy = (int(round(box[0])), int(round(box[1]))) if box else (0, 0)
        m_ptr = _u8_ptr(mask.buf) if mask is not None else None
        m_stride = mask.stride if mask is not None else 1
        _LIB.c_paste_masked(
            _u8_ptr(self.buf), self.width, self.height,
            _u8_ptr(other.buf), other.width, other.height,
            m_ptr, m_stride, dx, dy,
        )

    def save(self, path):
        rgba = self if self.mode == "RGBA" else self.convert("RGBA")
        w, h = rgba.width, rgba.height
        raw = bytearray((w * 4 + 1) * h)
        row_bytes = w * 4
        for y in range(h):
            di = y * (row_bytes + 1)
            raw[di] = 0
            si = y * row_bytes
            raw[di + 1 : di + 1 + row_bytes] = rgba.buf[si : si + row_bytes]

        def chunk(tag, data):
            crc = zlib.crc32(tag + data) & 0xFFFFFFFF
            return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

        ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
        idat = zlib.compress(bytes(raw), 6)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "wb") as f:
            f.write(png)

    @staticmethod
    def open(path):
        with open(path, "rb") as f:
            data = f.read()
        pos = 8
        w = h = 0
        idat_parts = []
        while pos < len(data):
            length = struct.unpack(">I", data[pos : pos + 4])[0]
            tag = data[pos + 4 : pos + 8]
            chunk_data = data[pos + 8 : pos + 8 + length]
            pos += 12 + length
            if tag == b"IHDR":
                w, h = struct.unpack(">II", chunk_data[:8])
            elif tag == b"IDAT":
                idat_parts.append(chunk_data)
            elif tag == b"IEND":
                break
        raw = zlib.decompress(b"".join(idat_parts))
        im = Image("RGBA", (w, h))
        row_bytes = w * 4
        for y in range(h):
            si = y * (row_bytes + 1) + 1
            di = y * row_bytes
            im.buf[di : di + row_bytes] = raw[si : si + row_bytes]
        return im


class ImageDraw:
    class Draw:
        def __init__(self, im):
            self.im = im

        def rectangle(self, xy, fill=None, outline=None, width=1):
            self.rounded_rectangle(xy, radius=0, fill=fill, outline=outline, width=width)

        def rounded_rectangle(self, xy, radius=0, fill=None, outline=None, width=1):
            x0, y0, x1, y1 = [float(v) for v in xy]
            fc = _pack_rgba(fill, self.im.mode) if fill is not None else 0
            oc = _pack_rgba(outline, self.im.mode) if (outline is not None and width > 0) else 0
            _LIB.c_draw_rrect(
                _u8_ptr(self.im.buf), self.im.width, self.im.height, self.im.stride,
                x0, y0, x1, y1, float(radius),
                1 if fill is not None else 0, fc,
                1 if (outline is not None and width > 0) else 0, oc, float(width),
            )

        def ellipse(self, xy, fill=None, outline=None, width=1):
            x0, y0, x1, y1 = [float(v) for v in xy]
            fc = _pack_rgba(fill, self.im.mode) if fill is not None else 0
            oc = _pack_rgba(outline, self.im.mode) if (outline is not None and width > 0) else 0
            _LIB.c_draw_ellipse(
                _u8_ptr(self.im.buf), self.im.width, self.im.height, self.im.stride,
                x0, y0, x1, y1,
                1 if fill is not None else 0, fc,
                1 if (outline is not None and width > 0) else 0, oc, float(width),
            )

        def arc(self, xy, a0, a1, fill=None, width=1):
            if fill is None:
                return
            x0, y0, x1, y1 = [float(v) for v in xy]
            oc = _pack_rgba(fill, self.im.mode)
            _LIB.c_draw_pie_arc(
                _u8_ptr(self.im.buf), self.im.width, self.im.height, self.im.stride,
                x0, y0, x1, y1, float(a0), float(a1), 0,
                0, 0, 1, oc, float(width),
            )

        def pieslice(self, xy, a0, a1, fill=None, outline=None, width=1):
            x0, y0, x1, y1 = [float(v) for v in xy]
            fc = _pack_rgba(fill, self.im.mode) if fill is not None else 0
            oc = _pack_rgba(outline, self.im.mode) if (outline is not None and width > 0) else 0
            _LIB.c_draw_pie_arc(
                _u8_ptr(self.im.buf), self.im.width, self.im.height, self.im.stride,
                x0, y0, x1, y1, float(a0), float(a1), 1,
                1 if fill is not None else 0, fc,
                1 if (outline is not None and width > 0) else 0, oc, float(width),
            )

        def line(self, pts, fill=None, width=1, joint=None):
            if not pts or len(pts) < 2 or fill is None:
                return
            c = _pack_rgba(fill, self.im.mode)
            for i in range(len(pts) - 1):
                ax, ay = float(pts[i][0]), float(pts[i][1])
                bx, by = float(pts[i + 1][0]), float(pts[i + 1][1])
                _LIB.c_draw_seg(
                    _u8_ptr(self.im.buf), self.im.width, self.im.height, self.im.stride,
                    ax, ay, bx, by, float(width), c,
                )

        def polygon(self, pts, fill=None, outline=None, width=1):
            if not pts or len(pts) < 3:
                return
            if fill is not None:
                fc = _pack_rgba(fill, self.im.mode)
                n = len(pts)
                arr = (c_float * (n * 2))()
                for i, (px, py) in enumerate(pts):
                    arr[i * 2] = float(px)
                    arr[i * 2 + 1] = float(py)
                _LIB.c_fill_poly(
                    _u8_ptr(self.im.buf), self.im.width, self.im.height, self.im.stride,
                    arr, n, fc,
                )
            if outline is not None and width > 0:
                self.line(list(pts) + [pts[0]], fill=outline, width=width)

        def text(self, xy, s, font=None, fill=None):
            if not s or fill is None:
                return
            x, y = float(xy[0]), float(xy[1])
            sz = float(getattr(font, "size", 20)) if font else 20.0
            c = _pack_rgba(fill, self.im.mode)
            _LIB.c_draw_text(
                _u8_ptr(self.im.buf), self.im.width, self.im.height,
                x, y, s.encode("utf-8"), sz, c,
            )
