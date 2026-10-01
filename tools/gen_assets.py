#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《猫咪历险记》Cat's Perilous Adventure —— 原创美术资源生成器
=============================================================

设计原则
--------
1. **完全原创**：所有图形均由本脚本用几何图元程序化绘制，不引用、不描摹任何
   既有作品的精灵图 / 瓦片 / 素材，因此不存在版权风险。
2. **风格统一**：全部素材共享同一套调色板（下方 PALETTE）与同一种绘制语言
   —— 扁平卡通 + 柔和描边 + 顶部高光 + 底部暗面，因此任意素材拼在一起都协调。
3. **高清优雅**：以 4 倍超采样（SS=4）绘制后 LANCZOS 降采样，得到干净平滑的
   抗锯齿边缘；瓦片基础网格 48px、角色网格 64px，属于"高分辨率精细像素风"的
   分辨率档位，而不是 FC 时代的 16px 马赛克。

用法
----
    python3 tools/gen_assets.py            # 生成全部素材 + 风格小样
    python3 tools/gen_assets.py --only cat # 只生成某一组
"""

from PIL import Image, ImageDraw, ImageFilter
import math
import os
import sys
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SS = 4  # 超采样倍率

# ---------------------------------------------------------------------------
# 调色板（全项目唯一色彩来源，保证风格统一）
# ---------------------------------------------------------------------------
P = {
    # 天空 / 背景
    "sky_top": (108, 186, 238),
    "sky_mid": (162, 214, 244),
    "sky_bot": (226, 243, 226),
    "cloud_lo": (214, 232, 246),
    "cloud_hi": (250, 253, 255),
    "hill_far": (156, 208, 186),
    "hill_mid": (114, 184, 152),
    "hill_near": (82, 154, 118),
    "trunk": (146, 100, 68),
    "trunk_d": (114, 74, 50),
    "leaf": (108, 180, 122),
    "leaf_d": (80, 150, 100),
    "leaf_l": (146, 208, 146),
    # 泥土 / 草地
    "dirt_d": (146, 96, 60),
    "dirt": (184, 130, 82),
    "dirt_l": (212, 162, 110),
    "grass_d": (66, 144, 80),
    "grass": (104, 188, 106),
    "grass_l": (152, 220, 136),
    # 砖 / 石
    "brick_d": (166, 86, 64),
    "brick": (208, 122, 92),
    "brick_l": (236, 158, 122),
    "stone_d": (124, 134, 154),
    "stone": (170, 178, 192),
    "stone_l": (212, 218, 228),
    # 问号砖 / 管道
    "q_d": (198, 142, 36),
    "q": (246, 196, 74),
    "q_l": (255, 232, 146),
    "pipe_d": (52, 142, 92),
    "pipe": (94, 190, 128),
    "pipe_l": (146, 222, 168),
    # 猫
    "cat": (247, 170, 86),
    "cat_d": (214, 128, 52),
    "cat_l": (255, 204, 134),
    "cat_cream": (255, 240, 218),
    "cat_stripe": (208, 120, 54),
    # 通用
    "ink": (62, 46, 50),
    "ink_soft": (92, 70, 74),
    "white": (255, 253, 248),
    "eye": (52, 40, 46),
    "pink": (246, 148, 160),
    "pink_d": (216, 110, 128),
    # 敌人
    "yarn": (232, 106, 126),
    "yarn_d": (196, 72, 96),
    "yarn_l": (250, 156, 168),
    "crow": (92, 88, 130),
    "crow_d": (68, 64, 100),
    "crow_l": (134, 130, 176),
    "crow_beak": (246, 176, 74),
    "fish": (108, 176, 228),
    "fish_d": (74, 138, 196),
    "fish_l": (166, 214, 246),
    "mush": (226, 88, 104),
    "mush_d": (188, 60, 80),
    "mush_l": (248, 142, 152),
    # 道具
    "gold": (255, 200, 66),
    "gold_d": (222, 154, 34),
    "gold_l": (255, 232, 152),
    "star": (255, 214, 72),
    "star_d": (232, 162, 36),
    "star_l": (255, 244, 176),
    "can": (198, 208, 220),
    "can_d": (154, 166, 184),
    "can_l": (238, 244, 250),
    # 危险
    "spike": (206, 214, 226),
    "spike_d": (150, 160, 178),
    "lava": (238, 122, 60),
    "lava_d": (206, 78, 42),
    "lava_l": (255, 190, 96),
}


def C(key, a=255):
    """取调色板颜色，可选透明度。"""
    r, g, b = P[key]
    return (r, g, b, a)


def mix(k1, k2, t):
    """在两个调色板颜色之间插值。"""
    a, b = P[k1], P[k2]
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)


def shade(col, t):
    """把颜色向黑/白推移，t<0 变暗，t>0 变亮。"""
    r, g, b = col[:3]
    if t >= 0:
        return (int(r + (255 - r) * t), int(g + (255 - g) * t), int(b + (255 - b) * t), col[3] if len(col) > 3 else 255)
    t = -t
    return (int(r * (1 - t)), int(g * (1 - t)), int(b * (1 - t)), col[3] if len(col) > 3 else 255)


# ---------------------------------------------------------------------------
# 绘制基础：Layer（4 倍超采样画布）
# ---------------------------------------------------------------------------
class Layer:
    """一个超采样绘制层。所有对外坐标都是"逻辑像素"，内部自动乘 SS。"""

    def __init__(self, w, h, mode="RGBA", bg=None):
        self.w, self.h = w, h
        if bg is None:
            bg = (0, 0, 0, 0) if mode == "RGBA" else 0
        self.im = Image.new(mode, (w * SS, h * SS), bg)
        self.d = ImageDraw.Draw(self.im)

    # -- 内部工具 ---------------------------------------------------------
    def _s(self, v):
        return v * SS

    def _box(self, xy):
        x0, y0, x1, y1 = xy
        return [x0 * SS, y0 * SS, x1 * SS, y1 * SS]

    def _pts(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def _w(self, w):
        return max(1, int(round(w * SS)))

    def _refresh(self):
        self.d = ImageDraw.Draw(self.im)

    # -- 图元 -------------------------------------------------------------
    def rrect(self, xy, radius=0, fill=None, outline=None, width=1):
        self.d.rounded_rectangle(
            self._box(xy), radius=self._s(radius), fill=fill,
            outline=outline, width=self._w(width) if outline else 0,
        )

    def ell(self, cx, cy, rx, ry, fill=None, outline=None, width=1):
        self.d.ellipse(
            [self._s(cx - rx), self._s(cy - ry), self._s(cx + rx), self._s(cy + ry)],
            fill=fill, outline=outline, width=self._w(width) if outline else 0,
        )

    def ell_box(self, xy, fill=None, outline=None, width=1):
        self.d.ellipse(self._box(xy), fill=fill, outline=outline,
                       width=self._w(width) if outline else 0)

    def poly(self, pts, fill=None, outline=None, width=1):
        p = self._pts(pts)
        self.d.polygon(p, fill=fill)
        if outline:
            self.d.line(p + [p[0]], fill=outline, width=self._w(width), joint="curve")

    def line(self, pts, fill, width=1):
        self.d.line(self._pts(pts), fill=fill, width=self._w(width), joint="curve")

    def arc(self, cx, cy, rx, ry, a0, a1, fill, width=1):
        self.d.arc(
            [self._s(cx - rx), self._s(cy - ry), self._s(cx + rx), self._s(cy + ry)],
            a0, a1, fill=fill, width=self._w(width),
        )

    def pie(self, cx, cy, rx, ry, a0, a1, fill=None, outline=None, width=1):
        self.d.pieslice(
            [self._s(cx - rx), self._s(cy - ry), self._s(cx + rx), self._s(cy + ry)],
            a0, a1, fill=fill, outline=outline, width=self._w(width) if outline else 0,
        )

    def dot(self, x, y, r, fill):
        self.ell(x, y, r, r, fill=fill)

    def vgrad(self, xy, c_top, c_bot, radius=0):
        """垂直渐变填充（用 1px 逻辑高的条带堆叠，成本可接受）。"""
        x0, y0, x1, y1 = xy
        n = max(1, int(round(y1 - y0)))
        mask = Layer(self.w, self.h, "L")
        mask.rrect(xy, radius, fill=255)
        grad = Layer(self.w, self.h)
        for i in range(n):
            t = i / max(1, n - 1)
            col = tuple(int(round(c_top[j] + (c_bot[j] - c_top[j]) * t)) for j in range(3))
            grad.d.rectangle(
                [self._s(x0), self._s(y0 + i), self._s(x1), self._s(y0 + i + 1)],
                fill=col + (255,),
            )
        self.paste(grad, mask)

    # -- 合成 -------------------------------------------------------------
    def paste(self, other, mask=None):
        """把 other 层按 mask（L 层）贴到本层上。"""
        if mask is None:
            self.im = Image.alpha_composite(self.im, other.im)
        else:
            tmp = Image.new("RGBA", self.im.size, (0, 0, 0, 0))
            tmp.paste(other.im, (0, 0), mask.im)
            self.im = Image.alpha_composite(self.im, tmp)
        self._refresh()

    def clip(self, mask_layer, draw_fn):
        """在 mask_layer 限定的区域内绘制。draw_fn 接收一个新的 Layer。"""
        lay = Layer(self.w, self.h)
        draw_fn(lay)
        self.paste(lay, mask_layer)

    def blurred(self, radius=1.0):
        out = Layer(self.w, self.h)
        out.im = self.im.filter(ImageFilter.GaussianBlur(radius * SS))
        out._refresh()
        return out

    def copy(self):
        out = Layer(self.w, self.h)
        out.im = self.im.copy()
        out._refresh()
        return out

    def mask_of(self):
        m = Layer(self.w, self.h, "L")
        m.im = self.im.getchannel("A").copy()
        m._refresh()
        return m

    def out(self):
        return self.im.resize((self.w, self.h), Image.LANCZOS)


# ---------------------------------------------------------------------------
# 通用绘制配方
# ---------------------------------------------------------------------------
def blob(lay, cx, cy, rx, ry, key, outline_key="ink", ow=1.4, hi=0.34, sh=0.20,
         hi_dx=-0.28, hi_dy=-0.34):
    """
    本项目所有"角色部件"的统一画法：底色 + 顶部高光 + 底部暗面 + 柔和描边。
    这是风格统一的关键配方。
    """
    lay.ell(cx, cy, rx, ry, fill=C(key))
    # 底部暗面
    mask = Layer(lay.w, lay.h, "L")
    mask.ell(cx, cy, rx, ry, fill=255)
    lay.clip(mask, lambda l: l.ell(cx + rx * 0.06, cy + ry * 0.42, rx * 0.94, ry * 0.62,
                                   fill=shade(C(key), -sh)))
    # 顶部高光
    lay.clip(mask, lambda l: l.ell(cx + rx * hi_dx, cy + ry * hi_dy, rx * 0.56, ry * 0.44,
                                   fill=shade(C(key), hi)))
    if outline_key:
        lay.ell(cx, cy, rx, ry, outline=C(outline_key), width=ow)
    return mask


def rblob(lay, xy, radius, key, outline_key="ink", ow=1.4, hi=0.30, sh=0.18):
    """圆角矩形版的 blob。"""
    x0, y0, x1, y1 = xy
    lay.rrect(xy, radius, fill=C(key))
    mask = Layer(lay.w, lay.h, "L")
    mask.rrect(xy, radius, fill=255)
    h = y1 - y0
    lay.clip(mask, lambda l: l.rrect((x0, y0 + h * 0.52, x1, y1), radius * 0.8,
                                     fill=shade(C(key), -sh)))
    lay.clip(mask, lambda l: l.rrect((x0 + (x1 - x0) * 0.10, y0 + h * 0.07,
                                      x1 - (x1 - x0) * 0.30, y0 + h * 0.36),
                                     radius * 0.7, fill=shade(C(key), hi)))
    if outline_key:
        lay.rrect(xy, radius, outline=C(outline_key), width=ow)


def save(img, *parts):
    path = os.path.join(ASSETS, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return path


def sheet(frames, cw, ch, cols=None):
    """把若干帧拼成横向/网格精灵表。"""
    cols = cols or len(frames)
    rows = math.ceil(len(frames) / cols)
    out = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, ((i % cols) * cw, (i // cols) * ch), f)
    return out


# ===========================================================================
# 1. 主角：橘猫
# ===========================================================================
CELL = 64


def draw_cat(*, big=False, leg=0.0, eye="open", tail=0.0, ear=0.0, squash=1.0,
             tilt=0.0, crouch=False, hurt=False, arms_up=False, tail_up=False):
    """
    绘制一帧橘猫。以"底边中心"为锚点做非等比缩放：大猫更高（sy 1.30），
    只略微变宽（sx 1.06）—— 和经典平台跳跃游戏"变大=变高"的观感一致。
    """
    sx = 1.06 if big else 1.0
    sy = 1.30 if big else 1.0
    feet = 60.0   # 两种形态都把脚底对齐到 y=60，方便引擎用统一的 origin 锚点
    AX = 32.0
    AY = feet

    lay = Layer(CELL, CELL)

    def T(x, y):
        return (AX + (x - AX) * sx, AY + (y - AY) * sy)

    def TX(v):
        return v * sx

    def TY(v):
        return v * sy

    def E(cx, cy, rx, ry, **kw):
        x, y = T(cx, cy)
        lay.ell(x, y, TX(rx), TY(ry), **kw)

    def RE(xy, radius, **kw):
        x0, y0, x1, y1 = xy
        a = T(x0, y0)
        b = T(x1, y1)
        lay.rrect((a[0], a[1], b[0], b[1]), TX(radius), **kw)

    def LN(pts, **kw):
        lay.line([T(*p) for p in pts], **kw)

    body_cy = 40.0 - (3.0 if crouch else 0.0)
    body_ry = 11.0 + (2.5 if crouch else 0.0)
    bob = -1.0 if (not crouch and abs(math.sin(leg * math.pi * 2)) > 0.7) else 0.0

    # ---- 尾巴（画在身体后面）---------------------------------------------
    base = T(17, 40)
    sway = math.sin(leg * math.pi * 2) * 0.32 + tail
    if tail_up:
        pts = [(17, 40), (9, 34), (5, 24), (7, 16)]
    else:
        pts = [
            (17, 40),
            (10, 36 + sway * 6),
            (5, 28 + sway * 8),
            (6, 19 + sway * 7),
        ]
    tp = [T(*p) for p in pts]
    lay.line(tp, fill=C("cat_d"), width=TX(5.6))
    lay.line(tp, fill=C("cat"), width=TX(3.6))
    lay.dot(tp[-1][0], tp[-1][1], TX(2.0), C("cat_l"))

    # ---- 后腿 ------------------------------------------------------------
    hip_y = body_cy + body_ry * 0.45
    for i, hx in enumerate((21.0, 25.0)):
        ph = math.sin((leg + i * 0.5) * math.pi * 2)
        fx = hx + ph * 2.6
        fy = feet - max(0.0, ph) * 2.4
        a = T(fx, hip_y)
        b = T(fx + 0.6, fy)
        lay.line([a, b], fill=C("cat_d"), width=TX(5.2))
        lay.dot(b[0], b[1], TX(2.8), C("cat_cream"))

    # ---- 身体 ------------------------------------------------------------
    E(30, body_cy + bob, 15.0, body_ry, fill=C("cat"))
    mask = Layer(CELL, CELL, "L")
    cx0, cy0 = T(30, body_cy + bob)
    mask.ell(cx0, cy0, TX(15.0), TY(body_ry), fill=255)
    lay.clip(mask, lambda l: l.ell(*T(30.5, body_cy + bob + body_ry * 0.44),
                                   TX(14.0), TY(body_ry * 0.60), fill=C("cat_d")))
    lay.clip(mask, lambda l: l.ell(*T(25.5, body_cy + bob - body_ry * 0.42),
                                   TX(8.6), TY(body_ry * 0.44), fill=C("cat_l")))
    # 虎斑条纹
    for i, off in enumerate((-6.5, -1.0, 4.5)):
        lay.clip(mask, lambda l, o=off: l.arc(*T(30 + o, body_cy + bob + 1.0),
                                              TX(3.4), TY(6.2), 200, 340,
                                              fill=C("cat_stripe"), width=TX(1.5)))
    lay.ell(cx0, cy0, TX(15.0), TY(body_ry), outline=C("ink"), width=1.3)
    # 胸前奶白
    lay.clip(mask, lambda l: l.ell(*T(40, body_cy + bob + 4.0), TX(5.4), TY(5.6),
                                   fill=C("cat_cream")))

    # ---- 前腿 ------------------------------------------------------------
    for i, hx in enumerate((39.0, 43.0)):
        ph = math.sin((leg + 0.5 + i * 0.5) * math.pi * 2)
        fx = hx + ph * 2.6
        fy = feet - max(0.0, ph) * 2.4
        a = T(fx, hip_y)
        b = T(fx + 0.4, fy)
        lay.line([a, b], fill=C("cat"), width=TX(5.0))
        lay.line([a, b], fill=C("cat_l"), width=TX(2.2))
        lay.dot(b[0], b[1], TX(2.9), C("cat_cream"))

    # ---- 头 --------------------------------------------------------------
    hx_c, hy_c = 43.0, 27.0 + bob - (2.0 if crouch else 0.0)
    hr = 12.4
    head_off = T(hx_c, hy_c)
    head_mask = Layer(CELL, CELL, "L")
    head_mask.ell(head_off[0], head_off[1], TX(hr), TY(hr), fill=255)
    # 耳朵
    for sgn, ex in ((-1, 36.5), (1, 49.0)):
        apex = T(ex + ear * sgn * 1.6, hy_c - hr - 6.6 + ear * 1.2)
        b1 = T(ex - 5.0, hy_c - hr + 4.2)
        b2 = T(ex + 5.2, hy_c - hr + 4.4)
        lay.poly([apex, b1, b2], fill=C("cat"), outline=C("ink"), width=1.2)
        inner = T(ex + ear * sgn * 1.4, hy_c - hr - 2.6 + ear * 0.8)
        lay.poly([inner, T(ex - 2.2, hy_c - hr + 3.0), T(ex + 2.6, hy_c - hr + 3.2)],
                 fill=C("pink"))
        head_mask.poly([apex, b1, b2], fill=255)

    E(hx_c, hy_c, hr, hr, fill=C("cat"))
    lay.clip(head_mask, lambda l: l.ell(*T(hx_c + 1.0, hy_c + hr * 0.46),
                                        TX(hr * 0.94), TY(hr * 0.58), fill=C("cat_d")))
    lay.clip(head_mask, lambda l: l.ell(*T(hx_c - hr * 0.30, hy_c - hr * 0.38),
                                        TX(hr * 0.62), TY(hr * 0.50), fill=C("cat_l")))
    lay.clip(head_mask, lambda l: l.ell(*T(hx_c - 3.0, hy_c + 1.4), TX(6.6), TY(6.0),
                                        fill=C("cat_cream")))
    lay.ell(head_off[0], head_off[1], TX(hr), TY(hr), outline=C("ink"), width=1.3)

    # ---- 脸 --------------------------------------------------------------
    ex_l, ex_r = hx_c - 3.4, hx_c + 5.4
    ey = hy_c - 1.4
    if eye == "x" or hurt:
        for exx in (ex_l, ex_r):
            p = T(exx, ey)
            s = TX(3.0)
            lay.line([(p[0] - s, p[1] - s), (p[0] + s, p[1] + s)], fill=C("eye"), width=TX(1.6))
            lay.line([(p[0] - s, p[1] + s), (p[0] + s, p[1] - s)], fill=C("eye"), width=TX(1.6))
    elif eye == "happy":
        for exx in (ex_l, ex_r):
            lay.arc(*T(exx, ey + 1.6), TX(2.9), TY(2.6), 190, 350, fill=C("eye"), width=TX(1.7))
    elif eye == "blink":
        for exx in (ex_l, ex_r):
            p = T(exx, ey)
            lay.line([(p[0] - TX(2.8), p[1]), (p[0] + TX(2.8), p[1])],
                     fill=C("eye"), width=TX(1.5))
    else:
        for exx in (ex_l, ex_r):
            lay.ell(*T(exx, ey), TX(3.0), TY(3.3), fill=C("white"))
            lay.ell(*T(exx + 0.5, ey + 0.3), TX(2.0), TY(2.3), fill=C("eye"))
            lay.dot(*T(exx + 1.3, ey - 1.2), TX(0.85), C("white"))
    # 腮红
    for exx in (ex_l - 3.6, ex_r + 3.8):
        lay.ell(*T(exx, ey + 4.6), TX(2.5), TY(1.7), fill=C("pink", 150))
    # 鼻子 + 嘴
    n = T(hx_c + 8.4, ey + 2.0)
    lay.poly([(n[0] - TX(1.6), n[1] - TY(1.2)), (n[0] + TX(1.6), n[1] - TY(1.2)),
              (n[0], n[1] + TY(1.3))], fill=C("pink_d"))
    lay.arc(*T(hx_c + 7.0, ey + 4.4), TX(2.6), TY(2.0), 20, 150, fill=C("ink_soft"), width=1.0)
    # 胡须
    for dy in (-2.0, 0.6, 3.0):
        a = T(hx_c + 7.0, ey + 2.2 + dy)
        b = T(hx_c + 14.6, ey + dy * 1.5 + 0.4)
        lay.line([a, b], fill=C("ink_soft", 170), width=0.9)

    if arms_up:
        a = T(44.0, body_cy + bob - 6.0)
        b = T(50.0, body_cy + bob - 15.0)
        lay.line([a, b], fill=C("cat"), width=TX(4.4))
        lay.dot(b[0], b[1], TX(2.6), C("cat_cream"))

    if tilt:
        im = lay.im.rotate(-tilt, resample=Image.BICUBIC, center=(AX * SS, feet * SS))
        lay.im = im
        lay._refresh()

    if squash != 1.0:
        im = lay.im
        newh = int(im.height * squash)
        im = im.resize((im.width, newh), Image.LANCZOS)
        canvas = Image.new("RGBA", (lay.w * SS, lay.h * SS), (0, 0, 0, 0))
        canvas.paste(im, (0, lay.h * SS - newh), im)
        lay.im = canvas
        lay._refresh()

    return lay.out()


def build_cat(big=False):
    """
    猫的动画帧表（6 列 × 2 行，单元 64×64）：
      0,1 idle | 2..5 walk | 6 jump | 7 fall | 8 crouch | 9 hurt | 10 slide | 11 land
    """
    f = []
    f.append(draw_cat(big=big, leg=0.0, eye="open", tail=0.0))
    f.append(draw_cat(big=big, leg=0.0, eye="blink", tail=0.06))
    for i in range(4):
        f.append(draw_cat(big=big, leg=i * 0.25, eye="open", tail=0.0))
    f.append(draw_cat(big=big, leg=0.0, eye="open", ear=-0.5, tail_up=True, arms_up=True))
    f.append(draw_cat(big=big, leg=0.0, eye="open", ear=0.6, tail=-0.5))
    f.append(draw_cat(big=big, leg=0.0, eye="happy", crouch=True, tail=-0.2))
    f.append(draw_cat(big=big, leg=0.0, eye="x", hurt=True, ear=-0.9, tilt=14, tail=0.4))
    f.append(draw_cat(big=big, leg=0.0, eye="open", crouch=True, tail=-0.9, squash=0.72))
    f.append(draw_cat(big=big, leg=0.0, eye="happy", squash=0.86))
    return sheet(f, CELL, CELL, cols=6)


# ===========================================================================
# 2. 原创敌人
# ===========================================================================
def draw_yarn(frame):
    """毛线球怪：一团带怒气的毛线，会滚动巡逻。"""
    lay = Layer(48, 48)
    cy, cx, r = 25.0, 24.0, 15.0
    # 脚
    for i, fx in enumerate((17.0, 31.0)):
        ph = math.sin((frame / 4 + i * 0.5) * math.pi * 2)
        lay.ell(fx + ph * 1.4, 41.0 - max(0, ph) * 1.2, 4.2, 3.0, fill=C("yarn_d"))
        lay.ell(fx + ph * 1.4, 41.6 - max(0, ph) * 1.2, 4.2, 2.6, fill=C("yarn"))
    blob(lay, cx, cy, r, r, "yarn", hi=0.30, sh=0.18)
    # 缠绕的毛线纹理
    for i in range(5):
        a = i * 72 + frame * 16
        lay.arc(cx, cy, r * 0.86, r * 0.86 * (0.42 + 0.42 * ((i % 3) / 2)), a, a + 150,
                fill=C("yarn_l"), width=1.5)
        lay.arc(cx, cy, r * 0.80, r * 0.80 * (0.38 + 0.40 * (((i + 1) % 3) / 2)),
                a + 190, a + 300, fill=C("yarn_d"), width=1.2)
    # 愤怒的眼睛（眼白收紧、瞳孔放大，避免"斗鸡眼"观感）
    for ex, sgn in ((cx - 5.0, -1), (cx + 5.0, 1)):
        lay.ell(ex, cy - 0.6, 3.3, 3.6, fill=C("white"))
        lay.ell(ex + sgn * 0.5, cy - 0.4, 2.3, 2.6, fill=C("eye"))
        lay.dot(ex + sgn * 0.5 + 0.9, cy - 1.6, 0.75, C("white"))
    # 怒眉
    lay.line([(cx - 8.2, cy - 5.6), (cx - 2.2, cy - 3.6)], fill=C("ink"), width=1.6)
    lay.line([(cx + 8.2, cy - 5.6), (cx + 2.2, cy - 3.6)], fill=C("ink"), width=1.6)
    # 咧嘴 + 小尖牙
    lay.arc(cx, cy + 3.6, 4.6, 3.4, 25, 155, fill=C("ink"), width=1.4)
    lay.poly([(cx - 2.6, cy + 4.0), (cx - 0.9, cy + 4.0), (cx - 1.75, cy + 6.6)],
             fill=C("white"), outline=C("ink"), width=0.6)
    lay.poly([(cx + 0.9, cy + 4.0), (cx + 2.6, cy + 4.0), (cx + 1.75, cy + 6.6)],
             fill=C("white"), outline=C("ink"), width=0.6)
    return lay.out()


def draw_crow(frame):
    """乌鸦：空中正弦波飞行，翅膀两拍一滑（0/2 上扬，1/3 下压）。"""
    lay = Layer(48, 48)
    up = frame in (0, 2)
    cx, cy = 24.0, 25.0 + (0.0 if up else 1.8)
    # 尾巴（画在身后）
    lay.poly([(cx - 6, cy - 1), (cx - 16, cy - 5), (cx - 14, cy + 1), (cx - 16, cy + 5),
              (cx - 6, cy + 4)], fill=C("crow_d"), outline=C("ink"), width=1.0)
    # 翅膀：上扬时翼尖朝上后方，下压时朝下后方
    tipx, tipy = cx - 9.0, (cy - 15.0 if up else cy + 10.0)
    midx, midy = cx - 1.0, (cy - 9.0 if up else cy + 6.0)
    lay.poly([(cx - 5.0, cy - 1.0), (midx, midy), (tipx, tipy), (cx - 8.5, cy + 3.0)],
             fill=C("crow_l" if up else "crow_d"), outline=C("ink"), width=1.0)
    lay.line([(cx - 5.5, cy - 0.6), (tipx + 1.5, tipy + (1.5 if up else -1.5))],
             fill=C("crow_d", 170), width=0.9)
    # 身体
    blob(lay, cx, cy, 10.8, 8.6, "crow", hi=0.26, sh=0.22)
    lay.clip(lay.mask_of(), lambda l: l.ell(cx - 1.0, cy + 3.4, 7.6, 3.6,
                                            fill=C("crow_l", 120)))
    # 头
    blob(lay, cx + 7.0, cy - 6.4, 6.6, 6.2, "crow", hi=0.30, sh=0.16)
    # 喙
    lay.poly([(cx + 12.2, cy - 7.0), (cx + 20.0, cy - 4.4), (cx + 12.2, cy - 2.2)],
             fill=C("crow_beak"), outline=C("ink"), width=1.0)
    # 眼睛（凶）
    lay.ell(cx + 8.6, cy - 7.8, 3.0, 3.1, fill=C("white"))
    lay.ell(cx + 9.2, cy - 7.6, 1.8, 2.0, fill=C("eye"))
    lay.line([(cx + 5.0, cy - 11.2), (cx + 11.4, cy - 9.6)], fill=C("ink"), width=1.6)
    return lay.out()


def draw_fish(frame):
    """跳跳鱼：从水里弹跳出来的鱼，尾巴摆动。"""
    lay = Layer(48, 48)
    cx, cy = 24.0, 26.0
    wag = math.sin(frame / 4 * math.pi * 2)
    # 尾鳍
    lay.poly([(cx - 11, cy), (cx - 20, cy - 7 + wag * 3), (cx - 18, cy),
              (cx - 20, cy + 7 + wag * 3)], fill=C("fish_d"), outline=C("ink"), width=1.0)
    blob(lay, cx, cy, 12.0, 9.0, "fish", hi=0.30, sh=0.20)
    # 背鳍
    lay.poly([(cx - 3, cy - 8), (cx + 3, cy - 15 - wag * 1.5), (cx + 7, cy - 7)],
             fill=C("fish_d"), outline=C("ink"), width=1.0)
    # 腹鳍
    lay.poly([(cx - 1, cy + 7), (cx + 2, cy + 13), (cx + 6, cy + 6)],
             fill=C("fish_d"), outline=C("ink"), width=1.0)
    # 鳞片
    for i, ox in enumerate((-4.0, 1.0, 6.0)):
        lay.arc(cx + ox, cy, 3.0, 3.0, 200, 340, fill=C("fish_l"), width=1.2)
    # 眼睛（无辜大眼，伪装无害）
    lay.ell(cx + 6.4, cy - 2.4, 4.0, 4.2, fill=C("white"))
    lay.ell(cx + 7.4, cy - 2.2, 2.3, 2.5, fill=C("eye"))
    lay.dot(cx + 8.2, cy - 3.4, 0.9, C("white"))
    # 嘴
    lay.arc(cx + 11.6, cy + 2.6, 2.4, 2.0, 30, 160, fill=C("ink_soft"), width=1.1)
    return lay.out()


def draw_mush(frame):
    """蘑菇陷阱怪：伪装成蘑菇道具，靠近就扑上来（假道具真陷阱）。"""
    lay = Layer(48, 48)
    pounce = frame >= 2
    dy = 2.0 if pounce else 0.0
    # 腿
    for i, fx in enumerate((18.0, 30.0)):
        ph = math.sin((frame / 2 + i * 0.5) * math.pi * 2) if not pounce else 0
        lay.ell(fx + ph * 1.6, 41.0 + dy, 4.4, 3.2, fill=C("mush_d"))
    # 菌柄
    rblob(lay, (16.0, 26.0 + dy, 32.0, 42.0 + dy), 6.0, "white" if False else "cat_cream",
          hi=0.5, sh=0.10)
    # 眼睛 + 尖牙（藏在菌盖阴影下，制造"看清了才发现很凶"的观感）
    for ex in (20.0, 28.0):
        lay.ell(ex, 31.0 + dy, 3.2, 3.4, fill=C("white"))
        lay.ell(ex, 31.4 + dy, 1.9, 2.1, fill=C("eye"))
    lay.poly([(21.6, 36.0 + dy), (23.4, 36.0 + dy), (22.5, 39.4 + dy)],
             fill=C("white"), outline=C("ink"), width=0.7)
    lay.poly([(24.6, 36.0 + dy), (26.4, 36.0 + dy), (25.5, 39.4 + dy)],
             fill=C("white"), outline=C("ink"), width=0.7)
    # 菌盖
    cap = Layer(48, 48)
    cap.pie(24.0, 26.0 + dy, 18.0, 16.5, 180, 360, fill=C("mush"))
    cap.rrect((6.0, 24.4 + dy, 42.0, 29.0 + dy), 2.0, fill=C("mush"))
    capmask = cap.mask_of()
    cap.clip(capmask, lambda l: l.pie(24.0, 24.0 + dy, 17.0, 15.0, 190, 350,
                                      fill=C("mush_l")))
    for sx_, sy_, sr in ((15.0, 19.0, 3.6), (31.0, 17.5, 3.0), (24.0, 12.5, 2.7),
                         (10.5, 25.5, 2.4), (37.0, 25.0, 2.6)):
        cap.ell(sx_, sy_ + dy, sr, sr * 0.85, fill=C("white"))
    cap.pie(24.0, 26.0 + dy, 18.0, 16.5, 180, 360, outline=C("ink"), width=1.3)
    cap.line([(6.0, 26.6 + dy), (42.0, 26.6 + dy)], fill=C("ink"), width=1.3)
    lay.paste(cap)
    return lay.out()


# ===========================================================================
# 3. 道具
# ===========================================================================
def draw_goldfish(frame):
    """金鱼收集品（对应经典"金币"）。"""
    lay = Layer(32, 32)
    cx, cy = 15.0, 16.0
    wag = math.sin(frame / 4 * math.pi * 2)
    lay.poly([(cx - 7, cy), (cx - 14, cy - 5 + wag * 2), (cx - 12, cy),
              (cx - 14, cy + 5 + wag * 2)], fill=C("gold_d"), outline=C("ink"), width=1.0)
    blob(lay, cx, cy, 8.4, 6.6, "gold", hi=0.34, sh=0.18)
    lay.poly([(cx - 2, cy - 6), (cx + 1.5, cy - 11), (cx + 4, cy - 5)],
             fill=C("gold_d"), outline=C("ink"), width=0.9)
    lay.ell(cx + 4.0, cy - 1.4, 2.6, 2.8, fill=C("white"))
    lay.ell(cx + 4.6, cy - 1.2, 1.5, 1.7, fill=C("eye"))
    lay.arc(cx + 7.4, cy + 2.2, 1.8, 1.5, 30, 150, fill=C("ink_soft"), width=1.0)
    return lay.out()


def draw_star(frame):
    """无敌星（短暂无敌 + 秒杀敌人）。"""
    lay = Layer(32, 32)
    cx, cy = 16.0, 16.5
    wob = 1.0 + 0.16 * math.sin(frame / 4 * math.pi * 2)
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = 13.0 if i % 2 == 0 else 6.0
        pts.append((cx + math.cos(a) * r * wob, cy + math.sin(a) * r * wob))
    lay.poly(pts, fill=C("star"), outline=C("ink"), width=1.2)
    lay.poly([(cx - 3, cy - 4), (cx + 1, cy - 4), (cx - 1, cy + 2)], fill=C("star_l"))
    for ex in (cx - 3.4, cx + 3.4):
        lay.ell(ex, cy + 1.2, 1.9, 2.1, fill=C("eye"))
    lay.arc(cx, cy + 3.6, 3.0, 2.4, 20, 160, fill=C("ink"), width=1.1)
    return lay.out()


def draw_can(frame):
    """鱼罐头（变大猫道具）—— 罐身标签上有一条清晰可辨的小鱼。"""
    lay = Layer(32, 32)
    glint = frame % 4
    # 罐体
    lay.rrect((7.0, 5.0, 25.0, 28.0), 3.0, fill=C("can_d"))
    lay.rrect((7.0, 6.0, 25.0, 26.5), 3.0, fill=C("can"))
    # 标签
    lay.rrect((7.0, 10.0, 25.0, 23.0), 0, fill=(244, 178, 132, 255))
    lay.rrect((7.0, 10.0, 25.0, 13.0), 0, fill=(255, 206, 164, 255))
    # 标签上的小鱼（放大到能一眼认出）
    lay.poly([(10.0, 16.5), (6.6, 13.4), (6.6, 19.6)], fill=C("gold_d"))
    lay.ell(15.5, 16.5, 5.4, 3.9, fill=C("gold"))
    lay.ell(15.5, 15.2, 4.2, 1.8, fill=C("gold_l"))
    lay.ell(18.2, 15.4, 1.5, 1.6, fill=C("white"))
    lay.ell(18.6, 15.4, 0.9, 1.0, fill=C("eye"))
    # 罐顶金属盖
    lay.rrect((7.0, 5.0, 25.0, 10.5), 3.0, fill=C("can_l"))
    lay.rrect((7.0, 9.0, 25.0, 10.5), 0, fill=C("can_d", 180))
    lay.rrect((7.0, 5.0, 25.0, 28.0), 3.0, outline=C("ink"), width=1.2)
    # 金属反光扫过
    lay.line([(9.0, 7.0 + glint * 5), (13.0, 7.0 + glint * 5)], fill=C("white"), width=1.4)
    return lay.out()


# ===========================================================================
# 4. 瓦片（48×48，全出血，无缝拼接）
# ===========================================================================
TS = 48


def tile_base(fill_key, top_key=None, bot_key=None):
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C(fill_key))
    return lay


def ground_layer(top=True):
    """返回一个"草地/泥土"瓦片的 Layer（未降采样），方便被其它瓦片复用。"""
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("dirt"))
    # 泥土颗粒
    import random as _r
    rng = _r.Random(7 if top else 11)
    for _ in range(9):
        x = rng.uniform(4, TS - 4)
        y = rng.uniform(16 if top else 4, TS - 4)
        r = rng.uniform(1.6, 3.2)
        lay.ell(x, y, r, r * 0.8, fill=C("dirt_d", 150))
    for _ in range(5):
        x = rng.uniform(6, TS - 6)
        y = rng.uniform(18 if top else 6, TS - 5)
        lay.ell(x, y, 1.5, 1.2, fill=C("dirt_l", 170))
    if top:
        # 草地帽，顶边带一点点起伏
        cap = Layer(TS, TS)
        cap.rrect((0, 0, TS, 17.0), 0, fill=C("grass"))
        capmask = cap.mask_of()
        cap.clip(capmask, lambda l: l.rrect((0, 11.0, TS, 17.0), 0, fill=C("grass_d")))
        cap.clip(capmask, lambda l: l.rrect((0, 0.5, TS, 5.0), 0, fill=C("grass_l")))
        for i, x in enumerate((7.0, 24.0, 41.0)):
            h = 3.2 if i % 2 == 0 else 2.4
            cap.poly([(x - 4, 0), (x, -h), (x + 4, 0)], fill=C("grass_l"))
        cap.line([(0, 16.6), (TS, 16.6)], fill=C("grass_d"), width=1.4)
        lay.paste(cap)
    return lay


def tile_ground(top=True):
    return ground_layer(top).out()


def tile_brick():
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("brick"))
    bh = 12.0
    for row in range(4):
        y = row * bh
        off = 0.0 if row % 2 == 0 else 12.0
        for cx in range(-1, 3):
            x = cx * 24.0 + off
            lay.rrect((x + 1.2, y + 1.2, x + 22.8, y + bh - 1.2), 2.2, fill=C("brick"))
            lay.line([(x + 1.2, y + 2.6), (x + 22.8, y + 2.6)], fill=C("brick_l"), width=1.0)
            lay.line([(x + 1.2, y + bh - 2.2), (x + 22.8, y + bh - 2.2)],
                     fill=C("brick_d"), width=1.0)
    for row in range(4):
        y = row * bh
        lay.line([(0, y), (TS, y)], fill=C("brick_d"), width=1.2)
    lay.rrect((0, 0, TS, TS), 0, outline=C("brick_d", 200), width=1.2)
    return lay.out()


def tile_stone():
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("stone"))
    lay.rrect((2.5, 2.5, TS - 2.5, TS - 2.5), 4.0, fill=C("stone"))
    lay.rrect((4.5, 4.5, TS - 4.5, 14.0), 3.0, fill=C("stone_l", 150))
    lay.rrect((4.5, TS - 13.0, TS - 4.5, TS - 4.5), 3.0, fill=C("stone_d", 130))
    for x, y, r in ((14.0, 30.0, 2.4), (32.0, 22.0, 2.0), (22.0, 38.0, 1.8)):
        lay.ell(x, y, r, r * 0.85, fill=C("stone_d", 120))
    lay.rrect((0, 0, TS, TS), 0, outline=C("stone_d", 190), width=1.4)
    lay.rrect((1.4, 1.4, TS - 1.4, TS - 1.4), 4.0, outline=C("stone_d", 160), width=1.0)
    return lay.out()


def tile_question(used=False, frame=0):
    lay = Layer(TS, TS)
    if used:
        lay.rrect((0, 0, TS, TS), 0, fill=C("dirt_d"))
        lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 4.0, fill=(150, 106, 74, 255))
        lay.rrect((0, 0, TS, TS), 0, outline=C("dirt_d"), width=1.4)
        return lay.out()
    lay.rrect((0, 0, TS, TS), 0, fill=C("q_d"))
    lay.rrect((1.6, 1.6, TS - 1.6, TS - 1.6), 5.0, fill=C("q"))
    lay.rrect((3.4, 3.4, TS - 3.4, 16.0), 4.0, fill=C("q_l", 190))
    # 铆钉
    for x, y in ((6.5, 6.5), (TS - 6.5, 6.5), (6.5, TS - 6.5), (TS - 6.5, TS - 6.5)):
        lay.dot(x, y, 1.9, C("q_d"))
    # 问号
    dx = 0.0
    gl = (frame % 3)
    lay.arc(24.0 + dx, 19.0, 7.0, 7.2, 160, 400, fill=C("ink"), width=3.4)
    lay.line([(24.0 + dx, 25.6), (24.0 + dx, 29.4)], fill=C("ink"), width=3.4)
    lay.dot(24.0 + dx, 34.4, 2.1, C("ink"))
    lay.rrect((0, 0, TS, TS), 0, outline=C("q_d", 210), width=1.4)
    return lay.out()


def _pipe_piece(with_rim):
    """
    先整体画一段"两格宽"的管道（96×48），再切成左右两格 ——
    这样管身的高光/暗面在瓦片接缝处天然连续，不会出现竖直接缝。
    """
    W = TS * 2
    lay = Layer(W, TS)
    body_top = 20.0 if with_rim else 0.0
    if with_rim:
        # 管口：比管身略宽（左右各外扩 3px）
        rim = Layer(W, TS)
        rim.rrect((0, 0, W, 20.0), 5.0, fill=C("pipe"))
        rmask = rim.mask_of()
        rim.clip(rmask, lambda l: l.rrect((0, 12.0, W, 20.0), 0, fill=C("pipe_d")))
        rim.clip(rmask, lambda l: l.rrect((5.0, 2.0, W * 0.42, 15.0), 4.0,
                                          fill=C("pipe_l", 200)))
        rim.clip(rmask, lambda l: l.rrect((W - 14.0, 3.0, W - 6.0, 15.0), 3.0,
                                          fill=C("pipe_d", 110)))
        rim.rrect((0, 0, W, 20.0), 5.0, outline=C("pipe_d", 220), width=1.3)
        lay.paste(rim)
    # 管身
    body = Layer(W, TS)
    body.rrect((4.0, body_top, W - 4.0, TS), 0, fill=C("pipe"))
    bmask = body.mask_of()
    body.clip(bmask, lambda l: l.rrect((W - 22.0, body_top, W - 4.0, TS), 0,
                                       fill=C("pipe_d")))
    body.clip(bmask, lambda l: l.rrect((8.0, body_top, 20.0, TS), 0, fill=C("pipe_l", 210)))
    body.clip(bmask, lambda l: l.rrect((W - 8.0, body_top, W - 4.0, TS), 0,
                                       fill=C("pipe_d", 160)))
    # 只描左右两条竖边（上下边缘留给相邻瓦片，避免出现横向接缝）
    body.line([(4.0, body_top), (4.0, TS)], fill=C("pipe_d", 200), width=1.3)
    body.line([(W - 4.0, body_top), (W - 4.0, TS)], fill=C("pipe_d", 200), width=1.3)
    if with_rim:
        body.line([(4.0, body_top), (W - 4.0, body_top)], fill=C("pipe_d", 200), width=1.3)
    lay.paste(body)
    return lay.out()


def tile_pipe_set():
    """返回 (tl, tr, bl, br) 四张瓦片。"""
    top = _pipe_piece(True)
    bot = _pipe_piece(False)
    return (top.crop((0, 0, TS, TS)), top.crop((TS, 0, TS * 2, TS)),
            bot.crop((0, 0, TS, TS)), bot.crop((TS, 0, TS * 2, TS)))


def tile_crumble(frame=0, ground=False):
    """
    踩上去 0.3 秒后碎裂消失的地板。
    ground=True 的版本外观与"草地"完全一致 —— 这正是"地板消失陷阱"的关键：
    它摆在平地上时，玩家根本看不出脚下有诈。
    frame 0 = 完好, 1 = 裂纹, 2 = 严重裂纹
    """
    lay = Layer(TS, TS)
    if ground:
        # 直接复用草地瓦片的画法，保证与真实地面像素级一致
        lay.im = ground_layer(True).im.copy()
        lay._refresh()
    else:
        lay.rrect((0, 0, TS, TS), 0, fill=C("stone"))
        lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 3.0, fill=C("stone"))
        lay.rrect((3.5, 3.5, TS - 3.5, 12.0), 3.0, fill=C("stone_l", 160))
        lay.rrect((0, 0, TS, TS), 0, outline=C("stone_d", 200), width=1.4)

    crack_col = C("dirt_d") if ground else C("stone_d")
    cracks = [
        [(6, 20), (16, 28), (12, 36), (20, 46)],
        [(42, 19), (32, 26), (38, 34), (30, 44)],
        [(20, 46), (26, 38), (34, 46)],
        [(6, 20), (14, 24), (22, 20)],
    ]
    n = 1 if frame == 0 else (2 if frame == 1 else 4)
    for c in cracks[:n]:
        lay.line(c, fill=crack_col, width=1.8)
    if frame >= 2:
        lay.line([(16, 28), (26, 32), (34, 26)], fill=crack_col, width=1.5)
    return lay.out()


def tile_spike():
    lay = Layer(TS, TS)
    for i in range(3):
        x = 8.0 + i * 16.0
        lay.poly([(x - 7, 46), (x, 10), (x + 7, 46)], fill=C("spike"),
                 outline=C("spike_d"), width=1.2)
        lay.poly([(x - 3.2, 44), (x - 0.6, 16), (x + 0.6, 44)], fill=C("white", 190))
    lay.rrect((0, 42, TS, TS), 0, fill=C("spike_d"))
    return lay.out()


def tile_lava(frame=0):
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("lava_d"))
    wave = Layer(TS, TS)
    wave.rrect((0, 6, TS, TS), 0, fill=C("lava"))
    wmask = wave.mask_of()
    for i in range(3):
        off = (frame * 4 + i * 16) % TS
        wave.ell(off - 8, 7.0, 12.0, 3.6, fill=C("lava"))
        wave.ell(off + 6, 7.0, 12.0, 3.6, fill=C("lava"))
    wave.clip(wmask, lambda l: l.rrect((0, 14, TS, TS), 0, fill=C("lava_d", 90)))
    lay.paste(wave)
    for i in range(3):
        x = 8.0 + i * 16.0 + (frame * 3) % 16
        lay.ell(x, 4.0, 4.0, 2.2, fill=C("lava_l", 200))
    return lay.out()


def tile_invisible():
    """隐形砖块的"提示版本"—— 只在关卡编辑器/调试模式下显示。"""
    lay = Layer(TS, TS)
    lay.rrect((2, 2, TS - 2, TS - 2), 4.0, fill=(255, 255, 255, 26),
              outline=(255, 255, 255, 90), width=1.2)
    return lay.out()


def tile_conveyor():
    """隐藏向下传送带（视觉上和高台一模一样，见 trap 文档）。"""
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("stone"))
    lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 3.0, fill=C("stone"))
    for i in range(3):
        y = 10.0 + i * 13.0
        lay.poly([(10, y), (18, y + 5), (10, y + 10)], fill=C("stone_d", 180))
        lay.poly([(24, y), (32, y + 5), (24, y + 10)], fill=C("stone_d", 180))
    lay.rrect((0, 0, TS, TS), 0, outline=C("stone_d", 190), width=1.4)
    return lay.out()


def tile_water(frame=0):
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=(74, 150, 214, 210))
    for i in range(2):
        off = (frame * 5 + i * 24) % TS
        lay.arc(off, 10.0, 14.0, 5.0, 190, 350, fill=(180, 226, 255, 210), width=1.6)
        lay.arc(off + 20, 30.0, 14.0, 5.0, 190, 350, fill=(180, 226, 255, 150), width=1.4)
    return lay.out()


# ===========================================================================
# 5. 视差背景 & 天空装饰
# ===========================================================================
BW, BH = 960, 540


def bg_sky():
    lay = Layer(BW, BH)
    for y in range(BH):
        t = y / (BH - 1)
        if t < 0.62:
            col = mix("sky_top", "sky_mid", t / 0.62)
        else:
            col = mix("sky_mid", "sky_bot", (t - 0.62) / 0.38)
        lay.d.rectangle([0, y * SS, BW * SS, (y + 1) * SS], fill=col)
    return lay.out()


def _wrap(lay, fn):
    """在 x-960 / x / x+960 三个位置各画一次，实现横向无缝平铺。"""
    for dx in (-BW, 0, BW):
        fn(lay, dx)


def bg_far():
    """远景：柔软丘陵 + 大朵云（可横向无缝平铺）。"""
    lay = Layer(BW, BH)
    for cx, cy, rx, ry, k in ((150.0, 470.0, 260.0, 150.0, "hill_far"),
                              (620.0, 480.0, 320.0, 165.0, "hill_far"),
                              (900.0, 470.0, 220.0, 140.0, "hill_far")):
        _wrap(lay, lambda l, dx, cx=cx, cy=cy, rx=rx, ry=ry, k=k: l.ell(
            cx + dx, cy, rx, ry, fill=C(k)))
    for cx, cy, s in ((230.0, 130.0, 1.0), (700.0, 90.0, 0.75), (520.0, 210.0, 0.55),
                      (60.0, 180.0, 0.6), (880.0, 160.0, 0.85)):
        def cloud(l, dx, cx=cx, cy=cy, s=s):
            for ox, oy, r in ((-38, 6, 26), (0, -8, 34), (40, 4, 27), (14, 12, 24),
                              (-16, 12, 22)):
                l.ell(cx + dx + ox * s, cy + oy * s, r * s, r * s * 0.80, fill=C("cloud_lo"))
            for ox, oy, r in ((-30, 2, 22), (2, -12, 27), (34, 0, 21)):
                l.ell(cx + dx + ox * s, cy + oy * s, r * s, r * s * 0.78, fill=C("cloud_hi"))
        _wrap(lay, cloud)
    return lay.out()


def bg_mid():
    """中景：树木与灌木（可横向无缝平铺）。"""
    lay = Layer(BW, BH)

    def tree(l, dx, x, base, s):
        l.rrect((x - 9 * s + dx, base - 96 * s, x + 9 * s + dx, base), 5 * s, fill=C("trunk"))
        l.rrect((x - 9 * s + dx, base - 96 * s, x - 3 * s + dx, base), 4 * s, fill=C("trunk_d", 160))
        for ox, oy, r in ((-26, -108, 40), (26, -112, 42), (0, -140, 46), (0, -96, 44),
                          (-46, -78, 30), (46, -80, 31)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.92, fill=C("leaf_d"))
        for ox, oy, r in ((-22, -118, 32), (22, -122, 34), (0, -150, 36), (-2, -104, 34)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.90, fill=C("leaf"))
        for ox, oy, r in ((-26, -128, 17), (8, -156, 19)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.86, fill=C("leaf_l", 210))

    def bush(l, dx, x, base, s):
        for ox, oy, r in ((-30, -14, 30), (0, -26, 38), (32, -12, 28), (14, -6, 24),
                          (-14, -4, 24)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.86, fill=C("hill_near"))
        for ox, oy, r in ((-18, -24, 18), (10, -34, 20)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.82, fill=C("leaf_l", 170))

    for x, base, s in ((120.0, 540.0, 1.0), (455.0, 540.0, 0.72), (790.0, 540.0, 1.12)):
        _wrap(lay, lambda l, dx, x=x, base=base, s=s: tree(l, dx, x, base, s))
    for x, s in ((300.0, 1.0), (640.0, 0.8), (930.0, 1.1), (20.0, 0.9)):
        _wrap(lay, lambda l, dx, x=x, s=s: bush(l, dx, x, 540.0, s))
    return lay.out()


def deco_cloud(evil=False):
    lay = Layer(128, 64)
    if evil:
        # "伪装天空掉落物"：形状与普通云朵几乎一致，只是颜色略微阴冷 + 一点凶相
        col_lo, col_hi = (186, 198, 222), (226, 232, 246)
    else:
        col_lo, col_hi = P["cloud_lo"], P["cloud_hi"]
    for ox, oy, r in ((-34, 10, 22), (0, -4, 30), (34, 8, 24), (12, 16, 20), (-14, 16, 19)):
        lay.ell(64 + ox, 34 + oy, r, r * 0.80, fill=col_lo + (255,))
    for ox, oy, r in ((-28, 6, 19), (2, -10, 24), (30, 4, 19)):
        lay.ell(64 + ox, 34 + oy, r, r * 0.78, fill=col_hi + (255,))
    if evil:
        for ex in (52.0, 76.0):
            lay.ell(ex, 30.0, 4.2, 4.6, fill=C("white"))
            lay.ell(ex, 30.6, 2.5, 2.8, fill=C("eye"))
            lay.line([(ex - 4.6, 23.6), (ex + 4.2, 26.2)], fill=C("ink"), width=1.8)
            lay.line([(ex + 4.6, 23.6), (ex - 4.2, 26.2)], fill=C("ink"), width=1.8)
    return lay.out()


def deco_sun(evil=False):
    lay = Layer(96, 96)
    if evil:
        rays = (238, 150, 92)
        core = (246, 176, 108)
    else:
        rays = (250, 214, 116)
        core = P["star"]
    for i in range(12):
        a = i * 30 * math.pi / 180
        r0, r1 = 26.0, 44.0
        w = 8.0 if i % 2 == 0 else 5.0
        px, py = 48 + math.cos(a) * r0, 48 + math.sin(a) * r0
        qx, qy = 48 + math.cos(a) * r1, 48 + math.sin(a) * r1
        nx, ny = -math.sin(a), math.cos(a)
        lay.poly([(px + nx * w, py + ny * w), (qx, qy), (px - nx * w, py - ny * w)],
                 fill=rays + (255,))
    lay.ell(48, 48, 30.0, 30.0, fill=core + (255,))
    lay.ell(44, 43, 20.0, 18.0, fill=shade(core, 0.30))
    if evil:
        for ex in (38.0, 58.0):
            lay.ell(ex, 46.0, 5.0, 5.4, fill=C("white"))
            lay.ell(ex, 46.6, 3.0, 3.3, fill=C("eye"))
            lay.line([(ex - 6.0, 36.0), (ex + 5.0, 40.0)], fill=C("ink"), width=2.2)
        lay.arc(48, 62, 12.0, 8.0, 20, 160, fill=C("ink"), width=2.4)
    else:
        for ex in (38.0, 58.0):
            lay.ell(ex, 47.0, 3.4, 3.8, fill=C("eye"))
        lay.arc(48, 54, 10.0, 8.0, 20, 160, fill=C("ink_soft"), width=2.0)
    return lay.out()


# ===========================================================================
# 6. 终点旗杆 / UI
# ===========================================================================
def draw_flagpole():
    """小鱼旗杆：杆 + 会上下浮动的小鱼旗（"假通关"陷阱的载体）。"""
    lay = Layer(64, 192)
    lay.rrect((28, 6, 36, 192), 3.0, fill=C("stone"))
    lay.rrect((28, 6, 31, 192), 2.0, fill=C("stone_l"))
    lay.rrect((28, 6, 36, 192), 3.0, outline=C("stone_d"), width=1.2)
    lay.ell(32, 8, 8.0, 8.0, fill=C("gold"), outline=C("ink"), width=1.2)
    lay.ell(29.5, 5.5, 3.0, 2.6, fill=C("gold_l"))
    return lay.out()


def draw_flagfish(frame=0):
    lay = Layer(72, 48)
    bob = math.sin(frame / 4 * math.pi * 2) * 2.0
    cx, cy = 34.0, 24.0 + bob
    lay.poly([(cx - 8, cy), (cx - 18, cy - 8 + bob), (cx - 16, cy), (cx - 18, cy + 8 + bob)],
             fill=C("gold_d"), outline=C("ink"), width=1.1)
    blob(lay, cx, cy, 13.0, 9.0, "gold", hi=0.32, sh=0.18)
    lay.poly([(cx - 3, cy - 8), (cx + 1, cy - 15), (cx + 5, cy - 7)],
             fill=C("gold_d"), outline=C("ink"), width=1.0)
    lay.ell(cx + 6.0, cy - 2.0, 3.4, 3.6, fill=C("white"))
    lay.ell(cx + 6.8, cy - 1.8, 2.0, 2.2, fill=C("eye"))
    lay.arc(cx + 11.0, cy + 3.0, 2.4, 2.0, 30, 150, fill=C("ink_soft"), width=1.1)
    lay.rrect((cx - 14, cy - 11, cx - 8, cy + 11), 2.0, fill=C("gold_d"))
    return lay.out()


def ui_panel():
    """圆角卡片（9-slice 用，四角 18px 不拉伸）。"""
    lay = Layer(96, 96)
    lay.rrect((1, 1, 95, 95), 20.0, fill=(255, 253, 250, 240), outline=(226, 214, 200, 255),
              width=2.0)
    lay.rrect((5, 5, 91, 46), 16.0, fill=(255, 255, 255, 120))
    return lay.out()


def ui_icon(kind):
    lay = Layer(32, 32)
    if kind == "coin":
        lay.ell(16, 16, 12.0, 12.0, fill=C("gold_d"))
        lay.ell(16, 16, 10.0, 10.0, fill=C("gold"))
        lay.ell(12.5, 12.0, 3.4, 3.0, fill=C("gold_l"))
        lay.rrect((14.5, 10.0, 17.5, 22.0), 1.4, fill=C("gold_d"))
    elif kind == "skull":
        lay.ell(16, 14.5, 11.0, 10.5, fill=C("white"))
        lay.rrect((11.0, 20.0, 21.0, 26.5), 3.0, fill=C("white"))
        for ex in (11.8, 20.2):
            lay.ell(ex, 14.0, 3.2, 3.6, fill=C("eye"))
        lay.poly([(16, 18.0), (14.0, 21.4), (18.0, 21.4)], fill=C("eye"))
        for x in (13.0, 16.0, 19.0):
            lay.line([(x, 22.0), (x, 26.0)], fill=(214, 206, 198, 255), width=1.3)
    elif kind == "cat":
        lay.ell(16, 17.0, 12.0, 11.0, fill=C("cat"))
        for ex in (6.5, 25.5):
            lay.poly([(ex - 4.0, 10.0), (ex, 1.0), (ex + 4.0, 10.0)], fill=C("cat"))
        for ex in (11.5, 20.5):
            lay.ell(ex, 16.0, 3.0, 3.4, fill=C("eye"))
            lay.dot(ex + 0.6, 15.0, 1.0, C("white"))
        lay.poly([(14.6, 20.4), (17.4, 20.4), (16, 22.6)], fill=C("pink_d"))
        for dx in (-1, 1):
            lay.line([(16 + dx * 5, 21.0), (16 + dx * 12, 20.0)], fill=C("ink_soft"), width=1.0)
    elif kind == "clock":
        lay.ell(16, 16, 12.0, 12.0, fill=C("white"), outline=C("stone_d"), width=2.0)
        lay.line([(16, 16), (16, 8.5)], fill=C("ink"), width=2.0)
        lay.line([(16, 16), (21.5, 19.0)], fill=C("ink"), width=2.0)
    return lay.out()


def app_icon():
    """macOS App 图标（512×512）：猫脸 + 恶搞感的斜眼笑。"""
    S = 512
    lay = Layer(S, S)
    lay.rrect((0, 0, S, S), 96.0, fill=(255, 214, 140, 255))
    lay.clip(lay.mask_of(), lambda l: l.ell(S * 0.5, S * 1.02, S * 0.56, S * 0.42,
                                            fill=(255, 190, 106, 255)))
    for ex in (S * 0.28, S * 0.72):
        lay.poly([(ex - 78, 250), (ex, 108), (ex + 78, 250)], fill=C("cat"),
                 outline=C("ink"), width=9)
        lay.poly([(ex - 42, 240), (ex, 156), (ex + 44, 240)], fill=C("pink"))
    lay.ell(S * 0.5, 300, 190, 172, fill=C("cat"), outline=C("ink"), width=10)
    lay.ell(S * 0.5, 352, 158, 108, fill=C("cat_cream"))
    for ex in (S * 0.36, S * 0.64):
        lay.ell(ex, 286, 46, 52, fill=C("white"))
        lay.ell(ex, 292, 27, 30, fill=C("eye"))
        lay.dot(ex + 10, 274, 12, C("white"))
    lay.line([(S * 0.36 - 66, 232), (S * 0.36 + 46, 254)], fill=C("ink"), width=14)
    lay.line([(S * 0.64 + 66, 232), (S * 0.64 - 46, 254)], fill=C("ink"), width=14)
    lay.poly([(S * 0.5 - 26, 344), (S * 0.5 + 26, 344), (S * 0.5, 372)], fill=C("pink_d"))
    lay.arc(S * 0.5, 386, 74, 46, 20, 160, fill=C("ink"), width=12)
    for dx in (-1, 1):
        for dy in (-14, 0, 14):
            lay.line([(S * 0.5 + dx * 66, 366 + dy), (S * 0.5 + dx * 176, 356 + dy * 1.5)],
                     fill=C("ink_soft"), width=5)
    return lay.out()


# ===========================================================================
# 7. 主流程
# ===========================================================================
def gen_sprites():
    save(sheet([draw_cat(big=False, leg=0, eye="open")], CELL, CELL, 1), "sprites", "_probe.png")
    save(build_cat(False), "sprites", "cat_small.png")
    save(build_cat(True), "sprites", "cat_big.png")
    save(sheet([draw_yarn(i) for i in range(4)], 48, 48), "sprites", "enemy_yarn.png")
    save(sheet([draw_crow(i) for i in range(4)], 48, 48), "sprites", "enemy_crow.png")
    save(sheet([draw_fish(i) for i in range(4)], 48, 48), "sprites", "enemy_fish.png")
    save(sheet([draw_mush(i) for i in range(4)], 48, 48), "sprites", "enemy_mushroom.png")
    save(sheet([draw_goldfish(i) for i in range(4)], 32, 32), "sprites", "item_goldfish.png")
    save(sheet([draw_star(i) for i in range(4)], 32, 32), "sprites", "item_star.png")
    save(sheet([draw_can(i) for i in range(4)], 32, 32), "sprites", "item_can.png")
    save(draw_flagpole(), "sprites", "goal_pole.png")
    save(sheet([draw_flagfish(i) for i in range(4)], 72, 48), "sprites", "goal_flagfish.png")
    os.remove(os.path.join(ASSETS, "sprites", "_probe.png"))


def gen_tiles():
    save(tile_ground(True), "tiles", "ground_top.png")
    save(tile_ground(False), "tiles", "ground_fill.png")
    save(tile_brick(), "tiles", "brick.png")
    save(tile_stone(), "tiles", "stone.png")
    save(sheet([tile_question(False, i) for i in range(3)], TS, TS), "tiles", "question.png")
    save(tile_question(True), "tiles", "question_used.png")
    tl, tr, bl, br = tile_pipe_set()
    for part, im in (("tl", tl), ("tr", tr), ("bl", bl), ("br", br)):
        save(im, "tiles", f"pipe_{part}.png")
    save(sheet([tile_crumble(i) for i in range(3)], TS, TS), "tiles", "crumble.png")
    save(sheet([tile_crumble(i, ground=True) for i in range(3)], TS, TS),
         "tiles", "crumble_ground.png")
    save(tile_spike(), "tiles", "spike.png")
    save(sheet([tile_lava(i) for i in range(4)], TS, TS), "tiles", "lava.png")
    save(tile_invisible(), "tiles", "invisible.png")
    save(tile_conveyor(), "tiles", "conveyor.png")
    save(sheet([tile_water(i) for i in range(4)], TS, TS), "tiles", "water.png")


def gen_bg():
    save(bg_sky(), "ui", "bg_sky.png")
    save(bg_far(), "ui", "bg_far.png")
    save(bg_mid(), "ui", "bg_mid.png")
    save(deco_cloud(False), "ui", "cloud_soft.png")
    save(deco_cloud(True), "ui", "cloud_evil.png")
    save(deco_sun(False), "ui", "sun_soft.png")
    save(deco_sun(True), "ui", "sun_evil.png")


def gen_ui():
    save(ui_panel(), "ui", "panel.png")
    for k in ("coin", "skull", "cat", "clock"):
        save(ui_icon(k), "ui", f"icon_{k}.png")
    save(app_icon(), "ui", "appicon.png")


def gen_preview():
    """产出《美术风格小样》—— 供确认风格用的静态预览图。"""
    W, H = 1280, 1000
    lay = Layer(W, H)
    lay.rrect((0, 0, W, H), 0, fill=(248, 245, 240, 255))
    # 顶部色带
    lay.rrect((0, 0, W, 96), 0, fill=(58, 46, 50, 255))
    lay.ell(70, 48, 26, 26, fill=C("cat"))
    lay.poly([(50, 34), (56, 8), (68, 30)], fill=C("cat"))
    lay.poly([(90, 30), (102, 8), (108, 34)], fill=C("cat"))
    lay.ell(62, 46, 6, 7, fill=C("eye"))
    lay.ell(84, 46, 6, 7, fill=C("eye"))
    lay.poly([(70, 54), (78, 54), (74, 62)], fill=C("pink_d"))

    def txt(x, y, s, size=20, fill=(58, 46, 50, 255)):
        from PIL import ImageFont
        for cand in ("/System/Library/Fonts/PingFang.ttc",
                     "/System/Library/Fonts/Helvetica.ttc",
                     "/System/Library/Fonts/Supplemental/Arial.ttf"):
            if os.path.exists(cand):
                try:
                    f = ImageFont.truetype(cand, size * SS)
                    lay.d.text((x * SS, y * SS), s, font=f, fill=fill)
                    return
                except Exception:
                    continue
        lay.d.text((x * SS, y * SS), s, fill=fill)

    txt(120, 26, "猫咪历险记  Cat's Perilous Adventure", 30, (255, 236, 214, 255))
    txt(120, 62, "ART STYLE SAMPLE  ·  高分辨率扁平卡通 · 48px 瓦片 / 64px 角色", 15,
        (196, 178, 170, 255))

    def paste_center(img, cx, cy, scale=1):
        if scale != 1:
            img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        lay.im.alpha_composite(img, (int(cx * SS - img.width / 2), int(cy * SS - img.height / 2)))
        lay._refresh()

    y = 140
    txt(40, y, "主角 · 橘猫（小 / 大 两种形态，各 12 帧动画）", 19)
    y += 34
    cat_s = Image.open(os.path.join(ASSETS, "sprites", "cat_small.png"))
    cat_b = Image.open(os.path.join(ASSETS, "sprites", "cat_big.png"))
    paste_center(cat_s, 300, y + 34)
    paste_center(cat_b, 300 + 400, y + 34)
    txt(40, y + 78, "小猫：一击必死", 15, (140, 120, 116, 255))
    txt(440, y + 78, "大猫：受伤退化为小猫", 15, (140, 120, 116, 255))
    y += 120

    txt(40, y, "原创敌人（毛线球怪 / 乌鸦 / 跳跳鱼 / 蘑菇陷阱怪）", 19)
    y += 30
    for i, n in enumerate(("enemy_yarn", "enemy_crow", "enemy_fish", "enemy_mushroom")):
        im = Image.open(os.path.join(ASSETS, "sprites", n + ".png"))
        paste_center(im, 150 + i * 300, y + 26)
    y += 70

    txt(40, y, "收集品与道具（金鱼 / 无敌星 / 鱼罐头）＋ 终点小鱼旗", 19)
    y += 30
    for i, n in enumerate(("item_goldfish", "item_star", "item_can")):
        im = Image.open(os.path.join(ASSETS, "sprites", n + ".png"))
        paste_center(im, 150 + i * 130, y + 20)
    paste_center(Image.open(os.path.join(ASSETS, "sprites", "goal_flagfish.png")), 640, y + 20)
    paste_center(Image.open(os.path.join(ASSETS, "sprites", "goal_pole.png")), 800, y + 20, 0.5)
    y += 60

    txt(40, y, "瓦片（48×48，全出血无缝）", 19)
    y += 30
    names = ["ground_top", "ground_fill", "brick", "stone", "question_used",
             "pipe_tl", "pipe_tr", "pipe_bl", "pipe_br", "spike", "invisible", "conveyor"]
    for i, n in enumerate(names):
        im = Image.open(os.path.join(ASSETS, "tiles", n + ".png"))
        if im.width > 48:
            im = im.crop((0, 0, 48, 48))
        paste_center(im, 60 + i * 56, y + 24)
    y += 60
    for i, n in enumerate(("question", "crumble", "lava", "water")):
        im = Image.open(os.path.join(ASSETS, "tiles", n + ".png"))
        paste_center(im, 60 + i * 260, y + 26)
        txt(60 + i * 260 - 46, y + 52, n, 13, (150, 132, 128, 255))
    y += 100

    txt(40, y, "天空装饰：普通云 / 伪装云 / 普通太阳 / 伪装太阳（会砸下来）", 19)
    y += 34
    paste_center(Image.open(os.path.join(ASSETS, "ui", "cloud_soft.png")), 160, y + 20, 0.8)
    paste_center(Image.open(os.path.join(ASSETS, "ui", "cloud_evil.png")), 340, y + 20, 0.8)
    paste_center(Image.open(os.path.join(ASSETS, "ui", "sun_soft.png")), 560, y + 20, 0.7)
    paste_center(Image.open(os.path.join(ASSETS, "ui", "sun_evil.png")), 720, y + 20, 0.7)
    for i, k in enumerate(("coin", "skull", "cat", "clock")):
        paste_center(Image.open(os.path.join(ASSETS, "ui", f"icon_{k}.png")), 900 + i * 60, y + 20)
    y += 70

    txt(40, y, "背景视差层（远景丘陵 / 中景树木，均可横向无缝平铺）", 19)
    y += 28
    far = Image.open(os.path.join(ASSETS, "ui", "bg_far.png")).resize((600, 338), Image.LANCZOS)
    mid = Image.open(os.path.join(ASSETS, "ui", "bg_mid.png")).resize((600, 338), Image.LANCZOS)
    lay.im.alpha_composite(far.convert("RGBA"), (40 * SS, y * SS))
    lay.im.alpha_composite(mid.convert("RGBA"), (660 * SS, y * SS))
    lay._refresh()

    lay.out().save(os.path.join(ASSETS, "preview", "style-sample.png"))
    build_preview_html()


def build_preview_html():
    """产出一份可在浏览器里打开的《美术风格小样》页面。"""
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>猫咪历险记 · 美术风格小样</title>
<style>
  :root{--ink:#3a2e32;--muted:#8b7c78;--card:#fffdfa;--line:#e6ddd4;--bg:#f6f2ec;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font-family:-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif;}
  header{background:#3a2e32;color:#ffecd6;padding:28px 40px;}
  header h1{margin:0;font-size:24px;letter-spacing:.5px}
  header p{margin:6px 0 0;color:#c4b2aa;font-size:13px}
  main{max-width:1180px;margin:0 auto;padding:28px 20px 60px}
  section{background:var(--card);border:1px solid var(--line);border-radius:18px;
          padding:20px 24px;margin-bottom:20px;box-shadow:0 6px 18px rgba(90,70,60,.06)}
  h2{font-size:16px;margin:0 0 4px}
  .hint{color:var(--muted);font-size:12.5px;margin:0 0 16px;line-height:1.6}
  .row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
  .item{text-align:center}
  .item img{display:block;image-rendering:auto}
  .item span{display:block;margin-top:6px;font-size:11.5px;color:var(--muted)}
  .checker{background-image:linear-gradient(45deg,#eee 25%,transparent 25%),
    linear-gradient(-45deg,#eee 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,#eee 75%),
    linear-gradient(-45deg,transparent 75%,#eee 75%);
    background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0;
    border-radius:10px;padding:8px}
  .wide img{width:100%;border-radius:10px;display:block}
  .swatches{display:flex;flex-wrap:wrap;gap:8px}
  .sw{width:74px}
  .sw i{display:block;height:40px;border-radius:9px;border:1px solid rgba(0,0,0,.06)}
  .sw b{display:block;font-size:10px;color:var(--muted);font-weight:500;margin-top:4px;
        text-align:center;word-break:break-all}
</style>
</head>
<body>
<header>
  <h1>🐱 猫咪历险记 · 美术风格小样</h1>
  <p>高分辨率扁平卡通 ｜ 瓦片 48×48 ｜ 角色 64×64 ｜ 全部素材由 tools/gen_assets.py 程序化原创生成</p>
</header>
<main>
  <section>
    <h2>主角 · 橘猫</h2>
    <p class="hint">小猫（初始形态，一击必死）与大猫（吃下鱼罐头后，受伤退化为小猫）。
      各 12 帧：待机 2 / 行走 4 / 跳跃 / 下落 / 蹲下 / 受伤 / 滑行 / 落地。角色面向右侧绘制，向左时由引擎水平翻转。</p>
    <div class="row">
      <div class="item checker"><img src="../sprites/cat_small.png" width="384" height="128"><span>cat_small.png</span></div>
      <div class="item checker"><img src="../sprites/cat_big.png" width="384" height="128"><span>cat_big.png</span></div>
    </div>
  </section>

  <section>
    <h2>原创敌人</h2>
    <p class="hint">左→右：毛线球怪（地面滚动巡逻）、乌鸦（空中正弦飞行）、跳跳鱼（从水里弹跳）、蘑菇陷阱怪（伪装成蘑菇道具，靠近后扑咬）。</p>
    <div class="row">
      <div class="item checker"><img src="../sprites/enemy_yarn.png" width="192" height="48"><span>毛线球怪</span></div>
      <div class="item checker"><img src="../sprites/enemy_crow.png" width="192" height="48"><span>乌鸦</span></div>
      <div class="item checker"><img src="../sprites/enemy_fish.png" width="192" height="48"><span>跳跳鱼</span></div>
      <div class="item checker"><img src="../sprites/enemy_mushroom.png" width="192" height="48"><span>蘑菇陷阱怪</span></div>
    </div>
  </section>

  <section>
    <h2>道具与终点</h2>
    <p class="hint">金鱼＝经典金币位；无敌星＝短暂无敌＋可秒杀敌人；鱼罐头＝变大猫。右侧为小鱼旗杆与会浮动的小鱼旗。</p>
    <div class="row">
      <div class="item checker"><img src="../sprites/item_goldfish.png" width="128" height="32"><span>金鱼</span></div>
      <div class="item checker"><img src="../sprites/item_star.png" width="128" height="32"><span>无敌星</span></div>
      <div class="item checker"><img src="../sprites/item_can.png" width="128" height="32"><span>鱼罐头</span></div>
      <div class="item checker"><img src="../sprites/goal_flagfish.png" width="216" height="48"><span>小鱼旗</span></div>
      <div class="item checker"><img src="../sprites/goal_pole.png" width="32" height="96"><span>旗杆</span></div>
    </div>
  </section>

  <section>
    <h2>瓦片集（48×48，全出血无缝拼接）</h2>
    <p class="hint">草地 / 泥土 / 砖块 / 石块 / 问号砖（3 帧闪光）/ 已用问号砖 / 管道四件套 / 碎裂地板（3 帧）/ 尖刺 / 隐形砖（仅调试可见）/ 隐藏传送带。</p>
    <div class="row">
      <div class="item checker"><img src="../tiles/ground_top.png" width="48"><span>草地</span></div>
      <div class="item checker"><img src="../tiles/ground_fill.png" width="48"><span>泥土</span></div>
      <div class="item checker"><img src="../tiles/brick.png" width="48"><span>砖块</span></div>
      <div class="item checker"><img src="../tiles/stone.png" width="48"><span>石块</span></div>
      <div class="item checker"><img src="../tiles/question.png" width="144"><span>问号砖</span></div>
      <div class="item checker"><img src="../tiles/question_used.png" width="48"><span>已用</span></div>
      <div class="item checker"><img src="../tiles/pipe_tl.png" width="48"><span>管道</span></div>
      <div class="item checker"><img src="../tiles/crumble.png" width="144"><span>碎裂地板</span></div>
      <div class="item checker"><img src="../tiles/spike.png" width="48"><span>尖刺</span></div>
      <div class="item checker"><img src="../tiles/lava.png" width="192"><span>岩浆</span></div>
      <div class="item checker"><img src="../tiles/water.png" width="192"><span>水面</span></div>
    </div>
  </section>

  <section>
    <h2>天空装饰与"伪装天空掉落物"</h2>
    <p class="hint">普通云/太阳是纯装饰；伪装版本在外形上与普通版高度相似（只是色调略冷、带一点凶相），
      进入触发范围后会砸下来变成即死障碍——这正是本作"恶搞陷阱"的核心手法之一。</p>
    <div class="row">
      <div class="item checker"><img src="../ui/cloud_soft.png" width="128"><span>普通云</span></div>
      <div class="item checker"><img src="../ui/cloud_evil.png" width="128"><span>伪装云</span></div>
      <div class="item checker"><img src="../ui/sun_soft.png" width="96"><span>普通太阳</span></div>
      <div class="item checker"><img src="../ui/sun_evil.png" width="96"><span>伪装太阳</span></div>
    </div>
  </section>

  <section>
    <h2>UI 组件</h2>
    <p class="hint">圆角卡片 + 柔和阴影的现代扁平风 UI，与像素/卡通主体形成有意的风格对比。图标：金币、骷髅（死亡计数）、猫头、计时。</p>
    <div class="row">
      <div class="item checker"><img src="../ui/panel.png" width="96"><span>卡片</span></div>
      <div class="item checker"><img src="../ui/icon_coin.png" width="32"><span>金币</span></div>
      <div class="item checker"><img src="../ui/icon_skull.png" width="32"><span>死亡数</span></div>
      <div class="item checker"><img src="../ui/icon_cat.png" width="32"><span>形态</span></div>
      <div class="item checker"><img src="../ui/icon_clock.png" width="32"><span>计时</span></div>
    </div>
  </section>

  <section>
    <h2>视差背景层</h2>
    <p class="hint">远景（丘陵＋大云）与中景（树木＋灌木），均可横向无缝平铺；三层视差配合天空渐变，营造层次感。</p>
    <div class="wide"><img src="../ui/bg_far.png"></div>
    <div class="wide" style="margin-top:12px"><img src="../ui/bg_mid.png"></div>
  </section>

  <section>
    <h2>调色板</h2>
    <p class="hint">全项目共用同一套颜色，保证任意素材拼在一起都协调。游戏内以同样的十六进制值硬编码在 <code>src/utils/constants.js</code> 中。</p>
    <div class="swatches" id="sw"></div>
  </section>
</main>
<script>
const PAL = __PALETTE__;
const box = document.getElementById('sw');
for (const [k, v] of Object.entries(PAL)) {
  const d = document.createElement('div');
  d.className = 'sw';
  d.innerHTML = '<i style="background:' + v + '"></i><b>' + k + '</b>';
  box.appendChild(d);
}
</script>
</body>
</html>
"""
    pal = {k: "#%02x%02x%02x" % v for k, v in P.items()}
    import json
    html = html.replace("__PALETTE__", json.dumps(pal, ensure_ascii=False))
    path = os.path.join(ASSETS, "preview", "style-sample.html")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    groups = {
        "sprites": gen_sprites,
        "tiles": gen_tiles,
        "bg": gen_bg,
        "ui": gen_ui,
        "preview": gen_preview,
    }
    todo = [only] if only else list(groups.keys())
    for name in todo:
        fn = groups.get(name)
        if not fn:
            print("未知分组:", name)
            continue
        fn()
        print("  ✓ 已生成:", name)
    print("素材输出目录:", ASSETS)


if __name__ == "__main__":
    main()
