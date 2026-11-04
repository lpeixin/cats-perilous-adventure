#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《猫咪历险记》Cat's Perilous Adventure —— 专业级原创美术资源生成器
===================================================================

设计原则
--------
1. **完全原创**：所有图形均由本脚本用几何图元程序化绘制，不引用、不描摹任何
   既有作品的精灵图 / 瓦片 / 素材，因此不存在版权风险。
2. **风格统一且精致**：全部素材共享同一套调色板（下方 PALETTE）与工作室级绘制语言
   —— 饱满轮廓 + 柔和深色描边 + 多层高光/暗面 + 角色特征配饰（红领巾与金铃铛）。
3. **高清优雅**：以 4 倍超采样（SS=4）绘制后 LANCZOS 降采样，得到干净平滑的
   抗锯齿边缘；瓦片基础网格 48px、角色网格 64px。
4. **零依赖回退**：若当前 Python 环境未安装 Pillow，自动回退到同目录的 `_pil_shim.py`
   （基于 macOS clang C + CoreGraphics/CoreText 加速实现）。

用法
----
    python3 tools/gen_assets.py            # 生成全部素材 + 风格小样
    python3 tools/gen_assets.py --only cat # 只生成某一组
"""

import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.dirname(os.path.abspath(__file__))
if TOOLS not in sys.path:
    sys.path.insert(0, TOOLS)

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    from _pil_shim import Image, ImageDraw, ImageFilter

ASSETS = os.path.join(ROOT, "assets")
SS = 4  # 超采样倍率

# ---------------------------------------------------------------------------
# 调色板（全项目唯一色彩来源，保证风格统一）
# ---------------------------------------------------------------------------
P = {
    # 天空 / 背景
    "sky_top": (76, 156, 232),
    "sky_mid": (142, 206, 248),
    "sky_bot": (232, 246, 228),
    "cloud_lo": (208, 228, 246),
    "cloud_hi": (252, 254, 255),
    "mtn_far": (142, 188, 214),
    "mtn_Snow": (238, 248, 255),
    "hill_far": (132, 198, 168),
    "hill_mid": (96, 174, 136),
    "hill_near": (68, 146, 104),
    "trunk": (138, 90, 58),
    "trunk_d": (102, 64, 42),
    "leaf": (92, 176, 108),
    "leaf_d": (62, 138, 84),
    "leaf_l": (148, 216, 138),
    # 泥土 / 草地
    "dirt_d": (132, 84, 52),
    "dirt": (176, 120, 74),
    "dirt_m": (162, 106, 64),
    "dirt_l": (204, 150, 98),
    "grass_d": (52, 132, 68),
    "grass": (92, 184, 96),
    "grass_l": (154, 226, 128),
    # 砖 / 石
    "brick_d": (148, 72, 52),
    "brick": (204, 112, 82),
    "brick_l": (238, 154, 118),
    "stone_d": (110, 120, 142),
    "stone": (164, 174, 190),
    "stone_l": (214, 222, 234),
    # 问号砖 / 管道
    "q_d": (188, 128, 28),
    "q": (248, 196, 64),
    "q_l": (255, 236, 148),
    "pipe_d": (44, 132, 82),
    "pipe": (84, 186, 120),
    "pipe_l": (152, 232, 174),
    # 猫（主角 + 标志性红领巾与金铃铛）
    "cat": (248, 166, 78),
    "cat_d": (208, 118, 44),
    "cat_l": (255, 206, 132),
    "cat_cream": (255, 242, 222),
    "cat_stripe": (186, 98, 36),
    "scarf": (232, 68, 76),
    "scarf_d": (178, 42, 52),
    "scarf_l": (255, 124, 128),
    # 通用
    "ink": (54, 38, 44),
    "ink_soft": (88, 66, 72),
    "white": (255, 253, 248),
    "eye": (46, 34, 40),
    "pink": (248, 146, 162),
    "pink_d": (214, 102, 120),
    # 敌人
    "yarn": (234, 96, 122),
    "yarn_d": (186, 60, 86),
    "yarn_l": (252, 154, 172),
    "crow": (84, 80, 126),
    "crow_d": (56, 52, 92),
    "crow_l": (132, 128, 178),
    "crow_beak": (248, 178, 68),
    "fish": (92, 172, 232),
    "fish_d": (58, 128, 192),
    "fish_l": (164, 218, 250),
    "mush": (228, 78, 96),
    "mush_d": (178, 48, 68),
    "mush_l": (250, 138, 150),
    # 道具
    "gold": (255, 202, 58),
    "gold_d": (214, 144, 26),
    "gold_l": (255, 238, 156),
    "star": (255, 214, 68),
    "star_d": (226, 156, 30),
    "star_l": (255, 246, 180),
    "can": (196, 208, 222),
    "can_d": (144, 158, 178),
    "can_l": (238, 244, 252),
    # 危险
    "spike": (204, 214, 228),
    "spike_d": (138, 150, 170),
    "lava": (242, 116, 52),
    "lava_d": (198, 68, 34),
    "lava_l": (255, 198, 92),
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
    alpha = col[3] if len(col) > 3 else 255
    if t >= 0:
        return (int(r + (255 - r) * t), int(g + (255 - g) * t), int(b + (255 - b) * t), alpha)
    t = -t
    return (int(r * (1 - t)), int(g * (1 - t)), int(b * (1 - t)), alpha)


# ---------------------------------------------------------------------------
# 绘制基础：Layer（超采样画布）
# ---------------------------------------------------------------------------
class Layer:
    """一个超采样绘制层。所有对外坐标都是"逻辑像素"，内部自动乘 ss。"""

    def __init__(self, w, h, mode="RGBA", bg=None, ss=SS):
        self.w, self.h = w, h
        self.ss = ss
        if bg is None:
            bg = (0, 0, 0, 0) if mode == "RGBA" else 0
        self.im = Image.new(mode, (w * ss, h * ss), bg)
        self.d = ImageDraw.Draw(self.im)

    def _s(self, v):
        return v * self.ss

    def _box(self, xy):
        x0, y0, x1, y1 = xy
        s = self.ss
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    def _pts(self, pts):
        s = self.ss
        return [(x * s, y * s) for x, y in pts]

    def _w(self, w):
        return max(1, int(round(w * self.ss)))

    def _refresh(self):
        self.d = ImageDraw.Draw(self.im)

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

    def paste(self, other, mask=None):
        if mask is None:
            self.im = Image.alpha_composite(self.im, other.im)
        else:
            tmp = Image.new("RGBA", self.im.size, (0, 0, 0, 0))
            tmp.paste(other.im, (0, 0), mask.im)
            self.im = Image.alpha_composite(self.im, tmp)
        self._refresh()

    def clip(self, mask_layer, draw_fn):
        lay = Layer(self.w, self.h, ss=self.ss)
        draw_fn(lay)
        self.paste(lay, mask_layer)

    def blurred(self, radius=1.0):
        out = Layer(self.w, self.h, ss=self.ss)
        out.im = self.im.filter(ImageFilter.GaussianBlur(radius * self.ss))
        out._refresh()
        return out

    def copy(self):
        out = Layer(self.w, self.h, ss=self.ss)
        out.im = self.im.copy()
        out._refresh()
        return out

    def mask_of(self):
        m = Layer(self.w, self.h, "L", ss=self.ss)
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
    """底色 + 底部暗面 + 顶部高光 + 柔和描边。"""
    lay.ell(cx, cy, rx, ry, fill=C(key))
    mask = Layer(lay.w, lay.h, "L", ss=lay.ss)
    mask.ell(cx, cy, rx, ry, fill=255)
    lay.clip(mask, lambda l: l.ell(cx + rx * 0.06, cy + ry * 0.42, rx * 0.94, ry * 0.62,
                                   fill=shade(C(key), -sh)))
    lay.clip(mask, lambda l: l.ell(cx + rx * hi_dx, cy + ry * hi_dy, rx * 0.56, ry * 0.44,
                                   fill=shade(C(key), hi)))
    if outline_key:
        lay.ell(cx, cy, rx, ry, outline=C(outline_key), width=ow)
    return mask


def rblob(lay, xy, radius, key, outline_key="ink", ow=1.4, hi=0.30, sh=0.18):
    x0, y0, x1, y1 = xy
    lay.rrect(xy, radius, fill=C(key))
    mask = Layer(lay.w, lay.h, "L", ss=lay.ss)
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
    cols = cols or len(frames)
    rows = math.ceil(len(frames) / cols)
    out = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, ((i % cols) * cw, (i // cols) * ch), f)
    return out


# ===========================================================================
# 1. 主角：冒险橘猫（配红领巾与金铃铛）
# ===========================================================================
CELL = 64


def draw_cat(*, big=False, leg=0.0, eye="open", tail=0.0, ear=0.0, squash=1.0,
             tilt=0.0, crouch=False, hurt=False, arms_up=False, tail_up=False):
    """
    绘制一帧精致的冒险橘猫。
    - 全身柔和深色轮廓描边（包含四肢与尾巴）
    - 标志性红色冒险领巾 + 胸前金铃铛（大猫形态领巾飘带更长）
    - 虎斑额头 M 纹 + 背部虎斑纹 + 双高光灵动大眼
    """
    sx = 1.07 if big else 1.0
    sy = 1.28 if big else 1.0
    feet = 60.0
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

    body_cy = 41.0 - (2.8 if crouch else 0.0)
    body_ry = 10.6 + (2.2 if crouch else 0.0)
    bob = -1.2 if (not crouch and abs(math.sin(leg * math.pi * 2)) > 0.65) else 0.0

    # ---- 1) 尾巴（带深色描边 + 奶白尾尖 + 虎斑环）--------------------------
    sway = math.sin(leg * math.pi * 2) * 0.34 + tail
    if tail_up:
        pts = [(18, 41), (10, 35), (6, 25), (8, 16)]
    else:
        pts = [
            (18, 41),
            (11, 37 + sway * 5.5),
            (6, 29 + sway * 7.5),
            (7, 20 + sway * 6.5),
        ]
    tp = [T(*p) for p in pts]
    lay.line(tp, fill=C("ink"), width=TX(7.4))
    lay.line(tp, fill=C("cat_d"), width=TX(5.2))
    lay.line(tp[:-1], fill=C("cat"), width=TX(4.0))
    lay.dot(tp[-1][0], tp[-1][1], TX(3.4), C("ink"))
    lay.dot(tp[-1][0], tp[-1][1], TX(2.4), C("cat_cream"))

    # ---- 2) 后腿（带完整深色描边 + 奶白圆爪）------------------------------
    hip_y = body_cy + body_ry * 0.38
    for i, hx in enumerate((21.5, 25.5)):
        ph = math.sin((leg + i * 0.5) * math.pi * 2)
        fx = hx + ph * 2.8
        fy = feet - 1.2 - max(0.0, ph) * 2.5
        a = T(hx, hip_y)
        b = T(fx + 0.5, fy)
        lay.line([a, b], fill=C("ink"), width=TX(7.4))
        lay.line([a, b], fill=C("cat_d"), width=TX(5.0))
        lay.ell(b[0] + TX(0.5), b[1], TX(3.7), TY(2.6), fill=C("cat_cream"), outline=C("ink"), width=1.1)

    # ---- 3) 身体（饱满圆润 + 背部虎斑 + 胸前奶白绒毛）----------------------
    cx0, cy0 = T(30.5, body_cy + bob)
    E(30.5, body_cy + bob, 14.6, body_ry, fill=C("cat"))
    mask = Layer(CELL, CELL, "L")
    mask.ell(cx0, cy0, TX(14.6), TY(body_ry), fill=255)
    # 腹部暖白与底暗面
    lay.clip(mask, lambda l: l.ell(*T(31.0, body_cy + bob + body_ry * 0.46),
                                   TX(13.8), TY(body_ry * 0.62), fill=C("cat_d")))
    lay.clip(mask, lambda l: l.ell(*T(26.5, body_cy + bob - body_ry * 0.42),
                                   TX(8.8), TY(body_ry * 0.45), fill=C("cat_l")))
    # 背部正宗虎斑纹（从背脊向下延伸的楔形纹）
    for ox, w_s in ((22.0, 2.3), (27.0, 2.6), (32.0, 2.3)):
        lay.clip(mask, lambda l, ox=ox, w_s=w_s: l.poly([
            T(ox - w_s, body_cy + bob - body_ry - 1),
            T(ox + w_s, body_cy + bob - body_ry - 1),
            T(ox, body_cy + bob - 1.0),
        ], fill=C("cat_stripe")))
    # 胸前与肚皮奶白绒毛
    lay.clip(mask, lambda l: l.ell(*T(37.5, body_cy + bob + 3.2), TX(7.2), TY(6.5),
                                   fill=C("cat_cream")))
    lay.ell(cx0, cy0, TX(14.6), TY(body_ry), outline=C("ink"), width=1.35)

    # ---- 4) 前腿（带描边 + 奶白圆爪）--------------------------------------
    for i, hx in enumerate((36.5, 40.8)):
        ph = math.sin((leg + 0.5 + i * 0.5) * math.pi * 2)
        fx = hx + ph * 2.8
        fy = feet - 1.2 - max(0.0, ph) * 2.5
        a = T(hx, hip_y + 0.5)
        b = T(fx + 0.4, fy)
        lay.line([a, b], fill=C("ink"), width=TX(7.2))
        lay.line([a, b], fill=C("cat"), width=TX(4.8))
        lay.line([a, b], fill=C("cat_l"), width=TX(2.0))
        lay.ell(b[0] + TX(0.6), b[1], TX(3.8), TY(2.6), fill=C("cat_cream"), outline=C("ink"), width=1.1)

    # ---- 5) 标志性红领巾 + 黄金小铃铛 -------------------------------------
    neck_y = 35.0 + bob - (1.8 if crouch else 0.0)
    # 领巾飘带（大猫形态更长更潇洒）
    cape_len = 11.0 if big else 6.5
    cape_wag = math.sin(leg * math.pi * 2) * 2.2
    lay.poly([
        T(33.0, neck_y - 1.0),
        T(33.0 - cape_len, neck_y - 3.2 + cape_wag),
        T(33.0 - cape_len + 1.8, neck_y + 2.4 + cape_wag),
        T(34.0, neck_y + 2.0),
    ], fill=C("scarf"), outline=C("ink"), width=1.1)
    # 脖子上的红领巾环
    lay.ell(*T(39.8, neck_y + 0.6), TX(7.8), TY(3.2), fill=C("scarf"), outline=C("ink"), width=1.15)
    lay.ell(*T(39.2, neck_y - 0.1), TX(5.2), TY(1.4), fill=C("scarf_l"))
    # 胸前金铃铛
    bx, by = T(43.8, neck_y + 2.8)
    lay.ell(bx, by, TX(3.0), TY(3.0), fill=C("gold"), outline=C("ink"), width=1.05)
    lay.dot(bx - TX(0.9), by - TY(0.9), TX(0.9), C("gold_l"))
    lay.dot(bx + TX(0.4), by + TY(0.8), TX(0.8), C("ink"))

    # ---- 6) 头部（大而圆润 + 耳朵绒毛 + 额头虎斑纹）-----------------------
    hx_c, hy_c = 41.5, 25.6 + bob - (2.2 if crouch else 0.0)
    hr_x, hr_y = 13.4, 12.2
    head_off = T(hx_c, hy_c)
    head_mask = Layer(CELL, CELL, "L")
    head_mask.ell(head_off[0], head_off[1], TX(hr_x), TY(hr_y), fill=255)

    # 双耳
    for sgn, ex in ((-1, hx_c - 7.2), (1, hx_c + 6.8)):
        apex = T(ex + sgn * 1.8 + ear * sgn * 1.5, hy_c - hr_y - 6.8 + ear * 1.2)
        b1 = T(ex - 5.2, hy_c - hr_y + 4.4)
        b2 = T(ex + 5.2, hy_c - hr_y + 4.4)
        lay.poly([apex, b1, b2], fill=C("cat"), outline=C("ink"), width=1.3)
        inner = T(ex + sgn * 1.3 + ear * sgn * 1.2, hy_c - hr_y - 2.8 + ear * 0.8)
        lay.poly([inner, T(ex - 2.5, hy_c - hr_y + 3.2), T(ex + 2.5, hy_c - hr_y + 3.2)],
                 fill=C("pink"))
        head_mask.poly([apex, b1, b2], fill=255)

    E(hx_c, hy_c, hr_x, hr_y, fill=C("cat"))
    lay.clip(head_mask, lambda l: l.ell(*T(hx_c + 0.8, hy_c + hr_y * 0.48),
                                        TX(hr_x * 0.95), TY(hr_y * 0.56), fill=C("cat_d")))
    lay.clip(head_mask, lambda l: l.ell(*T(hx_c - hr_x * 0.28, hy_c - hr_y * 0.38),
                                        TX(hr_x * 0.60), TY(hr_y * 0.48), fill=C("cat_l")))
    # 脸颊下部奶白毛区
    lay.clip(head_mask, lambda l: l.ell(*T(hx_c + 1.8, hy_c + 4.6), TX(9.8), TY(6.6),
                                        fill=C("cat_cream")))
    # 额头经典虎斑纹（三道短纹）
    for ox, ln in ((-2.8, 4.2), (0.6, 5.2), (4.0, 4.2)):
        lay.clip(head_mask, lambda l, ox=ox, ln=ln: l.line(
            [T(hx_c + ox, hy_c - hr_y + 0.6), T(hx_c + ox, hy_c - hr_y + ln)],
            fill=C("cat_stripe"), width=TX(1.8),
        ))
    lay.ell(head_off[0], head_off[1], TX(hr_x), TY(hr_y), outline=C("ink"), width=1.35)

    # ---- 7) 五官（灵动大眼 + 双高光 + 腮红 + 猫嘴 ω）---------------------
    ex_l, ex_r = hx_c - 3.6, hx_c + 5.6
    ey = hy_c - 0.6
    if eye == "x" or hurt:
        for exx in (ex_l, ex_r):
            p = T(exx, ey)
            s = TX(3.1)
            lay.line([(p[0] - s, p[1] - s), (p[0] + s, p[1] + s)], fill=C("eye"), width=TX(1.8))
            lay.line([(p[0] - s, p[1] + s), (p[0] + s, p[1] - s)], fill=C("eye"), width=TX(1.8))
    elif eye == "happy":
        for exx in (ex_l, ex_r):
            lay.arc(*T(exx, ey + 1.4), TX(3.1), TY(2.7), 190, 350, fill=C("eye"), width=TX(1.8))
    elif eye == "blink":
        for exx in (ex_l, ex_r):
            p = T(exx, ey + 0.4)
            lay.line([(p[0] - TX(3.0), p[1]), (p[0] + TX(3.0), p[1])],
                     fill=C("eye"), width=TX(1.7))
    else:
        for exx in (ex_l, ex_r):
            lay.ell(*T(exx, ey), TX(3.3), TY(3.7), fill=C("white"), outline=C("ink"), width=0.9)
            lay.ell(*T(exx + 0.5, ey + 0.2), TX(2.2), TY(2.6), fill=C("eye"))
            # 主高光 + 副高光
            lay.dot(*T(exx - 0.5, ey - 1.1), TX(1.05), C("white"))
            lay.dot(*T(exx + 1.1, ey + 1.1), TX(0.55), C("white"))

    # 粉嫩腮红
    for exx in (ex_l - 3.6, ex_r + 3.6):
        lay.ell(*T(exx, ey + 4.4), TX(2.6), TY(1.6), fill=C("pink", 175))

    # 倒三角粉鼻 + ω 猫嘴
    nx, ny = hx_c + 1.4, ey + 2.4
    n = T(nx, ny)
    lay.poly([(n[0] - TX(1.7), n[1] - TY(1.1)), (n[0] + TX(1.7), n[1] - TY(1.1)),
              (n[0], n[1] + TY(1.3))], fill=C("pink_d"))
    if hurt:
        lay.ell(*T(nx, ny + 3.2), TX(2.2), TY(2.4), fill=C("pink_d"), outline=C("ink"), width=1.0)
    else:
        lay.arc(*T(nx - 1.6, ny + 2.0), TX(1.8), TY(1.6), 15, 165, fill=C("ink"), width=1.15)
        lay.arc(*T(nx + 1.6, ny + 2.0), TX(1.8), TY(1.6), 15, 165, fill=C("ink"), width=1.15)

    # 胡须
    for sgn, wx in ((-1, hx_c - 7.8), (1, hx_c + 8.8)):
        for dy in (-1.2, 1.2):
            a = T(wx, ey + 3.0 + dy)
            b = T(wx + sgn * 5.6, ey + 2.6 + dy * 1.6)
            lay.line([a, b], fill=C("ink_soft", 185), width=0.95)

    if arms_up:
        a = T(42.0, body_cy + bob - 5.0)
        b = T(48.5, body_cy + bob - 14.5)
        lay.line([a, b], fill=C("ink"), width=TX(6.6))
        lay.line([a, b], fill=C("cat"), width=TX(4.4))
        lay.ell(b[0], b[1], TX(3.0), TY(2.8), fill=C("cat_cream"), outline=C("ink"), width=1.0)

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
    """毛线球怪：饱满立体缠绕纹理 + 小恶魔毛线角 + 凶萌大眼与小尖牙。"""
    lay = Layer(48, 48)
    cy, cx, r = 24.5, 24.0, 15.2
    # 甩出的毛线尾端
    wag = math.sin(frame / 4 * math.pi * 2) * 2.5
    lay.line([(cx + 12, cy + 8), (cx + 18, cy + 11 + wag), (cx + 21, cy + 8 - wag)],
             fill=C("ink"), width=3.4)
    lay.line([(cx + 12, cy + 8), (cx + 18, cy + 11 + wag), (cx + 21, cy + 8 - wag)],
             fill=C("yarn_l"), width=1.8)
    # 脚
    for i, fx in enumerate((16.5, 31.5)):
        ph = math.sin((frame / 4 + i * 0.5) * math.pi * 2)
        fy = 41.2 - max(0, ph) * 1.5
        lay.ell(fx + ph * 1.6, fy, 4.8, 3.2, fill=C("yarn_d"), outline=C("ink"), width=1.2)
    # 头顶两个小恶魔毛线角
    for sgn in (-1, 1):
        lay.poly([
            (cx + sgn * 6, cy - 11),
            (cx + sgn * 12, cy - 18),
            (cx + sgn * 11, cy - 9),
        ], fill=C("yarn_d"), outline=C("ink"), width=1.2)
    blob(lay, cx, cy, r, r, "yarn", hi=0.32, sh=0.22)
    # 缠绕的立体毛线纹理
    for i in range(6):
        a = i * 60 + frame * 18
        lay.arc(cx, cy, r * 0.86, r * 0.86 * (0.40 + 0.42 * ((i % 3) / 2)), a, a + 150,
                fill=C("yarn_l"), width=1.7)
        lay.arc(cx, cy, r * 0.80, r * 0.80 * (0.36 + 0.40 * (((i + 1) % 3) / 2)),
                a + 185, a + 305, fill=C("yarn_d"), width=1.4)
    # 愤怒发光眼
    for ex, sgn in ((cx - 5.2, -1), (cx + 5.2, 1)):
        lay.ell(ex, cy - 0.8, 3.8, 4.0, fill=C("white"), outline=C("ink"), width=1.0)
        lay.ell(ex + sgn * 0.5, cy - 0.5, 2.4, 2.7, fill=C("eye"))
        lay.dot(ex - 0.6, cy - 1.8, 0.9, C("white"))
    # 粗怒眉
    lay.line([(cx - 9.0, cy - 6.2), (cx - 1.8, cy - 3.6)], fill=C("ink"), width=2.1)
    lay.line([(cx + 9.0, cy - 6.2), (cx + 1.8, cy - 3.6)], fill=C("ink"), width=2.1)
    # 咧嘴 + 双尖牙
    lay.arc(cx, cy + 3.8, 5.2, 3.6, 20, 160, fill=C("ink"), width=1.5)
    for sx_ in (-2.2, 2.2):
        lay.poly([(cx + sx_ - 1.1, cy + 4.2), (cx + sx_ + 1.1, cy + 4.2), (cx + sx_, cy + 7.4)],
                 fill=C("white"), outline=C("ink"), width=0.8)
    return lay.out()


def draw_crow(frame):
    """乌鸦：戴红领巾的夜盗乌鸦，羽毛层次分明。"""
    lay = Layer(48, 48)
    up = frame in (0, 2)
    cx, cy = 23.5, 25.0 + (0.0 if up else 1.8)
    # 尾羽
    lay.poly([(cx - 6, cy - 1), (cx - 18, cy - 6), (cx - 15, cy), (cx - 18, cy + 5),
              (cx - 6, cy + 4)], fill=C("crow_d"), outline=C("ink"), width=1.2)
    # 身体
    blob(lay, cx, cy, 11.2, 8.8, "crow", hi=0.28, sh=0.24)
    # 腹部浅色羽纹
    lay.ell(cx + 0.5, cy + 3.2, 7.2, 3.8, fill=C("crow_l", 160))
    # 脖间红领巾
    lay.ell(cx + 5.8, cy - 1.2, 5.2, 2.4, fill=C("scarf"), outline=C("ink"), width=1.0)
    # 翅膀（带羽尖分叉）
    tipx, tipy = cx - 8.5, (cy - 16.0 if up else cy + 11.0)
    midx, midy = cx - 0.5, (cy - 10.0 if up else cy + 6.5)
    lay.poly([(cx - 4.5, cy - 1.0), (midx, midy), (tipx, tipy),
              (tipx - 3.5, tipy + (3.5 if up else -3.5)), (cx - 8.5, cy + 3.0)],
             fill=C("crow_l" if up else "crow_d"), outline=C("ink"), width=1.2)
    # 头部
    blob(lay, cx + 7.2, cy - 6.6, 6.8, 6.4, "crow", hi=0.32, sh=0.18)
    # 锐利金喙
    lay.poly([(cx + 12.2, cy - 7.6), (cx + 21.5, cy - 4.5), (cx + 12.2, cy - 1.8)],
             fill=C("crow_beak"), outline=C("ink"), width=1.2)
    lay.line([(cx + 12.6, cy - 4.6), (cx + 19.5, cy - 4.5)], fill=C("ink"), width=1.0)
    # 凶狠鹰眼
    lay.ell(cx + 8.8, cy - 7.8, 3.2, 3.3, fill=C("white"), outline=C("ink"), width=0.9)
    lay.ell(cx + 9.4, cy - 7.6, 1.9, 2.1, fill=C("eye"))
    lay.dot(cx + 8.8, cy - 8.6, 0.8, C("white"))
    lay.line([(cx + 5.0, cy - 11.4), (cx + 11.8, cy - 9.4)], fill=C("ink"), width=1.9)
    return lay.out()


def draw_fish(frame):
    """跳跳鱼：光泽鳞片 + 灵动背鳍与尾鳍。"""
    lay = Layer(48, 48)
    cx, cy = 24.0, 26.0
    wag = math.sin(frame / 4 * math.pi * 2)
    # 尾鳍
    lay.poly([(cx - 10, cy), (cx - 21, cy - 8 + wag * 3), (cx - 17, cy),
              (cx - 21, cy + 8 + wag * 3)], fill=C("fish_d"), outline=C("ink"), width=1.2)
    # 背鳍与腹鳍
    lay.poly([(cx - 4, cy - 8), (cx + 2, cy - 16 - wag * 1.5), (cx + 7, cy - 7)],
             fill=C("fish_d"), outline=C("ink"), width=1.2)
    lay.poly([(cx - 1, cy + 7), (cx + 2, cy + 14), (cx + 6, cy + 6)],
             fill=C("fish_d"), outline=C("ink"), width=1.2)
    blob(lay, cx, cy, 12.4, 9.4, "fish", hi=0.34, sh=0.22)
    # 奶白鱼腹
    lay.ell(cx + 1.0, cy + 4.4, 9.2, 3.6, fill=C("white", 165))
    # 鱼鳞纹理
    for ox in (-4.2, 0.8, 5.6):
        lay.arc(cx + ox, cy - 0.5, 3.2, 3.4, 200, 340, fill=C("fish_l"), width=1.4)
    # 大眼睛
    lay.ell(cx + 6.6, cy - 2.4, 4.2, 4.4, fill=C("white"), outline=C("ink"), width=1.0)
    lay.ell(cx + 7.5, cy - 2.2, 2.4, 2.6, fill=C("eye"))
    lay.dot(cx + 6.8, cy - 3.4, 1.0, C("white"))
    # 嘴角与小尖牙
    lay.arc(cx + 11.4, cy + 2.4, 2.8, 2.2, 25, 165, fill=C("ink"), width=1.2)
    return lay.out()


def draw_mush(frame):
    """蘑菇陷阱怪：高光毒蝇伞菌盖 + 阴影下的发光凶眼与尖牙。"""
    lay = Layer(48, 48)
    pounce = frame >= 2
    dy = 2.0 if pounce else 0.0
    # 小短腿
    for i, fx in enumerate((17.8, 30.2)):
        ph = math.sin((frame / 2 + i * 0.5) * math.pi * 2) if not pounce else 0
        lay.ell(fx + ph * 1.6, 41.2 + dy, 4.6, 3.4, fill=C("mush_d"), outline=C("ink"), width=1.1)
    # 菌柄
    rblob(lay, (15.5, 25.5 + dy, 32.5, 42.2 + dy), 6.2, "cat_cream", hi=0.45, sh=0.14)
    # 菌盖下沿深色阴影带
    lay.rrect((16.2, 26.5 + dy, 31.8, 32.5 + dy), 2.0, fill=C("ink", 90))
    # 凶眼与尖牙
    for ex in (20.0, 28.0):
        lay.ell(ex, 31.2 + dy, 3.4, 3.6, fill=C("white"), outline=C("ink"), width=0.9)
        lay.ell(ex, 31.5 + dy, 2.0, 2.2, fill=C("eye"))
        lay.dot(ex - 0.6, 30.4 + dy, 0.75, C("white"))
    for fx_ in (22.2, 25.8):
        lay.poly([(fx_ - 1.1, 36.0 + dy), (fx_ + 1.1, 36.0 + dy), (fx_, 39.8 + dy)],
                 fill=C("white"), outline=C("ink"), width=0.8)
    # 饱满毒蝇伞菌盖
    cap = Layer(48, 48)
    cap.pie(24.0, 26.2 + dy, 18.6, 17.0, 180, 360, fill=C("mush"))
    cap.rrect((5.4, 24.2 + dy, 42.6, 29.2 + dy), 3.0, fill=C("mush"))
    capmask = cap.mask_of()
    cap.clip(capmask, lambda l: l.pie(24.0, 24.0 + dy, 17.2, 15.2, 190, 350,
                                      fill=C("mush_l")))
    for sx_, sy_, sr in ((14.8, 18.8, 3.8), (31.5, 17.2, 3.2), (24.0, 12.2, 2.9),
                         (10.2, 25.2, 2.5), (37.2, 24.8, 2.7)):
        cap.ell(sx_, sy_ + dy, sr, sr * 0.86, fill=C("white"), outline=C("mush_d", 120), width=0.7)
    cap.pie(24.0, 26.2 + dy, 18.6, 17.0, 180, 360, outline=C("ink"), width=1.4)
    cap.line([(5.6, 26.8 + dy), (42.4, 26.8 + dy)], fill=C("ink"), width=1.4)
    lay.paste(cap)
    return lay.out()


# ===========================================================================
# 3. 道具
# ===========================================================================
def draw_goldfish(frame):
    """金鱼收集品：亮金雕花小鱼币。"""
    lay = Layer(32, 32)
    cx, cy = 15.5, 16.0
    wag = math.sin(frame / 4 * math.pi * 2)
    lay.poly([(cx - 7, cy), (cx - 14.5, cy - 5.5 + wag * 2), (cx - 12, cy),
              (cx - 14.5, cy + 5.5 + wag * 2)], fill=C("gold_d"), outline=C("ink"), width=1.1)
    lay.poly([(cx - 2, cy - 6), (cx + 1.5, cy - 11.5), (cx + 4.5, cy - 5)],
             fill=C("gold_d"), outline=C("ink"), width=1.0)
    blob(lay, cx, cy, 8.8, 6.8, "gold", hi=0.40, sh=0.20)
    lay.arc(cx - 1.0, cy, 3.2, 3.2, 200, 340, fill=C("gold_l"), width=1.2)
    lay.ell(cx + 4.2, cy - 1.4, 2.8, 3.0, fill=C("white"), outline=C("ink"), width=0.8)
    lay.ell(cx + 4.8, cy - 1.2, 1.6, 1.8, fill=C("eye"))
    lay.dot(cx + 4.2, cy - 2.0, 0.7, C("white"))
    return lay.out()


def draw_star(frame):
    """无敌星：饱满五角星 + 腮红与星芒。"""
    lay = Layer(32, 32)
    cx, cy = 16.0, 16.5
    wob = 1.0 + 0.12 * math.sin(frame / 4 * math.pi * 2)
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = 13.4 if i % 2 == 0 else 6.6
        pts.append((cx + math.cos(a) * r * wob, cy + math.sin(a) * r * wob))
    lay.poly(pts, fill=C("star"), outline=C("ink"), width=1.3)
    # 内部高光星面
    in_pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = 9.2 if i % 2 == 0 else 4.6
        in_pts.append((cx + math.cos(a) * r * wob, cy - 1.0 + math.sin(a) * r * wob))
    lay.poly(in_pts, fill=C("star_l", 180))
    for ex in (cx - 3.4, cx + 3.4):
        lay.ell(ex, cy + 0.8, 1.8, 2.4, fill=C("eye"))
        lay.dot(ex - 0.5, cy - 0.2, 0.7, C("white"))
        lay.ell(ex + (-1.6 if ex < cx else 1.6), cy + 3.0, 1.6, 1.0, fill=C("pink", 180))
    lay.arc(cx, cy + 3.2, 2.6, 2.0, 20, 160, fill=C("ink"), width=1.1)
    return lay.out()


def draw_can(frame):
    """高级猫罐头：带拉环顶盖与精致小鱼腰封。"""
    lay = Layer(32, 32)
    glint = frame % 4
    # 罐体与金属底座
    lay.rrect((6.5, 5.5, 25.5, 28.5), 3.4, fill=C("can_d"))
    lay.rrect((6.5, 6.0, 25.5, 27.0), 3.2, fill=C("can"))
    # 暖色腰封标签
    lay.rrect((6.5, 10.5, 25.5, 23.5), 0, fill=(238, 92, 88, 255))
    lay.rrect((6.5, 12.0, 25.5, 22.0), 0, fill=(255, 238, 214, 255))
    # 腰封上的金色小鱼徽标
    lay.poly([(10.2, 17.0), (6.8, 13.8), (6.8, 20.2)], fill=C("gold_d"))
    lay.ell(16.0, 17.0, 5.6, 3.8, fill=C("gold"), outline=C("ink"), width=0.9)
    lay.ell(16.0, 15.8, 4.0, 1.6, fill=C("gold_l"))
    lay.dot(18.6, 16.4, 1.1, C("eye"))
    # 罐顶金属椭圆盖与拉环
    lay.rrect((6.5, 5.0, 25.5, 10.8), 3.2, fill=C("can_l"))
    lay.ell(16.0, 7.6, 7.6, 2.2, fill=C("can"), outline=C("can_d"), width=0.9)
    lay.ell(14.0, 7.6, 2.2, 1.2, fill=C("can_l"), outline=C("ink"), width=0.8)
    lay.rrect((6.5, 5.0, 25.5, 28.5), 3.4, outline=C("ink"), width=1.3)
    # 扫光
    lay.line([(9.0, 7.5 + glint * 4.8), (13.5, 7.5 + glint * 4.8)], fill=C("white"), width=1.6)
    return lay.out()


# ===========================================================================
# 4. 瓦片（48×48，全出血，无缝拼接）
# ===========================================================================
TS = 48


def ground_layer(top=True):
    """
    草地/泥土瓦片：
    - 泥土采用柔和的低对比度层状暖土肌理 + 少量圆润小卵石，彻底消除刺眼的波点重复感。
    - 草地帽采用饱满的多层圆弧草丛 + 草叶高光 + 草檐下方立体投影。
    """
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("dirt"))

    # 柔和的横向土壤层理（全出血无缝连接）
    lay.rrect((0, 22, TS, 36), 0, fill=C("dirt_m", 110))
    lay.rrect((0, 38, TS, TS), 0, fill=C("dirt_d", 85))

    # 低对比度自然土块与小卵石（数量少而精致，不抢戏）
    pebbles = (
        (10.0, 26.0, 4.2, 2.8, "dirt_d", 110),
        (34.0, 31.0, 5.0, 3.2, "dirt_d", 100),
        (21.0, 41.0, 3.8, 2.5, "dirt_d", 115),
        (14.0, 35.0, 2.4, 1.8, "dirt_l", 130),
        (39.0, 22.0, 2.8, 2.0, "dirt_l", 125),
    ) if top else (
        (11.0, 10.0, 4.5, 3.0, "dirt_d", 95),
        (35.0, 16.0, 3.8, 2.6, "dirt_l", 110),
        (22.0, 28.0, 4.8, 3.0, "dirt_d", 100),
        (8.0, 38.0, 3.2, 2.2, "dirt_l", 110),
        (37.0, 40.0, 4.0, 2.6, "dirt_d", 95),
    )
    for x, y, rx, ry, k, a in pebbles:
        lay.ell(x, y, rx, ry, fill=C(k, a))

    if top:
        # 草檐下方投在泥土上的柔和暗影
        lay.rrect((0, 14.0, TS, 21.5), 0, fill=C("dirt_d", 195))
        for cx_ in (6.0, 18.0, 30.0, 42.0):
            lay.ell(cx_, 16.5, 7.5, 4.2, fill=C("dirt_d", 195))

        # 翠绿草地帽（带圆润垂坠草丛）
        cap = Layer(TS, TS)
        cap.rrect((0, 0, TS, 14.5), 0, fill=C("grass"))
        for cx_, ry_ in ((6.0, 4.0), (18.0, 4.8), (30.0, 3.8), (42.0, 4.6)):
            cap.ell(cx_, 14.2, 7.6, ry_, fill=C("grass"))
        capmask = cap.mask_of()
        # 草丛底部暗面与顶部受光高光带
        cap.clip(capmask, lambda l: l.rrect((0, 10.5, TS, 19.5), 0, fill=C("grass_d")))
        for cx_, ry_ in ((6.0, 3.6), (18.0, 4.2), (30.0, 3.4), (42.0, 4.0)):
            cap.clip(capmask, lambda l, cx_=cx_, ry_=ry_: l.ell(cx_, 11.8, 6.2, ry_, fill=C("grass")))
        cap.clip(capmask, lambda l: l.rrect((0, 0, TS, 5.2), 0, fill=C("grass_l")))
        # 精致亮草叶纹理
        for gx in (8.0, 22.0, 36.0):
            cap.line([(gx, 8.5), (gx - 2.2, 3.2)], fill=C("grass_l", 220), width=1.4)
            cap.line([(gx + 2.5, 9.0), (gx + 4.2, 4.0)], fill=C("grass_l", 200), width=1.3)
        # 草檐底部描边
        for cx_, ry_ in ((6.0, 4.0), (18.0, 4.8), (30.0, 3.8), (42.0, 4.6)):
            cap.arc(cx_, 14.2, 7.6, ry_, 15, 165, fill=C("ink", 150), width=1.2)
        lay.paste(cap)
    return lay


def tile_ground(top=True):
    return ground_layer(top).out()


def tile_brick():
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("brick_d"))
    bh = 12.0
    for row in range(4):
        y = row * bh
        off = 0.0 if row % 2 == 0 else 12.0
        for cx in range(-1, 3):
            x = cx * 24.0 + off
            lay.rrect((x + 1.2, y + 1.2, x + 22.8, y + bh - 1.2), 2.5, fill=C("brick"))
            lay.line([(x + 2.4, y + 2.6), (x + 21.6, y + 2.6)], fill=C("brick_l"), width=1.3)
            lay.line([(x + 2.4, y + bh - 2.4), (x + 21.6, y + bh - 2.4)],
                     fill=C("brick_d"), width=1.3)
    lay.rrect((0, 0, TS, TS), 0, outline=C("ink", 180), width=1.3)
    return lay.out()


def tile_stone():
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("stone_d"))
    lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 5.0, fill=C("stone"))
    # 顶部高光倒角与底部暗面
    lay.rrect((4.0, 4.0, TS - 4.0, 14.0), 3.5, fill=C("stone_l", 195))
    lay.rrect((4.0, TS - 13.0, TS - 4.0, TS - 4.0), 3.5, fill=C("stone_d", 150))
    # 内嵌石雕边框
    lay.rrect((7.5, 7.5, TS - 7.5, TS - 7.5), 3.0, outline=C("stone_d", 140), width=1.2)
    for x, y, r in ((14.0, 29.0, 2.2), (33.0, 21.0, 1.8), (23.0, 36.0, 1.6)):
        lay.ell(x, y, r, r * 0.85, fill=C("stone_d", 130))
    lay.rrect((0.8, 0.8, TS - 0.8, TS - 0.8), 4.0, outline=C("ink", 190), width=1.4)
    return lay.out()


def tile_question(used=False, frame=0):
    lay = Layer(TS, TS)
    if used:
        lay.rrect((0, 0, TS, TS), 0, fill=C("dirt_d"))
        lay.rrect((2.2, 2.2, TS - 2.2, TS - 2.2), 5.0, fill=(148, 108, 78, 255))
        lay.rrect((6.0, 6.0, TS - 6.0, TS - 6.0), 3.5, fill=(130, 92, 64, 255))
        for x, y in ((6.5, 6.5), (TS - 6.5, 6.5), (6.5, TS - 6.5), (TS - 6.5, TS - 6.5)):
            lay.dot(x, y, 1.8, C("ink", 170))
        lay.rrect((0.8, 0.8, TS - 0.8, TS - 0.8), 4.0, outline=C("ink", 200), width=1.4)
        return lay.out()

    lay.rrect((0, 0, TS, TS), 0, fill=C("q_d"))
    lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 5.5, fill=C("q"))
    lay.rrect((4.0, 4.0, TS - 4.0, 16.0), 4.0, fill=C("q_l", 210))
    lay.rrect((6.5, 6.5, TS - 6.5, TS - 6.5), 4.0, outline=C("q_d", 150), width=1.2)
    # 扫光动画
    gx = 10.0 + frame * 12.0
    lay.line([(gx, 5.0), (gx - 6.0, TS - 5.0)], fill=C("white", 110), width=3.5)
    # 四角铆钉
    for x, y in ((6.5, 6.5), (TS - 6.5, 6.5), (6.5, TS - 6.5), (TS - 6.5, TS - 6.5)):
        lay.dot(x, y, 2.1, C("q_d"))
        lay.dot(x - 0.5, y - 0.5, 0.9, C("q_l"))
    # 立体问号（带投影与亮白高光）
    for ox, oy, col in ((1.4, 1.6, C("q_d")), (0.0, 0.0, C("ink"))):
        lay.arc(24.0 + ox, 19.0 + oy, 6.8, 7.0, 160, 400, fill=col, width=3.6)
        lay.line([(24.0 + ox, 25.4 + oy), (24.0 + ox, 29.4 + oy)], fill=col, width=3.6)
        lay.dot(24.0 + ox, 34.6 + oy, 2.2, col)
    lay.rrect((0.8, 0.8, TS - 0.8, TS - 0.8), 4.0, outline=C("ink", 210), width=1.4)
    return lay.out()


def _pipe_piece(with_rim):
    W = TS * 2
    lay = Layer(W, TS)
    body_top = 20.0 if with_rim else 0.0
    # 管身
    body = Layer(W, TS)
    body.rrect((4.0, body_top, W - 4.0, TS), 0, fill=C("pipe"))
    bmask = body.mask_of()
    body.clip(bmask, lambda l: l.rrect((W - 26.0, body_top, W - 4.0, TS), 0, fill=C("pipe_d")))
    body.clip(bmask, lambda l: l.rrect((10.0, body_top, 24.0, TS), 0, fill=C("pipe_l", 235)))
    body.clip(bmask, lambda l: l.rrect((28.0, body_top, 33.0, TS), 0, fill=C("pipe_l", 160)))
    body.clip(bmask, lambda l: l.rrect((W - 10.0, body_top, W - 4.0, TS), 0, fill=C("ink", 75)))
    body.line([(4.0, body_top), (4.0, TS)], fill=C("ink", 220), width=1.5)
    body.line([(W - 4.0, body_top), (W - 4.0, TS)], fill=C("ink", 220), width=1.5)
    if with_rim:
        # 管口下方投在管身处的环状暗影
        body.rrect((4.5, body_top, W - 4.5, body_top + 5.0), 0, fill=C("ink", 95))
    lay.paste(body)

    if with_rim:
        rim = Layer(W, TS)
        rim.rrect((1.0, 1.0, W - 1.0, 20.0), 5.0, fill=C("pipe"))
        rmask = rim.mask_of()
        rim.clip(rmask, lambda l: l.rrect((1.0, 13.0, W - 1.0, 20.0), 0, fill=C("pipe_d")))
        rim.clip(rmask, lambda l: l.rrect((8.0, 2.5, 24.0, 16.0), 3.0, fill=C("pipe_l", 240)))
        rim.clip(rmask, lambda l: l.rrect((28.0, 2.5, 34.0, 16.0), 2.0, fill=C("pipe_l", 170)))
        rim.clip(rmask, lambda l: l.rrect((W - 24.0, 2.5, W - 2.0, 19.0), 3.0, fill=C("pipe_d", 190)))
        rim.rrect((1.0, 1.0, W - 1.0, 20.0), 5.0, outline=C("ink", 220), width=1.5)
        lay.paste(rim)
    return lay.out()


def tile_pipe_set():
    top = _pipe_piece(True)
    bot = _pipe_piece(False)
    return (top.crop((0, 0, TS, TS)), top.crop((TS, 0, TS * 2, TS)),
            bot.crop((0, 0, TS, TS)), bot.crop((TS, 0, TS * 2, TS)))


def tile_crumble(frame=0, ground=False):
    lay = Layer(TS, TS)
    if ground:
        lay.im = ground_layer(True).im.copy()
        lay._refresh()
    else:
        lay.rrect((0, 0, TS, TS), 0, fill=C("stone_d"))
        lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 4.0, fill=C("stone"))
        lay.rrect((4.0, 4.0, TS - 4.0, 13.0), 3.0, fill=C("stone_l", 180))
        lay.rrect((0.8, 0.8, TS - 0.8, TS - 0.8), 4.0, outline=C("ink", 190), width=1.4)

    # frame 0 在 ground=True 时只画极细微裂痕，保持与真草地高度一致的伪装性
    crack_col = C("dirt_d") if ground else C("ink", 190)
    cracks = [
        [(8, 22), (16, 29), (13, 37), (20, 45)],
        [(40, 20), (32, 27), (37, 35), (30, 44)],
        [(20, 45), (26, 37), (34, 45)],
        [(8, 22), (15, 25), (23, 21)],
    ]
    n = 1 if frame == 0 else (2 if frame == 1 else 4)
    w = 1.2 if (ground and frame == 0) else 2.0
    for c in cracks[:n]:
        lay.line(c, fill=crack_col, width=w)
    if frame >= 2:
        lay.line([(16, 29), (26, 33), (34, 27)], fill=crack_col, width=2.0)
    return lay.out()


def tile_spike():
    lay = Layer(TS, TS)
    for i in range(3):
        x = 8.0 + i * 16.0
        # 尖刺左亮右暗双面金属质感
        lay.poly([(x - 7.2, 43), (x, 8), (x + 7.2, 43)], fill=C("spike"),
                 outline=C("ink"), width=1.3)
        lay.poly([(x - 5.5, 42), (x, 10), (x, 42)], fill=C("white", 210))
        lay.poly([(x, 10), (x + 5.5, 42), (x, 42)], fill=C("spike_d", 190))
    # 底部金属基座与铆钉
    lay.rrect((1, 40, TS - 1, TS - 1), 2.5, fill=C("spike_d"), outline=C("ink"), width=1.3)
    for rx in (8.0, 24.0, 40.0):
        lay.dot(rx, 44.0, 1.6, C("white", 180))
    return lay.out()


def tile_lava(frame=0):
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("lava_d"))
    wave = Layer(TS, TS)
    wave.rrect((0, 6, TS, TS), 0, fill=C("lava"))
    for i in range(3):
        off = (frame * 4 + i * 16) % TS
        wave.ell(off - 8, 7.0, 12.0, 4.0, fill=C("lava_l"))
        wave.ell(off + 6, 8.0, 12.0, 3.8, fill=C("lava"))
    lay.paste(wave)
    for i in range(3):
        x = 8.0 + i * 16.0 + (frame * 3) % 16
        lay.ell(x, 14.0, 4.5, 2.5, fill=C("lava_l", 220))
    return lay.out()


def tile_invisible():
    lay = Layer(TS, TS)
    lay.rrect((2, 2, TS - 2, TS - 2), 4.0, fill=(255, 255, 255, 26),
              outline=(255, 255, 255, 90), width=1.2)
    return lay.out()


def tile_conveyor():
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=C("stone_d"))
    lay.rrect((2.0, 2.0, TS - 2.0, TS - 2.0), 4.0, fill=C("stone"))
    for i in range(3):
        y = 10.0 + i * 13.0
        lay.poly([(10, y), (18, y + 5), (10, y + 10)], fill=C("stone_d", 180))
        lay.poly([(24, y), (32, y + 5), (24, y + 10)], fill=C("stone_d", 180))
    lay.rrect((0.8, 0.8, TS - 0.8, TS - 0.8), 4.0, outline=C("ink", 190), width=1.4)
    return lay.out()


def tile_water(frame=0):
    lay = Layer(TS, TS)
    lay.rrect((0, 0, TS, TS), 0, fill=(64, 146, 218, 215))
    lay.rrect((0, 0, TS, 7), 0, fill=(168, 224, 255, 220))
    for i in range(2):
        off = (frame * 5 + i * 24) % TS
        lay.arc(off, 12.0, 14.0, 5.0, 190, 350, fill=(200, 238, 255, 220), width=1.8)
        lay.arc(off + 20, 30.0, 14.0, 5.0, 190, 350, fill=(200, 238, 255, 160), width=1.5)
    return lay.out()


# ===========================================================================
# 5. 视差背景 & 天空装饰（修正垂直构图，使远山与林木在关卡中清晰可见）
# ===========================================================================
BW, BH = 960, 540


def bg_sky():
    lay = Layer(BW, BH, ss=2)
    for y in range(BH):
        t = y / (BH - 1)
        if t < 0.58:
            col = mix("sky_top", "sky_mid", t / 0.58)
        else:
            col = mix("sky_mid", "sky_bot", (t - 0.58) / 0.42)
        lay.d.rectangle([0, y * lay.ss, BW * lay.ss, (y + 1) * lay.ss], fill=col)
    return lay.out()


def _wrap(lay, fn):
    for dx in (-BW, 0, BW):
        fn(lay, dx)


def bg_far():
    """
    远景：高耸的雪顶远山 + 柔美层叠丘陵 + 远景云海。
    注意山峰与丘陵顶点分布在 y=170..360，确保在关卡相机视角下不会被地面遮挡！
    """
    lay = Layer(BW, BH, ss=2)

    # 1) 极远处的柔和山脉与雪顶
    peaks = (
        (140.0, 185.0, 240.0, 380.0),
        (460.0, 165.0, 280.0, 390.0),
        (780.0, 195.0, 250.0, 370.0),
    )
    for px, py, half_w, base_y in peaks:
        def draw_mtn(l, dx, px=px, py=py, hw=half_w, by=base_y):
            l.poly([(px - hw + dx, by), (px + dx, py), (px + hw + dx, by)],
                   fill=(152, 198, 218, 215))
            l.poly([(px + dx, py), (px + hw + dx, by), (px + hw * 0.15 + dx, by)],
                   fill=(134, 182, 206, 215))
            # 雪顶
            sw = hw * 0.30
            sy = py + (by - py) * 0.30
            l.poly([
                (px + dx, py),
                (px - sw + dx, sy),
                (px - sw * 0.3 + dx, sy - 10),
                (px + sw * 0.25 + dx, sy + 4),
                (px + sw + dx, sy),
            ], fill=(244, 250, 255, 235))
        _wrap(lay, draw_mtn)

    # 2) 中远层柔美绿色丘陵（顶部抬升到 y=250..310，底部填满到 540）
    for cx, cy, rx, ry, k in (
        (160.0, 415.0, 290.0, 155.0, "hill_far"),
        (560.0, 405.0, 340.0, 165.0, "hill_far"),
        (890.0, 420.0, 260.0, 150.0, "hill_far"),
        (340.0, 445.0, 300.0, 145.0, "hill_mid"),
        (760.0, 440.0, 290.0, 145.0, "hill_mid"),
    ):
        _wrap(lay, lambda l, dx, cx=cx, cy=cy, rx=rx, ry=ry, k=k: l.ell(
            cx + dx, cy, rx, ry, fill=C(k)))
    lay.rrect((0, 430, BW, BH), 0, fill=C("hill_mid"))

    # 3) 高空舒展云朵
    for cx, cy, s in ((210.0, 105.0, 0.95), (680.0, 82.0, 0.80), (480.0, 148.0, 0.62),
                      (60.0, 142.0, 0.65), (875.0, 122.0, 0.85)):
        def cloud(l, dx, cx=cx, cy=cy, s=s):
            for ox, oy, r in ((-38, 6, 26), (0, -8, 34), (40, 4, 27), (14, 12, 24),
                              (-16, 12, 22)):
                l.ell(cx + dx + ox * s, cy + oy * s, r * s, r * s * 0.80, fill=C("cloud_lo"))
            for ox, oy, r in ((-30, 2, 22), (2, -12, 27), (34, 0, 21)):
                l.ell(cx + dx + ox * s, cy + oy * s, r * s, r * s * 0.78, fill=C("cloud_hi"))
        _wrap(lay, cloud)
    return lay.out()


def bg_mid():
    """
    中景：林木、灌木丛与远方童话小屋剪影。
    林木根部对齐在 y=385 左右（下方连绵绿坡直达 y=540），
    保证在关卡内相机视口（地面约在屏幕 y=350..420）中能清晰展现茂密树冠！
    """
    lay = Layer(BW, BH, ss=2)

    # 连绵近景草坡底座
    for cx, cy, rx, ry in ((180.0, 445.0, 280.0, 95.0),
                           (540.0, 440.0, 320.0, 100.0),
                           (860.0, 448.0, 260.0, 92.0)):
        _wrap(lay, lambda l, dx, cx=cx, cy=cy, rx=rx, ry=ry: l.ell(
            cx + dx, cy, rx, ry, fill=C("hill_near")))
    lay.rrect((0, 420, BW, BH), 0, fill=C("hill_near"))

    def tree(l, dx, x, base, s):
        l.rrect((x - 9 * s + dx, base - 98 * s, x + 9 * s + dx, base + 20), 4 * s, fill=C("trunk"))
        l.rrect((x - 9 * s + dx, base - 98 * s, x - 2 * s + dx, base + 20), 3 * s, fill=C("trunk_d", 170))
        for ox, oy, r in ((-26, -104, 40), (26, -108, 42), (0, -138, 46), (0, -92, 44),
                          (-44, -76, 30), (44, -78, 31)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.92, fill=C("leaf_d"))
        for ox, oy, r in ((-22, -114, 32), (22, -118, 34), (0, -148, 36), (-2, -100, 34)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.90, fill=C("leaf"))
        for ox, oy, r in ((-24, -124, 18), (8, -154, 20)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.86, fill=C("leaf_l", 220))

    def bush(l, dx, x, base, s):
        for ox, oy, r in ((-30, -14, 30), (0, -26, 38), (32, -12, 28), (14, -6, 24),
                          (-14, -4, 24)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.86, fill=C("leaf_d"))
        for ox, oy, r in ((-18, -22, 20), (10, -32, 22)):
            l.ell(x + ox * s + dx, base + oy * s, r * s, r * s * 0.82, fill=C("leaf", 220))

    for x, base, s in ((115.0, 388.0, 0.96), (445.0, 382.0, 0.78), (785.0, 392.0, 1.05)):
        _wrap(lay, lambda l, dx, x=x, base=base, s=s: tree(l, dx, x, base, s))
    for x, s in ((285.0, 0.95), (625.0, 0.85), (925.0, 1.0), (20.0, 0.85)):
        _wrap(lay, lambda l, dx, x=x, s=s: bush(l, dx, x, 392.0, s))
    return lay.out()


def deco_cloud(evil=False):
    lay = Layer(128, 64)
    if evil:
        col_lo, col_hi = (182, 194, 220), (224, 232, 248)
    else:
        col_lo, col_hi = P["cloud_lo"], P["cloud_hi"]
    for ox, oy, r in ((-34, 10, 22), (0, -4, 30), (34, 8, 24), (12, 16, 20), (-14, 16, 19)):
        lay.ell(64 + ox, 34 + oy, r, r * 0.80, fill=col_lo + (255,))
    for ox, oy, r in ((-28, 6, 19), (2, -10, 24), (30, 4, 19)):
        lay.ell(64 + ox, 34 + oy, r, r * 0.78, fill=col_hi + (255,))
    if evil:
        for ex, sgn in ((52.0, -1), (76.0, 1)):
            lay.ell(ex, 30.0, 4.4, 4.8, fill=C("white"), outline=C("ink"), width=0.9)
            lay.ell(ex, 30.6, 2.5, 2.8, fill=C("eye"))
            lay.line([(ex - sgn * 5.2, 25.8), (ex + sgn * 4.4, 23.2)], fill=C("ink"), width=1.9)
    return lay.out()


def deco_sun(evil=False):
    lay = Layer(96, 96)
    if evil:
        rays = (238, 136, 78)
        core = (248, 168, 96)
    else:
        rays = (252, 208, 96)
        core = P["star"]
    for i in range(12):
        a = i * 30 * math.pi / 180
        r0, r1 = 26.0, 44.0
        w = 8.0 if i % 2 == 0 else 5.2
        px, py = 48 + math.cos(a) * r0, 48 + math.sin(a) * r0
        qx, qy = 48 + math.cos(a) * r1, 48 + math.sin(a) * r1
        nx, ny = -math.sin(a), math.cos(a)
        lay.poly([(px + nx * w, py + ny * w), (qx, qy), (px - nx * w, py - ny * w)],
                 fill=rays + (255,), outline=C("ink", 130), width=0.9)
    lay.ell(48, 48, 30.0, 30.0, fill=core + (255,), outline=C("ink", 180), width=1.3)
    lay.ell(43, 41, 19.0, 16.0, fill=shade(core, 0.32))
    if evil:
        for ex, sgn in ((38.0, -1), (58.0, 1)):
            lay.ell(ex, 46.0, 5.2, 5.6, fill=C("white"), outline=C("ink"), width=1.0)
            lay.ell(ex, 46.6, 3.0, 3.3, fill=C("eye"))
            lay.line([(ex - sgn * 6.0, 40.0), (ex + sgn * 5.2, 36.0)], fill=C("ink"), width=2.3)
        lay.arc(48, 62, 12.0, 8.0, 20, 160, fill=C("ink"), width=2.4)
    else:
        for ex in (38.0, 58.0):
            lay.ell(ex, 47.0, 3.4, 3.8, fill=C("eye"))
            lay.dot(ex - 0.8, 45.6, 1.0, C("white"))
        lay.arc(48, 54, 10.0, 8.0, 20, 160, fill=C("ink_soft"), width=2.0)
    return lay.out()


# ===========================================================================
# 6. 终点旗杆 / UI
# ===========================================================================
def draw_flagpole():
    """精致终点旗杆：石雕底座 + 高光金属杆 + 顶部黄金猫爪宝珠。"""
    lay = Layer(64, 192)
    # 杆体
    lay.rrect((28, 12, 36, 184), 3.0, fill=C("stone"))
    lay.rrect((29, 12, 31.8, 184), 1.5, fill=C("white", 210))
    lay.rrect((28, 12, 36, 184), 3.0, outline=C("ink"), width=1.3)
    # 底部石雕基座
    lay.rrect((18, 176, 46, 191), 4.0, fill=C("stone_d"), outline=C("ink"), width=1.3)
    lay.rrect((21, 178, 43, 184), 2.5, fill=C("stone_l"))
    # 顶部黄金宝珠
    lay.ell(32, 10, 9.5, 9.5, fill=C("gold"), outline=C("ink"), width=1.3)
    lay.ell(29.2, 7.2, 3.8, 3.2, fill=C("gold_l"))
    return lay.out()


def draw_flagfish(frame=0):
    """鲤鱼旗风格的小鱼旗。"""
    lay = Layer(72, 48)
    bob = math.sin(frame / 4 * math.pi * 2) * 2.2
    cx, cy = 34.0, 24.0 + bob
    # 飘带尾翼
    lay.poly([(cx - 8, cy), (cx - 22, cy - 9 + bob), (cx - 17, cy), (cx - 22, cy + 9 + bob)],
             fill=C("scarf"), outline=C("ink"), width=1.2)
    lay.poly([(cx - 8, cy), (cx - 18, cy - 6 + bob), (cx - 15, cy), (cx - 18, cy + 6 + bob)],
             fill=C("gold_d"), outline=C("ink"), width=1.1)
    blob(lay, cx, cy, 13.5, 9.4, "gold", hi=0.35, sh=0.20)
    lay.poly([(cx - 3, cy - 8), (cx + 1, cy - 16), (cx + 5.5, cy - 7)],
             fill=C("gold_d"), outline=C("ink"), width=1.1)
    # 鳞片纹
    for ox in (-3.5, 1.5):
        lay.arc(cx + ox, cy, 3.4, 3.6, 200, 340, fill=C("gold_l"), width=1.3)
    lay.ell(cx + 6.4, cy - 2.0, 3.6, 3.8, fill=C("white"), outline=C("ink"), width=0.9)
    lay.ell(cx + 7.2, cy - 1.8, 2.1, 2.3, fill=C("eye"))
    lay.dot(cx + 6.6, cy - 2.8, 0.8, C("white"))
    lay.rrect((cx - 14.5, cy - 11, cx - 8.5, cy + 11), 2.2, fill=C("scarf"), outline=C("ink"), width=1.1)
    return lay.out()


def ui_panel():
    lay = Layer(96, 96)
    lay.rrect((2, 4, 94, 94), 20.0, fill=(43, 32, 36, 45))
    lay.rrect((1, 1, 95, 92), 20.0, fill=(255, 253, 250, 245), outline=(218, 204, 188, 255),
              width=2.2)
    lay.rrect((5, 5, 91, 44), 16.0, fill=(255, 255, 255, 150))
    return lay.out()


def ui_icon(kind):
    lay = Layer(32, 32)
    if kind == "coin":
        lay.ell(16, 16, 12.2, 12.2, fill=C("gold"), outline=C("ink"), width=1.4)
        lay.ell(16, 16, 9.4, 9.4, fill=C("gold_d", 110))
        lay.ell(16, 16, 8.6, 8.6, fill=C("gold"))
        lay.ell(12.2, 11.6, 3.6, 3.0, fill=C("gold_l"))
        lay.rrect((14.4, 10.2, 17.6, 21.8), 1.5, fill=C("gold_d"), outline=C("ink", 120), width=0.8)
    elif kind == "skull":
        lay.ell(16, 14.2, 11.2, 10.4, fill=C("white"), outline=C("ink"), width=1.4)
        lay.rrect((10.8, 19.5, 21.2, 27.0), 3.2, fill=C("white"), outline=C("ink"), width=1.3)
        lay.ell(16, 14.4, 9.8, 8.8, fill=C("white"))
        for ex in (11.8, 20.2):
            lay.ell(ex, 14.2, 3.2, 3.6, fill=C("eye"))
            lay.dot(ex - 0.8, 13.0, 0.8, C("white"))
        lay.poly([(16, 17.8), (14.2, 21.0), (17.8, 21.0)], fill=C("eye"))
        for x in (13.2, 16.0, 18.8):
            lay.line([(x, 22.2), (x, 26.2)], fill=C("ink"), width=1.2)
    elif kind == "cat":
        for ex in (7.5, 24.5):
            lay.poly([(ex - 4.5, 12.0), (ex, 2.2), (ex + 4.5, 12.0)], fill=C("cat"),
                     outline=C("ink"), width=1.3)
            lay.poly([(ex - 2.2, 11.0), (ex, 5.2), (ex + 2.2, 11.0)], fill=C("pink"))
        lay.ell(16, 17.8, 12.2, 10.8, fill=C("cat"), outline=C("ink"), width=1.4)
        lay.ell(16, 21.2, 8.5, 6.2, fill=C("cat_cream"))
        for ex in (11.4, 20.6):
            lay.ell(ex, 16.6, 2.9, 3.3, fill=C("eye"))
            lay.dot(ex - 0.6, 15.4, 1.0, C("white"))
        lay.poly([(14.6, 20.0), (17.4, 20.0), (16, 22.0)], fill=C("pink_d"))
    elif kind == "clock":
        lay.ell(16, 16.5, 12.0, 12.0, fill=C("white"), outline=C("ink"), width=1.5)
        lay.ell(16, 16.5, 9.6, 9.6, outline=C("stone_l"), width=1.2)
        lay.line([(16, 16.5), (16, 9.2)], fill=C("ink"), width=2.0)
        lay.line([(16, 16.5), (21.5, 19.2)], fill=C("scarf"), width=1.8)
        lay.dot(16, 16.5, 1.6, C("ink"))
    return lay.out()


def app_icon():
    S = 512
    lay = Layer(S, S, ss=2)
    lay.rrect((0, 0, S, S), 104.0, fill=(255, 214, 136, 255))
    lay.clip(lay.mask_of(), lambda l: l.ell(S * 0.5, S * 1.02, S * 0.58, S * 0.44,
                                            fill=(248, 178, 92, 255)))
    for ex in (S * 0.28, S * 0.72):
        lay.poly([(ex - 78, 250), (ex, 104), (ex + 78, 250)], fill=C("cat"),
                 outline=C("ink"), width=10)
        lay.poly([(ex - 42, 240), (ex, 152), (ex + 44, 240)], fill=C("pink"))
    lay.ell(S * 0.5, 300, 192, 172, fill=C("cat"), outline=C("ink"), width=10)
    lay.ell(S * 0.5, 352, 158, 108, fill=C("cat_cream"))
    for ex in (S * 0.36, S * 0.64):
        lay.ell(ex, 286, 48, 54, fill=C("white"), outline=C("ink"), width=6)
        lay.ell(ex, 292, 28, 32, fill=C("eye"))
        lay.dot(ex - 10, 274, 12, C("white"))
    lay.line([(S * 0.36 - 66, 232), (S * 0.36 + 46, 254)], fill=C("ink"), width=14)
    lay.line([(S * 0.64 + 66, 232), (S * 0.64 - 46, 254)], fill=C("ink"), width=14)
    lay.poly([(S * 0.5 - 26, 344), (S * 0.5 + 26, 344), (S * 0.5, 372)], fill=C("pink_d"))
    lay.arc(S * 0.5, 386, 74, 46, 20, 160, fill=C("ink"), width=12)
    return lay.out()


# ===========================================================================
# 7. 主流程
# ===========================================================================
def gen_sprites():
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
    """产出《美术风格小样》—— 供确认风格用的静态预览图（ss=2，支持原生中文字体）。"""
    W, H = 1280, 1000
    ps = 2
    lay = Layer(W, H, ss=ps)
    lay.rrect((0, 0, W, H), 0, fill=(248, 245, 240, 255))
    lay.rrect((0, 0, W, 96), 0, fill=(54, 38, 44, 255))
    lay.ell(70, 48, 26, 26, fill=C("cat"), outline=C("ink"), width=2)
    lay.poly([(50, 34), (56, 8), (68, 30)], fill=C("cat"))
    lay.poly([(90, 30), (102, 8), (108, 34)], fill=C("cat"))
    lay.ell(62, 46, 5, 6, fill=C("eye"))
    lay.ell(84, 46, 5, 6, fill=C("eye"))
    lay.poly([(70, 54), (78, 54), (74, 62)], fill=C("pink_d"))

    def txt(x, y, s, size=20, fill=(54, 38, 44, 255)):
        try:
            from PIL import ImageFont
        except ImportError:
            from _pil_shim import ImageFont
        f = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", size * ps)
        lay.d.text((x * ps, y * ps), s, font=f, fill=fill)

    txt(120, 22, "猫咪历险记  Cat's Perilous Adventure", 30, (255, 236, 214, 255))
    txt(120, 60, "STUDIO ART SAMPLE  ·  高分辨率精致卡通 · 48px 瓦片 / 64px 角色", 15,
        (206, 188, 178, 255))

    def paste_center(img, cx, cy, scale=1):
        if scale != 1:
            img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        img_ss = img.resize((img.width * ps, img.height * ps), Image.LANCZOS)
        lay.im.alpha_composite(img_ss, (int(cx * ps - img_ss.width / 2), int(cy * ps - img_ss.height / 2)))
        lay._refresh()

    y = 122
    txt(40, y, "主角 · 冒险橘猫（配红领巾与金铃铛，小 / 大 两种形态，各 12 帧动画）", 19)
    y += 28
    cat_s = Image.open(os.path.join(ASSETS, "sprites", "cat_small.png"))
    cat_b = Image.open(os.path.join(ASSETS, "sprites", "cat_big.png"))
    paste_center(cat_s, 230, y + 48, 0.82)
    paste_center(cat_b, 230 + 420, y + 48, 0.82)
    txt(40, y + 100, "小猫：初始形态", 15, (140, 120, 116, 255))
    txt(480, y + 100, "大猫：长飘带领巾，受伤退化为小猫", 15, (140, 120, 116, 255))
    y += 132

    txt(40, y, "原创敌人（恶魔毛线球怪 / 夜盗乌鸦 / 跳跳鱼 / 毒蝇伞蘑菇陷阱怪）", 19)
    y += 30
    for i, n in enumerate(("enemy_yarn", "enemy_crow", "enemy_fish", "enemy_mushroom")):
        im = Image.open(os.path.join(ASSETS, "sprites", n + ".png"))
        paste_center(im, 150 + i * 300, y + 26)
    y += 70

    txt(40, y, "收集品与道具（金鱼币 / 无敌星 / 高级猫罐头）＋ 鲤鱼旗终点杆", 19)
    y += 30
    for i, n in enumerate(("item_goldfish", "item_star", "item_can")):
        im = Image.open(os.path.join(ASSETS, "sprites", n + ".png"))
        paste_center(im, 150 + i * 130, y + 20)
    paste_center(Image.open(os.path.join(ASSETS, "sprites", "goal_flagfish.png")), 640, y + 20)
    paste_center(Image.open(os.path.join(ASSETS, "sprites", "goal_pole.png")), 820, y + 20, 0.5)
    y += 60

    txt(40, y, "瓦片（48×48，全出血无缝，自然层状土与丰茂草檐）", 19)
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
        paste_center(im, 110 + i * 260, y + 26)
        txt(110 + i * 260 - 36, y + 54, n, 13, (150, 132, 128, 255))
    y += 100

    txt(40, y, "天空装饰：普通云 / 伪装云 / 普通太阳 / 伪装太阳 ＋ 精致 UI 图标", 19)
    y += 34
    paste_center(Image.open(os.path.join(ASSETS, "ui", "cloud_soft.png")), 160, y + 20, 0.8)
    paste_center(Image.open(os.path.join(ASSETS, "ui", "cloud_evil.png")), 340, y + 20, 0.8)
    paste_center(Image.open(os.path.join(ASSETS, "ui", "sun_soft.png")), 560, y + 20, 0.7)
    paste_center(Image.open(os.path.join(ASSETS, "ui", "sun_evil.png")), 720, y + 20, 0.7)
    for i, k in enumerate(("coin", "skull", "cat", "clock")):
        paste_center(Image.open(os.path.join(ASSETS, "ui", f"icon_{k}.png")), 900 + i * 60, y + 20)
    y += 70

    txt(40, y, "背景视差层（远景雪山丘陵 / 中景茂密森林，均可横向无缝平铺）", 19)
    y += 28
    far = Image.open(os.path.join(ASSETS, "ui", "bg_far.png")).resize((580 * ps, 210 * ps), Image.LANCZOS)
    mid = Image.open(os.path.join(ASSETS, "ui", "bg_mid.png")).resize((580 * ps, 210 * ps), Image.LANCZOS)
    lay.im.alpha_composite(far.convert("RGBA"), (40 * ps, y * ps))
    lay.im.alpha_composite(mid.convert("RGBA"), (660 * ps, y * ps))
    lay._refresh()

    lay.out().save(os.path.join(ASSETS, "preview", "style-sample.png"))


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
