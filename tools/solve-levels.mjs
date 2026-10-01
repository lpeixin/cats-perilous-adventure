#!/usr/bin/env node
/**
 * 关卡「可通关性」静态求解器
 * ===========================================================================
 * 冒烟测试（tools/smoke-test.html）验证的是**机制**：踩敌人会不会死、
 * 碎裂地板会不会消失、旗杆会不会触发结算…… 它不回答一个更基本的问题：
 *
 *     「这一关，用真实物理参数，到底能不能从头走到尾？」
 *
 * 一关做出来如果中间有个 6 格宽的坑而猫最多只能跳 5 格，那么所有机制测试
 * 都会通过，玩家却永远卡在那里 —— 这正是 §7「≥3 个可以完整通关的原创关卡」
 * 这条要求需要被真正验证的地方。
 *
 * 做法：不猜、不用公式估算，而是**把猫的物理原样重写一遍**（参数直接读
 * src/utils/constants.js，逻辑对着 src/entities/Cat.js 抄），然后对关卡做一次
 * 落点图搜索（landing-point graph BFS）：
 *
 *   1. 从「站在某处地面上」这个状态出发，枚举一批宏观动作
 *      （朝左/右 × 走/跑 × 助跑若干帧 × 跳跃键按住的帧数，或干脆不跳）；
 *   2. 每个动作把猫往前推演，直到它**重新落到地面**（或掉进坑里死掉）；
 *   3. 落点成为图上的新节点，继续 BFS；
 *   4. 如果终点旗杆的触发区能被猫的碰撞盒碰到 → 这一关可通关。
 *
 * 为什么用「宏观动作」而不是逐帧搜索：平台游戏里玩家的决策点其实很少，
 * 就是「站在这里，往哪边、跳多高」。把每个决策点之间的弹道用真实物理
 * 推完，搜索空间就从 60 帧/秒的指数爆炸降到几百个节点的图。
 *
 * 注意：本工具**只验证几何可达性**，不模拟陷阱伤害 —— 陷阱（碎裂地板、
 * 掉落物、伏兵）只会让路变难，不会让路变得不可达。所以「可通关」是
 * 必要条件，不是充分条件；真实难度仍然要靠人试玩。
 *
 * 用法:
 *   node tools/solve-levels.mjs               # 检查全部关卡
 *   node tools/solve-levels.mjs --level 2     # 只查第二关
 *   node tools/solve-levels.mjs --path        # 打印通关路线上的关键跳点
 *   node tools/solve-levels.mjs --verbose     # 打印搜索规模统计
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLevel } from '../src/utils/levelLoader.js';
import { PHYS, TILE, CAT, LEVELS } from '../src/utils/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const ONLY = (() => {
  const i = argv.indexOf('--level');
  return i >= 0 ? Number(argv[i + 1]) : null;
})();
const SHOW_PATH = argv.includes('--path');
const VERBOSE = argv.includes('--verbose');

// ---------------------------------------------------------------------------
// 猫的物理模型（与 src/entities/Cat.js 保持一致）
// ---------------------------------------------------------------------------
const DT = 1 / 60;
const CW = CAT.SMALL_W;   // 26
const CH = CAT.SMALL_H;   // 32
const HW = CW / 2;

/** 一帧最多推演多少个物理步（约 5 秒），防止极端情况下死循环 */
const MAX_FRAMES = 300;
/** 猫掉到这个高度以下就算掉出世界 */
const FALL_LIMIT_PAD = 400;

// ---------------------------------------------------------------------------
// 瓦片网格
// ---------------------------------------------------------------------------
function buildGrid(level) {
  const W = level.width;
  const H = level.height;
  const solid = new Uint8Array(W * H);
  const deadly = new Uint8Array(W * H);

  for (const t of level.tiles) {
    if (t.cx >= 0 && t.cx < W && t.cy >= 0 && t.cy < H) solid[t.cy * W + t.cx] = 1;
  }
  for (const d of level.deadly) {
    if (d.cx >= 0 && d.cx < W && d.cy >= 0 && d.cy < H) deadly[d.cy * W + d.cx] = 1;
  }
  return { W, H, solid, deadly, worldBottom: H * TILE + FALL_LIMIT_PAD };
}

/** 猫的碰撞盒（左下角对齐到 (x - HW, y - CH)，y 是脚底）是否压到实心瓦片 */
function hitsSolid(g, x, y) {
  const x0 = Math.floor((x - HW) / TILE);
  const x1 = Math.floor((x + HW - 1e-6) / TILE);
  const y0 = Math.floor((y - CH) / TILE);
  const y1 = Math.floor((y - 1e-6) / TILE);

  for (let cy = y0; cy <= y1; cy++) {
    if (cy < 0) continue;          // 天上是空的
    if (cy >= g.H) continue;       // 地下是虚空
    const row = cy * g.W;
    for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cx >= g.W) return true;   // 左右边界当墙
      if (g.solid[row + cx]) return true;
    }
  }
  return false;
}

/** 是否踩在即死地形上（尖刺 / 岩浆） */
function hitsDeadly(g, x, y) {
  const x0 = Math.floor((x - HW) / TILE);
  const x1 = Math.floor((x + HW - 1e-6) / TILE);
  const y0 = Math.floor((y - CH) / TILE);
  const y1 = Math.floor((y - 1e-6) / TILE);

  for (let cy = y0; cy <= y1; cy++) {
    if (cy < 0 || cy >= g.H) continue;
    const row = cy * g.W;
    for (let cx = x0; cx <= x1; cx++) {
      if (cx < 0 || cx >= g.W) continue;
      if (g.deadly[row + cx]) return true;
    }
  }
  return false;
}

/**
 * 沿一个轴推进一步，撞墙时回退到「刚好贴着」的位置。
 * 用二分而不是逐像素，是因为一帧最多移动 ~16px，二分 6 次精度已到 0.25px。
 */
function stepAxis(g, x, y, d, isX) {
  const nx = isX ? x + d : x;
  const ny = isX ? y : y + d;
  if (!hitsSolid(g, nx, ny)) return { x: nx, y: ny, blocked: false };

  let lo = 0;
  let hi = d;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    const px = isX ? x + mid : x;
    const py = isX ? y : y + mid;
    if (hitsSolid(g, px, py)) hi = mid; else lo = mid;
  }
  return { x: isX ? x + lo : x, y: isX ? y : y + lo, blocked: true };
}

// ---------------------------------------------------------------------------
// 宏观动作
// ---------------------------------------------------------------------------
// 跳跃键按住的帧数。0 = 起跳后立刻松手（最矮的跳），越大跳得越高，
// 到 40 帧左右就已经是满跳（此时 vy 已经转正，再按住也没用）。
const HOLDS = [0, 1, 2, 3, 4, 6, 8, 11, 15, 20, 28, 40];
/** 起跳前在地面上先跑几帧（决定起跳瞬间的水平速度） */
const RUN_UPS = [0, 6, 18];
/** 纯跑动（不跳）时，最多跑多少帧就收手，避免平地无限跑 */
const GROUND_RUN_FRAMES = 90;

function buildActions() {
  const acts = [];
  for (const dir of [-1, 1]) {
    for (const run of [false, true]) {
      for (const runUp of RUN_UPS) {
        for (const hold of HOLDS) acts.push({ dir, run, runUp, hold });
      }
      // 「不跳，只跑」——用来在平地上加速，也是唯一能产生"高速助跑节点"的动作
      acts.push({ dir, run, runUp: 0, hold: null });
    }
  }
  return acts;
}
const ACTIONS = buildActions();

/**
 * 从状态 s 执行动作 act，推演到落点。
 * @returns {{ok:boolean, x:number, y:number, vx:number, goal:boolean, died:boolean, frames:number}}
 */
function simulate(g, s, act, goalRect) {
  let x = s.x;
  let y = s.y;
  let vx = s.vx;
  let vy = 0;

  let onGround = true;
  let airborne = false;
  let jumped = false;
  let jumpHeld = false;

  // 跳跃发生在助跑结束的那一帧
  const jumpFrame = act.hold === null ? -1 : act.runUp;
  const maxSpeed = act.run ? PHYS.RUN_SPEED : PHYS.WALK_SPEED;

  for (let f = 0; f < MAX_FRAMES; f++) {
    // ---- 起跳 ----
    if (f === jumpFrame && onGround) {
      let jv = PHYS.JUMP_VELOCITY;
      // 奔跑时跳得更高（Cat.js 里是 |vx| > WALK_SPEED + 30）
      if (Math.abs(vx) > PHYS.WALK_SPEED + 30) jv = PHYS.JUMP_BOOST;
      vy = jv;
      jumped = true;
      jumpHeld = true;
    }

    const jumpDown = jumped && f >= jumpFrame && f < jumpFrame + act.hold;

    // ---- 水平 ----
    const accel = onGround ? PHYS.GROUND_ACCEL : PHYS.AIR_ACCEL;
    const target = act.dir * maxSpeed;
    let nvx = vx + act.dir * accel * DT;
    nvx = act.dir > 0 ? Math.min(nvx, target) : Math.max(nvx, target);
    vx = nvx;

    // ---- 垂直 ----
    vy += PHYS.GRAVITY * DT;
    if (vy > PHYS.MAX_FALL) vy = PHYS.MAX_FALL;

    // ---- 可变跳跃高度：松手立刻截断上升 ----
    if (jumpHeld && !jumpDown) {
      if (vy < PHYS.JUMP_CUT) vy = PHYS.JUMP_CUT;
      jumpHeld = false;
    }

    // ---- 位移与碰撞 ----
    const mx = stepAxis(g, x, y, vx * DT, true);
    if (mx.blocked) vx = 0;
    x = mx.x;

    const my = stepAxis(g, x, y, vy * DT, false);
    const wasGround = onGround;
    if (my.blocked) {
      onGround = vy > 0;        // 只有向下撞才是"落地"，向上撞是撞天花板
      vy = 0;
    } else {
      onGround = false;
    }
    y = my.y;

    // ---- 终点判定 ----
    if (goalRect
        && x + HW > goalRect.left && x - HW < goalRect.right
        && y > goalRect.top && y - CH < goalRect.bottom) {
      return { ok: true, x, y, vx, goal: true, died: false, frames: f };
    }

    // ---- 死亡判定 ----
    if (y > g.worldBottom) return { ok: false, x, y, vx, goal: false, died: true, frames: f };
    if (hitsDeadly(g, x, y)) return { ok: false, x, y, vx, goal: false, died: true, frames: f };

    // ---- 状态迁移 ----
    if (wasGround && !onGround) airborne = true;

    if (airborne && onGround) {
      return { ok: true, x, y, vx, goal: false, died: false, frames: f };
    }

    // 「只跑不跳」的动作：平地跑到上限就收手，把当前状态当作一个落点
    if (act.hold === null && !airborne && f + 1 >= GROUND_RUN_FRAMES) {
      return { ok: true, x, y, vx, goal: false, died: false, frames: f };
    }
  }

  // 超时：没落地也没死，通常是卡在墙角原地跳。不当作有效落点。
  return { ok: false, x, y, vx, goal: false, died: false, frames: MAX_FRAMES };
}

// ---------------------------------------------------------------------------
// 搜索
// ---------------------------------------------------------------------------
const key = (x, y, vx) =>
  `${Math.round(x / 4)}|${Math.round(y / 4)}|${Math.round(vx / 50)}`;

function solve(level) {
  const g = buildGrid(level);

  const realGoal = level.entities.find((e) => e.type === 'goalReal');
  const goalRect = realGoal
    ? {
        left: realGoal.cx * TILE + TILE / 2 - (TILE * 1.2) / 2,
        right: realGoal.cx * TILE + TILE / 2 + (TILE * 1.2) / 2,
        top: (realGoal.cy + 1) * TILE - 196,
        bottom: (realGoal.cy + 1) * TILE + 4,
      }
    : null;

  const start = {
    x: level.spawn.x * TILE + TILE / 2,
    y: (level.spawn.y + 1) * TILE,
    vx: 0,
  };

  const startKey = key(start.x, start.y, start.vx);
  const seen = new Map([[startKey, { x: start.x, y: start.y, vx: start.vx, parent: null, via: null }]]);
  const queue = [startKey];

  let sims = 0;
  let goalNode = null;
  let head = 0;
  let maxX = start.x;

  while (head < queue.length) {
    const k = queue[head++];
    const node = seen.get(k);
    if (node.y > g.worldBottom) continue;

    for (const act of ACTIONS) {
      const r = simulate(g, node, act, goalRect);
      sims++;
      if (!r.ok) continue;

      if (r.goal) {
        const nk = key(r.x, r.y, r.vx);
        if (!seen.has(nk)) {
          seen.set(nk, { x: r.x, y: r.y, vx: r.vx, parent: k, via: act });
        }
        if (!goalNode) goalNode = nk;
        continue;
      }

      const nk = key(r.x, r.y, r.vx);
      if (seen.has(nk)) continue;
      seen.set(nk, { x: r.x, y: r.y, vx: r.vx, parent: k, via: act });
      if (r.x > maxX) maxX = r.x;
      queue.push(nk);
    }
  }

  // 通关路线
  const route = [];
  if (goalNode) {
    let cur = goalNode;
    while (cur) {
      const n = seen.get(cur);
      route.push(n);
      cur = n.parent;
    }
    route.reverse();
  }

  return { g, goalRect, realGoal, nodes: seen.size, sims, goalNode, route, startKey, maxX };
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

function fmtTile(px) { return (px / TILE).toFixed(2); }

// 理论极限（用真实参数算，作为"余量"的基准）
const AIRTIME_FULL = (2 * Math.abs(PHYS.JUMP_BOOST)) / PHYS.GRAVITY;   // 满跳滞空时间
const MAX_RISE = (PHYS.JUMP_BOOST ** 2) / (2 * PHYS.GRAVITY);          // 最大垂直爬升
const MAX_GAP = PHYS.RUN_SPEED * AIRTIME_FULL;                         // 最大水平跨度（同高度）

/**
 * 从通关路线里挑出最"极限"的几跳，方便调难度。
 *
 * 注意必须把「不跳、只在平地上跑」的动作排除掉：那种动作一帧就能跑 465px，
 * 但它不是跳，跨多远都无所谓。把它混进来会让"跨度最大的跳"这个指标完全失真。
 */
function criticalJumps(route) {
  const air = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const via = b.via;
    if (!via || via.hold === null) continue;   // 只统计真正的跳跃
    air.push({
      col: Math.round(b.x / TILE),
      dx: Math.abs(b.x - a.x),
      rise: a.y - b.y,                          // 正数 = 往上跳
      label: (via.run ? '跑跳' : '走跳') + (via.dir < 0 ? '←' : '→')
        + '（按住 ' + via.hold + ' 帧）',
    });
  }
  const byGap = [...air].sort((p, q) => q.dx - p.dx).slice(0, 3);
  const byRise = [...air].sort((p, q) => q.rise - p.rise).slice(0, 3);
  return { air, byGap, byRise };
}

function reportLevel(meta) {
  const file = path.join(ROOT, meta.file);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const level = parseLevel(raw);

  const t0 = Date.now();
  const res = solve(level);
  const ms = Date.now() - t0;

  console.log('');
  console.log(`${C.bold}${C.cyan}第 ${meta.id} 关 · ${raw.name || meta.name}${C.reset}`);
  console.log(`${C.dim}  ${level.width} × ${level.height} 格 ｜ ${level.tiles.length} 块瓦片 ｜ ${level.entities.length} 个实体${C.reset}`);

  if (!res.realGoal) {
    console.log(`  ${C.red}✖ 没有找到真终点旗杆（'f'）${C.reset}`);
    return { ok: false };
  }

  const flag = res.realGoal;
  console.log(`${C.dim}  真终点旗杆 @ 格 (${flag.cx}, ${flag.cy})${C.reset}`);

  if (VERBOSE) {
    console.log(`${C.dim}  搜索规模: ${res.nodes} 个落点节点 / ${res.sims} 次弹道推演 / ${ms}ms${C.reset}`);
  }

  if (!res.goalNode) {
    console.log(`  ${C.red}${C.bold}✖ 无法通关：从出生点走不到终点旗杆${C.reset}`);
    console.log(`  ${C.yellow}最远只能推进到第 ${Math.round(res.maxX / TILE)} 格`
      + `（终点在第 ${flag.cx} 格）—— 断点就在这附近。${C.reset}`);
    console.log(`  ${C.yellow}通常是：坑太宽跳不过去 / 台子太高爬不上去 / 顶上有东西挡着跳不起来。${C.reset}`);
    return { ok: false };
  }

  const last = res.route[res.route.length - 1];
  console.log(`  ${C.green}${C.bold}✔ 可以通关${C.reset}`
    + `  ${C.dim}（路线 ${res.route.length} 个决策点 ｜ ${res.nodes} 个落点 ｜ ${ms}ms）${C.reset}`);
  console.log(`${C.dim}  终点接触点: 格 x=${fmtTile(last.x)} y=${fmtTile(last.y)}${C.reset}`);

  const { air, byGap, byRise } = criticalJumps(res.route);

  // 头部指标：这一关实际要求玩家做到的最难一跳，以及相对理论极限的余量
  const worstGap = byGap[0];
  const worstRise = byRise[0];
  if (worstGap) {
    const margin = 1 - worstGap.dx / MAX_GAP;
    const tag = margin < 0.12 ? `${C.red}余量很小！${C.reset}`
      : margin < 0.3 ? `${C.yellow}偏紧${C.reset}` : `${C.green}宽松${C.reset}`;
    console.log(`  ${C.bold}最远的一跳${C.reset}：${(worstGap.dx / TILE).toFixed(1)} 格`
      + ` ${C.dim}（第 ${worstGap.col} 格，${worstGap.label}）${C.reset}`);
    console.log(`${C.dim}    理论极限约 ${(MAX_GAP / TILE).toFixed(1)} 格 → 余量 ${(margin * 100).toFixed(0)}% ${C.reset}${tag}`);
  }
  if (worstRise && worstRise.rise > 0) {
    const margin = 1 - worstRise.rise / MAX_RISE;
    const tag = margin < 0.12 ? `${C.red}余量很小！${C.reset}`
      : margin < 0.3 ? `${C.yellow}偏紧${C.reset}` : `${C.green}宽松${C.reset}`;
    console.log(`  ${C.bold}最高的一跳${C.reset}：${(worstRise.rise / TILE).toFixed(1)} 格`
      + ` ${C.dim}（第 ${worstRise.col} 格，${worstRise.label}）${C.reset}`);
    console.log(`${C.dim}    理论极限约 ${(MAX_RISE / TILE).toFixed(1)} 格 → 余量 ${(margin * 100).toFixed(0)}% ${C.reset}${tag}`);
  }
  console.log(`${C.dim}  路线上一共 ${air.length} 次起跳${C.reset}`);

  if (SHOW_PATH && byGap.length) {
    console.log(`  ${C.dim}跨度最大的三跳：${C.reset}`);
    for (const j of byGap) {
      console.log(`${C.dim}    · 第 ${String(j.col).padStart(3)} 格  水平 ${(j.dx / TILE).toFixed(1)} 格  ${j.label}${C.reset}`);
    }
  }
  if (SHOW_PATH && byRise.length && byRise[0].rise > 0) {
    console.log(`  ${C.dim}爬升最高的三跳：${C.reset}`);
    for (const j of byRise) {
      if (j.rise <= 0) continue;
      console.log(`${C.dim}    · 第 ${String(j.col).padStart(3)} 格  上升 ${(j.rise / TILE).toFixed(1)} 格  ${j.label}${C.reset}`);
    }
  }

  return { ok: true, res };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
console.log('');
console.log(`${C.bold}《猫咪历险记》关卡可通关性检查${C.reset}`);
console.log(`${C.dim}用真实物理参数重演猫的弹道，验证每一关能否从出生点走到终点旗杆${C.reset}`);
console.log(`${C.dim}物理参数来源：src/utils/constants.js（重力 ${PHYS.GRAVITY} / 走 ${PHYS.WALK_SPEED} / 跑 ${PHYS.RUN_SPEED} / 起跳 ${PHYS.JUMP_VELOCITY}）${C.reset}`);

const targets = LEVELS.filter((l) => !ONLY || l.id === ONLY);
let allOk = true;
const results = [];

for (const meta of targets) {
  const r = reportLevel(meta);
  results.push({ meta, r });
  if (!r.ok) allOk = false;
}

console.log('');
if (allOk) {
  console.log(`${C.green}${C.bold}RESULT: ALL-REACHABLE${C.reset} —— ${targets.length} 关都能从出生点走到终点旗杆`);
} else {
  console.log(`${C.red}${C.bold}RESULT: UNREACHABLE${C.reset} —— 有 ${results.filter((x) => !x.r.ok).length} 关走不到终点`);
}
console.log('');

process.exit(allOk ? 0 : 1);
