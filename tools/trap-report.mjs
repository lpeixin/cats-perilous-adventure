#!/usr/bin/env node
/**
 * 关卡陷阱清单生成器
 * ---------------------------------------------------------------
 * 直接从 src/levels/*.json 里把"埋了什么坑、埋在哪一格"全部读出来，
 * 生成 Markdown 片段，供 docs/关卡陷阱设计说明.md 引用。
 *
 * 之所以复用 src/utils/levelLoader.js，是为了保证：
 *   文档里写的坐标 = 游戏里真正解析出来的坐标，永远不会两边对不上。
 *
 * 用法：
 *   node tools/trap-report.mjs                              输出到 stdout
 *   node tools/trap-report.mjs --out docs/_trap-inventory.md 写到独立文件
 *   node tools/trap-report.mjs --inject docs/关卡陷阱设计说明.md
 *       把生成的内容**原地替换**进文档的两个标记之间（推荐，文档永远和关卡同步）：
 *         <!-- BEGIN:INVENTORY -->  …… <!-- END:INVENTORY -->
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLevel, summarizeLevel } from '../src/utils/levelLoader.js';
import { TILE } from '../src/utils/constants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const BEGIN = '<!-- BEGIN:INVENTORY';
const END = '<!-- END:INVENTORY -->';

const TRAP_TILE = {
  invisible: '隐形砖块',
  fakeQuestion: '假道具真陷阱（问号砖）',
};
const TRAP_ENTITY = {
  evilCloud: '伪装云掉落',
  evilSun: '伪装太阳砸落',
  goalFake: '假通关旗杆',
};
const ENTITY_LABEL = {
  yarn: '毛线球怪',
  crow: '乌鸦',
  fish: '跳跳鱼',
  mushroom: '蘑菇陷阱怪',
  goldfish: '金鱼（收集品）',
  star: '无敌星',
  can: '鱼罐头',
  yarnItem: '毛线球',
  pipeAmbush: '水管伏兵',
  goalFake: '假通关旗杆',
  goalReal: '真终点旗杆',
  evilCloud: '伪装云',
  evilSun: '伪装太阳',
  softCloud: '无害云（干扰项）',
};
const ITEM_LABEL = { goldfish: '金鱼', star: '无敌星', can: '鱼罐头' };

/** 找出所有"坑"：地面行里连续的空洞；并标出哪些坑上面架了"伪装桥" */
function findPits(level) {
  const groundRow = level.height - 4;
  const row = level.rows[groundRow] || '';
  const pits = [];
  let start = -1;
  for (let x = 0; x <= row.length; x++) {
    const isHole = x < row.length && row[x] === ' ';
    if (isHole && start < 0) start = x;
    if (!isHole && start >= 0) {
      pits.push([start, x - 1]);
      start = -1;
    }
  }
  // 坑上方如果有 crumble / conveyor 瓦片，说明这个坑被"伪装成地面的陷阱"盖住了
  const bridged = level.tiles.filter((t) => t.crumble || t.conveyor);
  return pits.map(([a, b]) => {
    const cover = bridged.filter((t) => t.cx >= a && t.cx <= b);
    const kinds = new Set(cover.map((t) => (t.crumble ? '碎裂地板' : '传送带')));
    return { a, b, cover: cover.length, kinds: [...kinds] };
  });
}

function report(level, id) {
  const out = [];
  const pits = findPits(level);

  out.push(`### ${level.meta.name}`);
  out.push('');
  out.push(`> ${level.meta.subtitle}`);
  out.push('');
  out.push(`- 地图尺寸：**${level.width} × ${level.height} 格**（${level.width * TILE} × ${level.height * TILE} px，约 ${(level.width / 20).toFixed(1)} 个屏幕宽）`);
  out.push(`- 实心瓦片：${level.tiles.length} 块　实体：${level.entities.length} 个　即死地形：${level.deadly.length} 处`);
  out.push(`- 坑：${pits.length
    ? pits.map((p) => `第 ${p.a}–${p.b} 格${p.cover ? `（上面盖着 ${p.cover} 块${p.kinds.join('+')}，**看起来是平地**）` : ''}`).join('；')
    : '无'}`);
  out.push('');

  const counts = summarizeLevel(level);
  out.push(`**陷阱种类统计（${Object.keys(counts).length} 种）**`);
  out.push('');
  for (const [k, v] of Object.entries(counts)) out.push(`- ${k} × ${v}`);
  out.push('');

  // —— 逐条列出每一个陷阱的坐标（连续同排的瓦片折叠成区间，免得文档太长）——
  const rows = [];
  const push = (kind, cell, note) => rows.push(`| ${kind} | ${cell} | ${note} |`);

  /** 把同一行里连续的 cx 折叠成 "57–61" 这样的区间 */
  const runs = (items) => {
    const sorted = [...items].sort((p, q) => p.cy - q.cy || p.cx - q.cx);
    const out = [];
    for (const it of sorted) {
      const last = out[out.length - 1];
      if (last && last.cy === it.cy && it.cx === last.b + 1) { last.b = it.cx; last.n++; }
      else out.push({ cy: it.cy, a: it.cx, b: it.cx, n: 1, it });
    }
    return out;
  };
  const cellText = (r) => (r.n === 1
    ? `(${r.a}, ${r.cy})`
    : `第 ${r.cy} 行 ${r.a}–${r.b} 格（${r.n} 块）`);

  // 瓦片型陷阱：按类型分组后折叠
  const byKind = {};
  for (const t of level.tiles) {
    let kind = null, note = null;
    if (TRAP_TILE[t.type]) { kind = TRAP_TILE[t.type]; note = t.hidden ? '完全透明，撞上去才现形' : '顶出来是会扑咬的蘑菇怪'; }
    else if (t.crumble) { kind = '地板消失陷阱'; note = `外观 ${t.texture === 'crumble_ground' ? '**和真草地像素级一致**' : '石块'}，踩上 0.3 秒后塌`; }
    else if (t.conveyor) { kind = '隐藏向下传送带'; note = '外观 = 石块，站上去 0.34 秒后悄悄下沉 5 格'; }
    else if (t.type === 'question' && t.item && t.item !== 'goldfish') { kind = `真道具砖（${ITEM_LABEL[t.item] || t.item}）`; note = '正规奖励，用来建立"问号砖=好事"的错觉'; }
    if (!kind) continue;
    (byKind[kind] ||= { note, items: [] }).items.push(t);
  }
  for (const [kind, { note, items }] of Object.entries(byKind)) {
    const list = runs(items).map(cellText).join('；');
    push(kind, list, note);
  }

  // 实体型陷阱
  const entKind = {};
  for (const e of level.entities) {
    let kind = null, note = null;
    if (TRAP_ENTITY[e.type]) { kind = TRAP_ENTITY[e.type]; note = e.type === 'goalFake' ? '碰到先假装过关，再抽掉地板' : '平时飘在天上装装饰，靠得够近才砸下来'; }
    else if (e.type === 'pipeAmbush') { kind = '水管伏兵'; note = '猫进入 210px 范围，毛线球立刻从管口弹出'; }
    if (!kind) continue;
    (entKind[kind] ||= { note, items: [] }).items.push(e);
  }
  for (const [kind, { note, items }] of Object.entries(entKind)) {
    const list = items.map((e) => `(${e.cx}, ${e.cy})`).join('；');
    push(kind, list, note);
  }

  if (rows.length) {
    out.push('| 陷阱 | 位置（格） | 说明 |');
    out.push('| --- | --- | --- |');
    out.push(...rows);
    out.push('');
  }

  // —— 其它实体（敌人 / 收集品）——
  const others = level.entities.filter((e) => !TRAP_ENTITY[e.type] && e.type !== 'pipeAmbush');
  if (others.length) {
    const byType = {};
    for (const e of others) (byType[e.type] ||= []).push(`${e.cx}`);
    out.push('**敌人与收集品分布（格号）**');
    out.push('');
    for (const [type, xs] of Object.entries(byType)) {
      out.push(`- ${ENTITY_LABEL[type] || type} × ${xs.length}：${xs.join(', ')}`);
    }
    out.push('');
  }

  return out.join('\n');
}

function main() {
  const outIdx = process.argv.indexOf('--out');
  const injIdx = process.argv.indexOf('--inject');
  const chunks = [];
  for (const id of [1, 2, 3]) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, `src/levels/level${id}.json`), 'utf8'));
    chunks.push(report(parseLevel(raw), id));
  }
  const text = chunks.join('\n---\n\n');

  if (injIdx >= 0) {
    const target = path.resolve(ROOT, process.argv[injIdx + 1]);
    const doc = fs.readFileSync(target, 'utf8');
    const b = doc.indexOf(BEGIN);
    const e = doc.indexOf(END);
    if (b < 0 || e < 0) {
      console.error(`❌ ${path.relative(ROOT, target)} 里找不到 ${BEGIN} / ${END} 标记`);
      process.exit(1);
    }
    const head = doc.slice(0, doc.indexOf('\n', b) + 1);
    const next = head + text + '\n' + doc.slice(e);
    fs.writeFileSync(target, next);
    console.log('已把最新的陷阱清单注入 ' + path.relative(ROOT, target));
  } else if (outIdx >= 0) {
    const target = path.resolve(ROOT, process.argv[outIdx + 1]);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text + '\n');
    console.log('已写入 ' + path.relative(ROOT, target));
  } else {
    console.log(text);
  }
}

main();
