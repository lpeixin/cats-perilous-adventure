/**
 * 存档（localStorage）
 * ---------------------------------------------------------------
 * 只存"荣誉数据"：每关的最佳用时、最少死亡次数、历史累计死亡次数、
 * 是否通关。核心原则是——**死亡次数越多越值得炫耀**，所以死亡数
 * 是正向指标，不是惩罚。
 */
import { SAVE_KEY } from './constants.js';

const DEFAULT = {
  levels: {},        // { [levelId]: { bestTimeMs, fewestDeaths, totalDeaths, clears, bestFish } }
  totalDeaths: 0,
  totalFish: 0,
  unlocked: 1,       // 已解锁的最大关卡 id
  muted: false,
};

function read() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT), ...parsed, levels: parsed.levels || {} };
  } catch (e) {
    console.warn('[save] 读取存档失败，使用默认值', e);
    return structuredClone(DEFAULT);
  }
}

function write(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[save] 写入存档失败', e);
  }
}

export const Save = {
  all: read,

  level(id) {
    return read().levels[id] || null;
  },

  /** 记录一次通关，返回 { isBestTime, isFewestDeaths, record } */
  recordClear(id, { timeMs, deaths, fish }) {
    const data = read();
    const prev = data.levels[id] || {
      bestTimeMs: null, fewestDeaths: null, totalDeaths: 0, clears: 0, bestFish: 0,
    };
    const isBestTime = prev.bestTimeMs === null || timeMs < prev.bestTimeMs;
    const isFewestDeaths = prev.fewestDeaths === null || deaths < prev.fewestDeaths;

    const record = {
      bestTimeMs: isBestTime ? timeMs : prev.bestTimeMs,
      fewestDeaths: isFewestDeaths ? deaths : prev.fewestDeaths,
      totalDeaths: prev.totalDeaths + deaths,
      clears: prev.clears + 1,
      bestFish: Math.max(prev.bestFish || 0, fish),
    };
    data.levels[id] = record;
    data.totalDeaths += deaths;
    data.totalFish += fish;
    data.unlocked = Math.max(data.unlocked || 1, Math.min(3, id + 1));
    write(data);
    return { isBestTime, isFewestDeaths, record };
  },

  /** 一次都没通关就死掉时，也要把死亡数计入"荣誉榜" */
  addDeaths(id, n) {
    const data = read();
    const prev = data.levels[id] || {
      bestTimeMs: null, fewestDeaths: null, totalDeaths: 0, clears: 0, bestFish: 0,
    };
    prev.totalDeaths += n;
    data.levels[id] = prev;
    data.totalDeaths += n;
    write(data);
  },

  setMuted(m) {
    const data = read();
    data.muted = m;
    write(data);
  },

  isMuted() {
    return read().muted;
  },

  reset() {
    write(structuredClone(DEFAULT));
  },
};

/** 毫秒 → "1:23.45" */
export function formatTime(ms) {
  if (ms === null || ms === undefined) return '--:--';
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * 根据死亡次数生成调侃文案。
 * 这是这类游戏的"荣誉勋章"，死得越多评价越浮夸。
 */
export function deathTaunt(deaths) {
  if (deaths === 0) return { text: '零死亡通关？！猫都怀疑你是不是提前看过剧本 🐱❓', tier: 'god' };
  if (deaths <= 3) return { text: `只死了 ${deaths} 次，猫对你竖起了尾巴 🐱✨`, tier: 'great' };
  if (deaths <= 9) return { text: `死亡 ${deaths} 次，勉强算是摸清了套路 🐾`, tier: 'good' };
  if (deaths <= 19) return { text: `死亡 ${deaths} 次，猫已经开始同情你了 😿`, tier: 'ok' };
  if (deaths <= 39) return { text: `死亡 ${deaths} 次，猫都要哭了 🐱💦`, tier: 'bad' };
  if (deaths <= 79) return { text: `死亡 ${deaths} 次，你和地板的关系非常亲密 🐱🔥`, tier: 'awful' };
  return { text: `死亡 ${deaths} 次……这已经不是通关，这是行为艺术 🐱🏆`, tier: 'legend' };
}
