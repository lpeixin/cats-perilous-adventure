#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
关卡构建器
==============================================================
把关卡设计写成"可读的 Python 描述"，然后导出成 src/levels/levelN.json。

导出的 JSON 里 rows 就是一张 ASCII 地图，可以直接手工编辑
（改一个字符就改一个机关），这个脚本只是让**初次设计**更省事、
并且方便一次性校验坑位坐标。

运行：
    python3 tools/build_levels.py          # 生成三关
    python3 tools/build_levels.py --show   # 生成并把地图打印出来核对
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "levels")

GROUND_ROW = 12          # 地表所在行（角色站在这一行的上沿）
HEIGHT = 16              # 关卡高度（格）


class Level:
    def __init__(self, width, height=HEIGHT, name="", subtitle=""):
        self.w = width
        self.h = height
        self.name = name
        self.subtitle = subtitle
        self.grid = [[" "] * width for _ in range(height)]
        self.blocks = {}          # "cx,cy" -> 道具名（覆盖问号砖内容）
        self.spawn = (2, GROUND_ROW - 1)

    # -- 基础写入 ---------------------------------------------------------
    def put(self, cx, cy, ch):
        if 0 <= cx < self.w and 0 <= cy < self.h:
            self.grid[cy][cx] = ch
        return self

    def rect(self, c0, c1, r0, r1, ch):
        for y in range(r0, r1 + 1):
            for x in range(c0, c1 + 1):
                self.put(x, y, ch)
        return self

    # -- 常用地形 ---------------------------------------------------------
    def ground(self, c0, c1, surface=GROUND_ROW, thickness=4):
        """一整块草地，顶部自动画草（由引擎按"上方是否为空"判断）"""
        return self.rect(c0, c1, surface, surface + thickness - 1, "#")

    def platform(self, c0, c1, row, ch="S"):
        return self.rect(c0, c1, row, row, ch)

    def brick_row(self, c0, c1, row):
        return self.rect(c0, c1, row, row, "B")

    def pipe(self, c0, row_top, height=2):
        """2 格宽、height 格高的管道"""
        return self.rect(c0, c0 + 1, row_top, row_top + height - 1, "P")

    def crumble_bridge(self, c0, c1, row=GROUND_ROW):
        return self.rect(c0, c1, row, row, "*")

    def spikes(self, c0, c1, row=GROUND_ROW + 3):
        return self.rect(c0, c1, row, row, "^")

    def lava(self, c0, c1, row=GROUND_ROW + 3):
        return self.rect(c0, c1, row, row, "~")

    # -- 实体 -------------------------------------------------------------
    def item(self, cx, cy, kind):
        ch = {"goldfish": "c", "star": "s", "can": "m"}[kind]
        return self.put(cx, cy, ch)

    def enemy(self, cx, cy, kind):
        ch = {"yarn": "1", "crow": "2", "fish": "3", "mushroom": "4"}[kind]
        return self.put(cx, cy, ch)

    def coin_row(self, c0, c1, row):
        for x in range(c0, c1 + 1):
            self.item(x, row, "goldfish")
        return self

    # -- 陷阱 -------------------------------------------------------------
    def invisible(self, cx, cy):
        return self.put(cx, cy, "H")

    def question(self, cx, cy, item="goldfish"):
        self.put(cx, cy, "?")
        if item != "goldfish":
            self.blocks[f"{cx},{cy}"] = item
        return self

    def fake_question(self, cx, cy):
        """假道具真陷阱：顶出来的是会扑咬的蘑菇怪"""
        return self.put(cx, cy, "!")

    def conveyor(self, c0, c1, row):
        """视觉误导的高台（隐藏向下传送带），外观与石块完全一致"""
        return self.rect(c0, c1, row, row, ">")

    def ambush(self, pipe_cx, pipe_row_top):
        """在管道正上方放一个伏兵标记"""
        return self.put(pipe_cx, pipe_row_top - 1, "A")

    def evil_cloud(self, cx, cy):
        return self.put(cx, cy, "v")

    def evil_sun(self, cx, cy):
        return self.put(cx, cy, "o")

    def cloud(self, cx, cy):
        return self.put(cx, cy, ".")

    def fake_goal(self, cx, cy=GROUND_ROW - 1):
        return self.put(cx, cy, "F")

    def real_goal(self, cx, cy=GROUND_ROW - 1):
        return self.put(cx, cy, "f")

    # -- 导出 -------------------------------------------------------------
    def to_json(self):
        rows = ["".join(r).rstrip() for r in self.grid]
        # 首行/末行全空的情况无所谓，Phaser 端会按 width 补齐
        data = {
            "name": self.name,
            "subtitle": self.subtitle,
            "tileSize": 48,
            "width": self.w,
            "height": self.h,
            "spawn": {"x": self.spawn[0], "y": self.spawn[1]},
            "rows": rows,
        }
        if self.blocks:
            data["blocks"] = self.blocks
        return data

    def show(self):
        print("   " + "".join(str(i // 10 % 10) for i in range(self.w)))
        print("   " + "".join(str(i % 10) for i in range(self.w)))
        for y, row in enumerate(self.grid):
            print(f"{y:2d} " + "".join(row))


# ===========================================================================
# 第一关 · 后院初探  —— 教学向：坑少但每类陷阱都露面一次
# ===========================================================================
def level1():
    L = Level(200, name="第一关 · 后院初探", subtitle="看起来人畜无害的那种")

    # 地形：7 段草地，中间留 6 个坑
    L.ground(0, 30)
    L.ground(34, 56)
    L.ground(62, 86)
    L.ground(92, 116)
    L.ground(122, 146)
    L.ground(152, 172)
    L.ground(178, 199)

    # ---- A 起步区：认识操作，顺便被"隐形墙"友善地提醒一下 ----
    L.spawn = (2, GROUND_ROW - 1)
    L.coin_row(8, 10, 10)
    L.question(13, 9)
    L.cloud(6, 3).cloud(20, 2).cloud(26, 4)
    L.enemy(20, GROUND_ROW - 1, "yarn")
    # 第一个陷阱：平地前方突然出现的隐形墙（不致死，只是让你"咦？"）
    L.invisible(27, GROUND_ROW - 1)
    # 跳起来才会撞到的隐形砖（教学：这个游戏连空气都不能信）
    L.invisible(23, 8)

    # ---- B 砖块区：真道具 + 第一个"假道具真陷阱" ----
    L.brick_row(38, 42, 8)
    L.question(40, 8, "can")
    L.fake_question(46, 8)
    L.enemy(50, GROUND_ROW - 1, "yarn")
    # 地板消失陷阱：伪装成草地的碎裂地板，横跨 31-33 号坑右边的 57-61 号坑
    L.crumble_bridge(57, 61)

    # ---- C 管道区：突然弹出的水管敌人 ----
    L.pipe(66, 10, 2)
    L.ambush(66, 10)
    L.pipe(76, 10, 2)
    L.enemy(72, GROUND_ROW - 1, "yarn")
    L.coin_row(70, 71, 9)

    # ---- D 高台区：视觉误导的高台 + 隐藏向下传送带 ----
    L.conveyor(117, 121, 11)
    L.item(119, 9, "goldfish")
    L.enemy(105, 7, "crow")
    L.question(100, 9)

    # ---- E 天空区：伪装成背景装饰的掉落物 ----
    L.cloud(126, 3)
    L.evil_cloud(132, 3)
    L.cloud(138, 3)
    L.evil_sun(142, 2)
    L.enemy(130, GROUND_ROW - 1, "yarn")
    # 致命版隐形砖块：正好卡在跨坑跳跃的路径上
    L.invisible(146, 10)

    # ---- F 假通关旗杆 ----
    L.enemy(156, GROUND_ROW - 1, "yarn")
    L.cloud(160, 3)
    L.fake_goal(163)

    # ---- G 真终点：临门一脚的终极整活 ----
    L.evil_sun(182, 2)
    L.coin_row(185, 187, 10)
    L.item(190, 9, "star")
    L.real_goal(194)
    return L


# ===========================================================================
# 第二关 · 屋顶与水管 —— 平台变多，坑开始组合出现
# ===========================================================================
def level2():
    L = Level(210, name="第二关 · 屋顶与水管", subtitle="这次连地板都不能信了")

    L.ground(0, 22)
    L.ground(28, 44)
    L.ground(52, 70)
    L.ground(78, 96)
    L.ground(104, 126)
    L.ground(134, 152)
    L.ground(160, 180)
    L.ground(188, 209)

    # ---- A 开局：地板消失 + 水管伏兵组合 ----
    L.spawn = (2, GROUND_ROW - 1)
    L.coin_row(6, 8, 10)
    L.question(11, 9, "can")
    L.enemy(16, GROUND_ROW - 1, "yarn")
    L.cloud(5, 3).cloud(18, 2)
    # 一上来就是伪装成草地的碎裂地板
    L.crumble_bridge(23, 27)

    # ---- B 屋顶跳跃：平台 + 乌鸦 + 隐形砖 ----
    L.platform(30, 33, 9, "S")
    L.platform(36, 39, 7, "S")
    L.enemy(34, 5, "crow")
    L.coin_row(36, 39, 6)
    L.invisible(41, 8)
    L.enemy(42, GROUND_ROW - 1, "yarn")
    L.evil_cloud(38, 2)

    # ---- C 管道迷宫：三根管道 + 两个伏兵 ----
    L.pipe(55, 10, 2)
    L.ambush(55, 10)
    L.pipe(62, 10, 2)
    L.pipe(66, 9, 3)
    L.ambush(66, 9)
    L.enemy(59, GROUND_ROW - 1, "yarn")
    L.coin_row(60, 61, 8)
    # 管道上方一个假问号砖
    L.fake_question(70, 7)

    # ---- D 碎裂地板长廊 ----
    L.crumble_bridge(71, 77)
    L.evil_sun(74, 2)
    L.enemy(84, GROUND_ROW - 1, "yarn")
    L.coin_row(82, 84, 10)
    L.question(90, 9, "star")

    # ---- E 传送带陷阱区 ----
    L.conveyor(97, 103, 11)
    L.coin_row(99, 101, 9)
    L.enemy(108, 7, "crow")
    L.enemy(114, GROUND_ROW - 1, "mushroom")
    L.cloud(110, 3).cloud(120, 2)

    # ---- F 双重陷阱：隐形砖 + 天空掉落 ----
    L.invisible(121, 10)
    L.evil_cloud(118, 3)
    L.crumble_bridge(127, 133)
    L.enemy(138, GROUND_ROW - 1, "yarn")
    L.brick_row(140, 144, 8)
    L.fake_question(142, 8)
    L.coin_row(140, 144, 7)

    # ---- G 假通关 + 真终点 ----
    L.evil_sun(148, 2)
    L.fake_goal(166)
    L.enemy(170, GROUND_ROW - 1, "yarn")
    L.evil_cloud(176, 3)
    L.invisible(183, 10)
    L.coin_row(190, 192, 10)
    L.item(196, 9, "can")
    L.real_goal(202)
    return L


# ===========================================================================
# 第三关 · 太阳的恶意 —— 陷阱密集、连环组合，签名笑点拉满
# ===========================================================================
def level3():
    L = Level(220, name="第三关 · 太阳的恶意", subtitle="祝你活过三十秒")

    L.ground(0, 18)
    L.ground(24, 38)
    L.ground(46, 60)
    L.ground(68, 88)
    L.ground(96, 112)
    L.ground(120, 138)
    L.ground(146, 164)
    L.ground(172, 192)
    L.ground(200, 219)

    # ---- A 开局即下马威：连续两块伪装草地 ----
    L.spawn = (2, GROUND_ROW - 1)
    L.coin_row(5, 7, 10)
    L.cloud(4, 3)
    L.crumble_bridge(19, 23)
    L.crumble_bridge(39, 45)
    L.evil_sun(21, 2)

    # ---- B 空中走廊：平台 + 乌鸦群 + 隐形砖 ----
    L.platform(26, 29, 9, "S")
    L.platform(32, 35, 7, "S")
    L.invisible(31, 8)
    L.enemy(28, 5, "crow")
    L.enemy(34, 4, "crow")
    L.coin_row(32, 35, 6)
    L.question(50, 9, "can")
    L.fake_question(55, 9)

    # ---- C 水管连发 + 传送带 ----
    L.pipe(48, 10, 2)
    L.ambush(48, 10)
    L.pipe(52, 10, 2)
    L.enemy(57, GROUND_ROW - 1, "yarn")
    L.conveyor(61, 67, 11)
    L.coin_row(63, 65, 9)
    L.evil_cloud(64, 3)

    # ---- D 蘑菇陷阱怪大本营 ----
    L.enemy(72, GROUND_ROW - 1, "mushroom")
    L.enemy(80, GROUND_ROW - 1, "mushroom")
    L.enemy(76, 7, "crow")
    L.fake_question(74, 8)
    L.fake_question(82, 8)
    L.item(78, 9, "star")
    L.crumble_bridge(89, 95)
    L.evil_sun(92, 2)

    # ---- E 隐形墙长廊 ----
    L.invisible(98, GROUND_ROW - 1)
    L.invisible(103, 10)
    L.invisible(107, GROUND_ROW - 1)
    L.enemy(100, GROUND_ROW - 1, "yarn")
    L.coin_row(104, 106, 10)
    L.evil_cloud(108, 3)

    # ---- F 三连坑 + 三连掉落 ----
    L.crumble_bridge(113, 119)
    L.evil_sun(116, 2)
    L.pipe(122, 10, 2)
    L.ambush(122, 10)
    L.pipe(126, 9, 3)
    L.ambush(126, 9)
    L.enemy(132, GROUND_ROW - 1, "yarn")
    L.fake_question(135, 8)
    L.crumble_bridge(139, 145)
    L.evil_cloud(142, 3)

    # ---- G 最后的整活 ----
    L.evil_sun(150, 2)
    L.enemy(154, GROUND_ROW - 1, "mushroom")
    L.invisible(158, 10)
    L.crumble_bridge(165, 171)
    L.coin_row(166, 170, 10)
    L.fake_goal(178)
    L.evil_cloud(184, 3)
    L.evil_sun(190, 2)
    L.enemy(188, GROUND_ROW - 1, "yarn")
    L.invisible(196, 10)
    L.item(203, 9, "star")
    L.coin_row(206, 208, 10)
    L.real_goal(213)
    return L


LEVELS = {
    1: level1,
    2: level2,
    3: level3,
}


def main():
    show = "--show" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    for idx, fn in LEVELS.items():
        L = fn()
        data = L.to_json()
        path = os.path.join(OUT, f"level{idx}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")

        # 统计机关数量，方便核对"每关至少 3 种陷阱"
        counts = {}
        for row in L.grid:
            for ch in row:
                if ch in "H!*>voF":
                    counts[ch] = counts.get(ch, 0) + 1
        names = {"H": "隐形砖块", "!": "假道具砖", "*": "碎裂地板",
                 ">": "隐藏传送带", "v": "伪装云", "o": "伪装太阳", "F": "假通关旗"}
        summary = "　".join(f"{names[k]}×{v}" for k, v in sorted(counts.items()))
        print(f"  ✓ level{idx}.json  {L.w}×{L.h}  {L.name}")
        print(f"      陷阱：{summary}")
        if show:
            L.show()
            print()


if __name__ == "__main__":
    main()
