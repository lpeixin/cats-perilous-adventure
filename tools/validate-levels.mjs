#!/usr/bin/env node
/**
 * 关卡校验器
 * ---------------------------------------------------------------
 * 直接复用游戏本体的 src/utils/levelLoader.js（它刻意做成不依赖 Phaser 的纯数据层），
 * 在 Node 里把三关全部解析一遍，检查：
 *
 *   · 是否出现图例里没定义的字符（手改地图时最常见的错误）
 *   · 是否每关都有且只有 1 个真终点、1 个假通关旗杆
 *   · 出生点脚下是否有实心地面（否则一开局就掉下去）
 *   · 每关的陷阱种类是否 ≥ 3 种（需求文档的硬性要求）
 *   · 管道是否成对、隐形砖块是否落在合理高度
 *
 * 用法：npm run validate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLevel, summarizeLevel } from '../src/utils/levelLoader.js';
import { LEGEND, LEVELS, TILE } from '../src/utils/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let warnings = 0;

const fail = (msg) => { console.error(`  ✖ ${msg}`); failures++; };
const warn = (msg) => { console.warn(`  ⚠ ${msg}`); warnings++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ---------------------------------------------------------------------------
// 1) 图例完整性：LEGEND 里不能有重复字符
// ---------------------------------------------------------------------------
console.log('\n【图例检查】');
{
  const seen = new Map();
  for (const [ch, type] of Object.entries(LEGEND)) {
    if (seen.has(ch)) fail(`图例字符 "${ch}" 重复定义`);
    seen.set(ch, type);
  }
  ok(`图例共 ${seen.size} 个字符，无重复`);
}

// ---------------------------------------------------------------------------
// 2) 逐关解析
// ---------------------------------------------------------------------------
for (const cfg of LEVELS) {
  console.log(`\n【关卡 ${cfg.id}】${cfg.nameKey}`);

  const file = path.join(ROOT, cfg.file);
  if (!fs.existsSync(file)) { fail(`找不到 ${cfg.file}`); continue; }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const level = parseLevel(raw);

  if (raw.name) console.log(`  （关卡文件标注：${raw.name}）`);

  ok(`尺寸 ${level.width} × ${level.height} 格（${level.width * TILE} × ${level.height * TILE} px）`);

  // -- 未定义字符 --
  const unknown = new Map();
  for (const row of level.rows) {
    for (const ch of row) {
      if (ch === ' ') continue;
      if (!LEGEND[ch]) unknown.set(ch, (unknown.get(ch) || 0) + 1);
    }
  }
  if (unknown.size) {
    fail(`出现图例未定义的字符：${[...unknown].map(([c, n]) => `"${c}"×${n}`).join(', ')}`);
  } else {
    ok('所有字符都在图例中');
  }

  // -- 陷阱种类统计 --
  const traps = summarizeLevel(level);
  const kinds = Object.keys(traps).length;
  const trapLine = Object.entries(traps).map(([k, v]) => `${k}×${v}`).join('　');
  if (kinds < 3) fail(`陷阱种类只有 ${kinds} 种，需求要求每关至少 3 种`);
  else ok(`陷阱 ${kinds} 种：${trapLine}`);

  // -- 终点 --
  const realGoals = level.entities.filter((e) => e.type === 'goalReal');
  const fakeGoals = level.entities.filter((e) => e.type === 'goalFake');
  if (realGoals.length !== 1) fail(`真终点旗杆数量 = ${realGoals.length}，应为 1`);
  else ok('真终点旗杆 ×1');
  if (fakeGoals.length !== 1) warn(`假通关旗杆数量 = ${fakeGoals.length}，通常应为 1`);
  else ok('假通关旗杆 ×1');
  if (realGoals.length && fakeGoals.length && realGoals[0].cx <= fakeGoals[0].cx) {
    fail('真终点必须在假通关旗杆右侧');
  }

  // -- 出生点 --
  const sp = level.spawn;
  const solidAt = (cx, cy) => level.tiles.some((t) => t.cx === cx && t.cy === cy);
  if (!solidAt(sp.x, sp.y + 1)) {
    fail(`出生点 (${sp.x},${sp.y}) 脚下没有地面`);
  } else {
    ok(`出生点 (${sp.x},${sp.y}) 脚下有地面`);
  }

  // -- 管道成对 --
  const pipes = level.tiles.filter((t) => t.type === 'pipe');
  const pipeCols = [...new Set(pipes.map((t) => t.cx))].sort((a, b) => a - b);
  const odd = [];
  for (let i = 0; i < pipeCols.length; i += 2) {
    if (pipeCols[i + 1] !== pipeCols[i] + 1) odd.push(pipeCols[i]);
  }
  if (odd.length) fail(`管道不是 2 格宽（孤立的管道列：${odd.join(', ')}）`);
  else ok(`管道 ${pipeCols.length} 列，全部成对`);

  // -- 水管伏兵是否有管道可依附 --
  const ambushes = level.entities.filter((e) => e.type === 'pipeAmbush');
  for (const a of ambushes) {
    const hasPipe = pipes.some((t) => t.cx === a.cx && t.cy === a.cy + 1);
    if (!hasPipe) fail(`水管伏兵标记 (${a.cx},${a.cy}) 正下方不是管道`);
  }
  if (ambushes.length) ok(`水管伏兵 ${ambushes.length} 处，均依附在管道上`);

  // -- 实体清单 --
  const entCount = {};
  for (const e of level.entities) entCount[e.type] = (entCount[e.type] || 0) + 1;
  ok(`实体：${Object.entries(entCount).map(([k, v]) => `${k}×${v}`).join('　')}`);

  // -- 隐形砖块高度检查（太贴地会变成"绊脚石"，太飘会完全撞不到）--
  const invis = level.tiles.filter((t) => t.type === 'invisible');
  const groundRow = level.height - 4;
  for (const t of invis) {
    if (t.cy === groundRow - 1) warn(`隐形砖块 (${t.cx},${t.cy}) 与地表同高，会变成"隐形墙"（这是允许的设计，确认是故意的即可）`);
    if (t.cy < 3) warn(`隐形砖块 (${t.cx},${t.cy}) 位置偏高，玩家可能永远撞不到`);
  }
  if (invis.length) ok(`隐形砖块 ${invis.length} 个`);
}

// ---------------------------------------------------------------------------
console.log('\n' + '─'.repeat(52));
if (failures === 0) {
  console.log(`✅ 全部关卡校验通过${warnings ? `（${warnings} 条提醒）` : ''}`);
  process.exit(0);
} else {
  console.error(`❌ 校验失败：${failures} 个错误，${warnings} 条提醒`);
  process.exit(1);
}
