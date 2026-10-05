/**
 * 《猫咪历险记》全局常量
 * ---------------------------------------------------------------
 * 这里是整个项目唯一的"魔法数字"来源：分辨率、物理手感参数、
 * 陷阱参数、瓦片图例、UI 调色板都集中在此处，方便统一调参。
 */

// ---------------------------------------------------------------------------
// 显示 / 缩放
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const TILE = 48;

/**
 * 是否启用像素完美模式。
 *
 * 需求文档建议 pixelArt: true，但那套设置是为 16×16 马赛克素材准备的。
 * 本项目采用的是「高分辨率扁平卡通」路线：素材以 4 倍超采样绘制后
 * LANCZOS 降采样，边缘本身就是平滑的。此时如果开启 pixelArt，
 * Phaser 会改用 NEAREST 采样，反而会让放大后的边缘出现锯齿。
 * 因此这里默认关闭；若你把素材换成真正的低分辨率像素图，
 * 把 PIXEL_ART 改成 true 即可恢复"像素完美"。
 */
export const PIXEL_ART = false;

// ---------------------------------------------------------------------------
// 物理手感（"跟手不别扭"的关键参数，全部可调）
// ---------------------------------------------------------------------------
export const PHYS = {
  GRAVITY: 1500,          // 重力加速度 px/s²
  MAX_FALL: 950,          // 最大下落速度（防穿模）

  WALK_SPEED: 200,        // 普通行走最大水平速度
  RUN_SPEED: 310,         // 按住 Shift 的奔跑速度
  GROUND_ACCEL: 2200,     // 地面加速度
  AIR_ACCEL: 1400,        // 空中加速度（略低，保留一点惯性）
  GROUND_DRAG: 2400,      // 地面松手减速
  AIR_DRAG: 420,          // 空中松手减速

  JUMP_VELOCITY: -585,    // 起跳初速度
  JUMP_CUT: -190,         // 松开跳跃键后剩余的最大上升速度 → 实现可变跳跃高度
  JUMP_BOOST: -660,       // 全力起跳（大猫或奔跑时略高）

  COYOTE_MS: 100,         // 土狼时间：离开平台后仍可起跳的宽限
  JUMP_BUFFER_MS: 120,    // 跳跃缓冲：落地前按下的跳跃会被记住

  STOMP_BOUNCE: -430,     // 踩敌人后的弹跳
  STOMP_BOUNCE_HELD: -540,// 踩敌人时按住跳跃键的更高弹跳

  DEATH_POP: -520,        // 死亡时向上弹起的速度
};

// ---------------------------------------------------------------------------
// 主角
// ---------------------------------------------------------------------------
export const CAT = {
  SMALL_W: 26,
  SMALL_H: 32,
  BIG_W: 30,
  BIG_H: 50,
  CROUCH_H: 22,
  HURT_INVULN_MS: 1800,   // 受伤后的无敌闪烁时长
  STAR_MS: 9000,          // 无敌星持续时间
};

// ---------------------------------------------------------------------------
// 动画帧索引（对应 assets/sprites/cat_*.png 的 6×2 网格）
// ---------------------------------------------------------------------------
export const CAT_FRAMES = {
  IDLE: [0, 1],
  WALK: [2, 3, 4, 5],
  JUMP: [6],
  FALL: [7],
  CROUCH: [8],
  HURT: [9],
  SLIDE: [10],
  LAND: [11],
};

// ---------------------------------------------------------------------------
// 陷阱参数
// ---------------------------------------------------------------------------
export const TRAP = {
  CRUMBLE_DELAY_MS: 300,     // 碎裂地板：踩上后多久消失
  CRUMBLE_SHAKE_MS: 260,     // 抖动预警时长
  SKY_TRIGGER_PAD: 90,       // 天空掉落物：进入触发范围的水平余量
  SKY_TRIGGER_PAD_Y: 40,     // 垂直余量
  SKY_FALL_ACCEL: 1700,      // 掉落加速度
  PIPE_AMBUSH_RANGE: 210,    // 水管伏兵弹出距离
  PIPE_AMBUSH_VY: -780,      // 弹出初速度
  FAKE_ITEM_RANGE: 300,      // 假道具怪扑咬触发距离
  MUSH_CHARGE_SPEED: 300,    // 蘑菇陷阱怪冲锋速度
  CONVEYOR_DELAY_MS: 340,    // 隐藏传送带开始下沉前的迟疑
  CONVEYOR_DISTANCE: 5,      // 悄悄下沉的格数
  CONVEYOR_MS: 1100,         // 下沉耗时
  FAKE_GOAL_FAKE_MS: 900,    // "假通关"演出：先假装过关多久
};

// ---------------------------------------------------------------------------
// 关卡字符图例（src/levels/*.json 的 rows 里每个字符的含义）
// ---------------------------------------------------------------------------
export const LEGEND = {
  // —— 地形 ——
  '#': 'ground',        // 草地 + 泥土（顶行自动画草）
  '%': 'dirt',          // 纯泥土（地下层）
  'S': 'stone',         // 石块，不可破坏
  'B': 'brick',         // 砖块，大猫可顶碎
  'P': 'pipe',          // 管道（同一列连续时自动拼管口/管身）
  '?': 'question',      // 真·问号砖，顶出道具
  '!': 'fakeQuestion',  // 假·问号砖，顶出蘑菇陷阱怪
  'H': 'invisible',     // 隐形砖块（实心、不可见）
  '*': 'crumble',       // 碎裂地板
  '>': 'conveyor',      // 隐藏向下传送带（外观 = 石块）
  // —— 危险 ——
  '^': 'spike',         // 尖刺
  '~': 'lava',          // 岩浆
  // —— 实体（解析后从瓦片网格中移除）——
  'c': 'goldfish',      // 金鱼收集品
  's': 'star',          // 无敌星
  'm': 'can',           // 鱼罐头（变大猫）
  '1': 'yarn',          // 毛线球怪
  '2': 'crow',          // 乌鸦
  '3': 'fish',          // 跳跳鱼
  '4': 'mushroom',      // 蘑菇陷阱怪（直接放置）
  'A': 'pipeAmbush',    // 水管伏兵触发点（放在管道正上方那一格）
  'v': 'evilCloud',     // 伪装云（天空掉落陷阱）
  'o': 'evilSun',       // 伪装太阳（天空掉落陷阱）
  '.': 'softCloud',     // 纯装饰云
  'F': 'goalFake',      // 假通关旗杆
  'f': 'goalReal',      // 真·终点旗杆
};

/** 会变成静态实心碰撞体的地形字符 */
export const SOLID_CHARS = '#%SBP?H!>*';

/** 会从瓦片网格中抽出来、变成独立实体的字符 */
export const ENTITY_CHARS = 'csm1234Avo.Ff';

/** 即死地形 */
export const DEADLY_CHARS = '^~';

// ---------------------------------------------------------------------------
// UI 调色板（与 tools/gen_assets.py 中的 PALETTE 保持一致）
// ---------------------------------------------------------------------------
export const COLORS = {
  ink: 0x3e2e32,
  inkSoft: 0x5c464a,
  paper: 0xfffdfa,
  paperDim: 0xf1e9e0,
  line: 0xe2d6c8,
  cat: 0xf7aa56,
  catDeep: 0xd88034,
  cream: 0xfff0da,
  grass: 0x68bc6a,
  brick: 0xd07a5c,
  stone: 0xaab2c0,
  gold: 0xffc842,
  goldDeep: 0xde9a22,
  danger: 0xe25858,
  dangerDeep: 0xb63c3c,
  accent: 0x6cbcf0,
  accentDeep: 0x3d8fc9,
  shadow: 0x2b2024,
  white: 0xffffff,
};

// ---------------------------------------------------------------------------
// 存档
// ---------------------------------------------------------------------------
export const SAVE_KEY = 'catmario.save.v1';

// ---------------------------------------------------------------------------
// 关卡列表
// name/subtitle 存的是 i18n 键（见 src/utils/i18n.js 的 level.* 条目），
// 显示时用 t() 翻译 —— 这样关卡名可以跟着界面语言切换。
// ---------------------------------------------------------------------------
export const LEVELS = [
  {
    id: 1,
    key: 'level1',
    file: 'src/levels/level1.json',
    nameKey: 'level.1.name',
    subtitleKey: 'level.1.subtitle',
  },
  {
    id: 2,
    key: 'level2',
    file: 'src/levels/level2.json',
    nameKey: 'level.2.name',
    subtitleKey: 'level.2.subtitle',
  },
  {
    id: 3,
    key: 'level3',
    file: 'src/levels/level3.json',
    nameKey: 'level.3.name',
    subtitleKey: 'level.3.subtitle',
  },
];
