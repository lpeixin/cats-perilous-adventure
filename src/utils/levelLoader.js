/**
 * 关卡解析器（纯数据层，不依赖 Phaser，可在 Node 里单独跑测试）
 * ---------------------------------------------------------------
 * 关卡以「ASCII 字符画」的形式写在 src/levels/*.json 的 rows 数组里。
 * 这样做的好处是：关卡在源码里就是一张**能直接看懂的地图**，
 * 想加一个陷阱就在对应位置敲一个字符，不需要任何编辑器。
 *
 * 每个字符的含义见 src/utils/constants.js 的 LEGEND。
 */
import { LEGEND, SOLID_CHARS, ENTITY_CHARS, DEADLY_CHARS } from './constants.js';

const at = (rows, x, y) => {
  if (y < 0 || y >= rows.length) return ' ';
  const row = rows[y];
  if (x < 0 || x >= row.length) return ' ';
  return row[x];
};

/**
 * @param {object} raw 关卡 JSON
 * @returns {{width:number,height:number,rows:string[],spawn:{x,y},
 *            tiles:Array,entities:Array,deadly:Array}}
 */
export function parseLevel(raw) {
  // 1) 补齐所有行的宽度，避免手写地图时因尾部空格丢失而错位
  const width = Math.max(...raw.rows.map((r) => r.length));
  const rows = raw.rows.map((r) => r.padEnd(width, ' '));
  const height = rows.length;

  const tiles = [];
  const entities = [];
  const deadly = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (ch === ' ' || !LEGEND[ch]) continue;
      const type = LEGEND[ch];

      if (ENTITY_CHARS.includes(ch)) {
        entities.push({ cx: x, cy: y, type });
        continue;
      }
      if (DEADLY_CHARS.includes(ch)) {
        deadly.push({ cx: x, cy: y, type, texture: type === 'spike' ? 'spike' : 'lava' });
        continue;
      }
      if (!SOLID_CHARS.includes(ch)) continue;

      tiles.push(resolveTile(rows, x, y, ch, type));
    }
  }

  const spawn = raw.spawn
    ? { x: raw.spawn.x, y: raw.spawn.y }
    : { x: 2, y: Math.max(0, height - 3) };

  // 3) 用 blocks 覆盖指定问号砖里装的东西。
  //    ASCII 里只能写 '?'，但"这一格出鱼罐头、那一格出无敌星"需要额外信息，
  //    所以关卡 JSON 里可以用 { "cx,cy": "can" } 这样的映射来指定。
  if (raw.blocks) {
    for (const [key, item] of Object.entries(raw.blocks)) {
      const [cx, cy] = key.split(',').map(Number);
      const tile = tiles.find((t) => t.cx === cx && t.cy === cy
        && (t.type === 'question' || t.type === 'fakeQuestion'));
      if (tile) tile.item = item;
      else console.warn(`[levelLoader] blocks 里指定的 (${cx},${cy}) 不是问号砖，已忽略`);
    }
  }

  return { width, height, rows, spawn, tiles, entities, deadly, meta: raw };
}

function resolveTile(rows, x, y, ch, type) {
  const base = { cx: x, cy: y, ch, type, texture: null, solid: true };

  switch (type) {
    case 'ground': {
      // 上方没有地面 → 这是"地表"，画草地；否则是地下泥土
      const above = at(rows, x, y - 1);
      const isSurface = above !== '#' && above !== '%';
      base.texture = isSurface ? 'ground_top' : 'ground_fill';
      base.isSurface = isSurface;
      break;
    }
    case 'dirt':
      base.texture = 'ground_fill';
      break;
    case 'stone':
      base.texture = 'stone';
      break;
    case 'brick':
      base.texture = 'brick';
      base.breakable = true;   // 大猫可以从下方顶碎
      break;
    case 'pipe': {
      const isTop = at(rows, x, y - 1) !== 'P';
      const isLeft = at(rows, x - 1, y) !== 'P';
      base.texture = isTop ? (isLeft ? 'pipe_tl' : 'pipe_tr')
                           : (isLeft ? 'pipe_bl' : 'pipe_br');
      base.isPipeTop = isTop;
      break;
    }
    case 'question':
      base.texture = 'question';
      base.hit = false;
      base.item = 'goldfish';  // 默认给金鱼，可在关卡里用 items 覆盖
      break;
    case 'fakeQuestion':
      base.texture = 'question';
      base.hit = false;
      base.item = 'trapMushroom';
      break;
    case 'invisible':
      base.texture = 'invisible';
      base.hidden = true;
      base.revealed = false;
      break;
    case 'crumble': {
      // 摆在平地上（上方是空气）的碎裂地板伪装成**草地**，和真地面像素级一致；
      // 摆在平台上的则用石块外观。这是"地板消失陷阱"能骗到人的前提。
      const above = at(rows, x, y - 1);
      const onSurface = above !== '#' && above !== '%' && above !== '*'
                        && above !== 'S' && above !== 'B' && above !== '>';
      base.texture = onSurface ? 'crumble_ground' : 'crumble';
      base.crumble = true;
      break;
    }
    case 'conveyor':
      // 外观和石块完全一致 —— 这正是"视觉误导的高台"的关键
      base.texture = 'stone';
      base.conveyor = true;
      break;
    default:
      base.texture = 'stone';
  }
  return base;
}

/** 统计用：这一关一共埋了哪些类型的陷阱 */
export function summarizeLevel(level) {
  const counts = {};
  for (const t of level.tiles) {
    if (t.type === 'invisible') counts['隐形砖块'] = (counts['隐形砖块'] || 0) + 1;
    if (t.type === 'fakeQuestion') counts['假道具砖块'] = (counts['假道具砖块'] || 0) + 1;
    if (t.crumble) counts['碎裂地板'] = (counts['碎裂地板'] || 0) + 1;
    if (t.conveyor) counts['隐藏向下传送带'] = (counts['隐藏向下传送带'] || 0) + 1;
  }
  for (const e of level.entities) {
    if (e.type === 'evilCloud') counts['伪装云掉落'] = (counts['伪装云掉落'] || 0) + 1;
    if (e.type === 'evilSun') counts['伪装太阳砸落'] = (counts['伪装太阳砸落'] || 0) + 1;
    if (e.type === 'goalFake') counts['假通关旗杆'] = (counts['假通关旗杆'] || 0) + 1;
  }
  return counts;
}
