/**
 * 中英双语支持（i18n）
 * ---------------------------------------------------------------
 * 语言的决定顺序（优先级从高到低）：
 *   1. URL 参数 ?lang=en / ?lang=zh   —— 方便截图工具、分享链接强制指定
 *   2. 存档里上次手动选择的语言        —— 玩家在主菜单里切过就记住
 *   3. 浏览器 navigator.language      —— 首次进入时自动匹配
 *   4. 兜底英文
 *
 * 所有界面文案（菜单 / HUD / 提示 / 调侃 / 陷阱名 / 关卡名）都从 DICT 取，
 * 代码里不允许再出现硬编码的界面文案。t('key') 缺键时回退英文，再回退键名。
 */
import { Save } from './save.js';

export const LANGS = ['en', 'zh'];

const DICT = {
  // ===========================================================================
  // English
  // ===========================================================================
  en: {
    'game.title': "Cat's Perilous Adventure",
    'game.titleAlt': '猫咪历险记',
    'game.tagline': 'The platformer that looks perfectly harmless… probably',

    'menu.start': 'Start Adventure   (continue from Level {n})',
    'menu.levels': 'Select Level',
    'menu.help': 'How to Play',
    'menu.language': 'Language / 语言：English',
    'menu.clear': 'Erase Records',
    'menu.back': 'Back',
    'menu.confirmClear': 'Yes, erase everything',
    'menu.cancel': 'Cancel',
    'menu.locked': 'Locked',
    'menu.notCleared': 'Not cleared yet',
    'menu.best': 'Best {time}   ·   fewest deaths {n}',

    'footer.stats': 'Total deaths {n}   ·   goldfish collected {fish}',
    'footer.soundOn': 'M  Sound: On',
    'footer.soundOff': 'M  Sound: Off',
    'footer.keys': '↑↓ Select   Enter/Space Confirm   Esc Back   L Language   M Mute',

    'help.controls': 'Controls',
    'help.rules': 'Rules',
    'help.gag': 'The Gag',
    'help.move': '← / A   Move left          → / D   Move right',
    'help.jump': 'Space / ↑ / W   Jump',
    'help.jumpNote': 'Hold to jump higher, tap for a short hop',
    'help.crouch': '↓ / S   Crouch',
    'help.crouchNote': 'Only the big cat fits through low passages',
    'help.run': 'Shift   Run',
    'help.runNote': 'Jumping while running goes higher',
    'help.pause': 'P / Esc   Pause',
    'help.pauseNote': 'You can give up the level from the pause menu',
    'help.retry': 'R   Restart level instantly',
    'help.retryNote': 'Death rate is high — retrying must be instant',
    'help.ruleStomp': 'Stomp an enemy from above to squash it',
    'help.ruleSide': 'Touch it from the side or below = you get hurt',
    'help.ruleCan': 'Eat a fish can → big cat',
    'help.ruleCanNote': 'A big cat shrinks instead of dying on the first hit',
    'help.ruleStar': 'Eat a star → brief invincibility',
    'help.ruleStarNote': 'While blinking, any enemy you touch is destroyed',
    'help.ruleQuestion': 'Hit "?" blocks for items',
    'help.ruleBrick': 'The big cat can smash plain bricks',
    'help.gag1': 'The maps are full of traps disguised as safe ground.',
    'help.gag1Note': 'You will not see most of them coming. That is the design.',
    'help.gag2': 'Deaths cost nothing and retrying is instant.',
    'help.gag2Note': 'The death counter is not a punishment — it is your medal.',
    'help.back': 'Press Esc or Enter to go back',

    'hud.small': 'Small Cat',
    'hud.big': 'Big Cat',
    'hud.star': 'Star {s}s',

    'loading.title': "Cat's Perilous Adventure",
    'loading.sub': '猫咪历险记',
    'loading.progress': 'Loading… {p}%',
    'loading.tip': 'Tip: hold the jump key to jump higher; you can still jump within 0.1s of walking off a ledge.',
    'loading.error': 'Some assets failed to load — please open this page through the local server (npm run dev).',

    'toast.blacklist': '"{name}" added to your blacklist 🐱',
    'toast.fakeGoalStart': 'Level clear! ……right?',
    'toast.fakeGoalReveal': 'Nice try 🐱   The real goal is further right',
    'toast.grow': 'You grew! Now you can take one hit 🐱',
    'toast.star': 'Invincible! Anything you touch is toast ✨',
    'toast.soundOff': 'Sound off',
    'toast.soundOn': 'Sound on',

    'trap.invisible': 'Invisible Block',
    'trap.skyDropper': 'Disguised Sky Dropper',
    'trap.fakeItem': 'Fake Item, Real Trap',
    'trap.pipeAmbush': 'Pipe Ambush',
    'trap.crumble': 'Vanishing Floor',
    'trap.conveyor': 'Hidden Conveyor',
    'trap.fakeGoal': 'Fake Goal Flag',

    'complete.title': 'LEVEL CLEAR!',
    'complete.deaths': 'deaths',
    'complete.time': 'Time',
    'complete.fish': 'Goldfish',
    'complete.fishVal': '{n}',
    'complete.score': 'Score',
    'complete.bestTime': 'Best time so far',
    'complete.fewestDeaths': 'Fewest deaths so far',
    'complete.deathsN': '{n} times',
    'complete.newRecord': 'New record!',
    'complete.traps': 'Traps that got you this run:',
    'complete.hintNext': 'Enter  next level   ·   R  retry   ·   Esc  main menu',
    'complete.hintMenu': 'Enter  main menu   ·   R  retry',

    'over.title': 'Take a Breather',
    'over.summary': 'You died {n} times on this level and lasted {time}',
    'over.persist': 'Your death count is already on the honor roll — come back any time.',
    'over.hint': 'Enter  retry   ·   Esc  main menu',

    'pause.title': 'P A U S E D',
    'pause.stats': '{n} deaths this run   ·   time {time}',
    'pause.resume': 'Resume',
    'pause.restart': 'Restart Level',
    'pause.abandon': 'Give Up This Level',

    'taunt.god': 'Zero deaths?! Even the cat suspects you peeked at the script 🐱❓',
    'taunt.great': 'Only {n} deaths — the cat raises its tail in respect 🐱✨',
    'taunt.good': '{n} deaths. You are starting to see the patterns 🐾',
    'taunt.ok': '{n} deaths. The cat is starting to feel sorry for you 😿',
    'taunt.bad': '{n} deaths. The cat is close to tears 🐱💦',
    'taunt.awful': '{n} deaths. You and the floor have become very close 🐱🔥',
    'taunt.legend': '{n} deaths… this is not a clear anymore, it is performance art 🐱🏆',

    'level.1.name': 'Level 1 · Backyard Beginnings',
    'level.1.subtitle': 'The kind that looks harmless',
    'level.2.name': 'Level 2 · Rooftops & Pipes',
    'level.2.subtitle': 'This time even the floor lies',
    'level.3.name': 'Level 3 · The Sun’s Spite',
    'level.3.subtitle': 'Good luck surviving thirty seconds',

    'err.levelLoad': 'Failed to load level data {file}',
  },

  // ===========================================================================
  // 简体中文
  // ===========================================================================
  zh: {
    'game.title': '猫咪历险记',
    'game.titleAlt': "Cat's Perilous Adventure",
    'game.tagline': '看起来人畜无害的那种平台跳跃游戏',

    'menu.start': '开始冒险　（从第 {n} 关继续）',
    'menu.levels': '选择关卡',
    'menu.help': '操作说明',
    'menu.language': 'Language / 语言：中文',
    'menu.clear': '清除记录',
    'menu.back': '返回',
    'menu.confirmClear': '确认清除所有记录',
    'menu.cancel': '取消',
    'menu.locked': '未解锁',
    'menu.notCleared': '尚未通关',
    'menu.best': '最佳 {time}　·　最少死亡 {n} 次',

    'footer.stats': '累计死亡 {n} 次　·　累计收集金鱼 {fish} 条',
    'footer.soundOn': 'M  音效：开',
    'footer.soundOff': 'M  音效：关',
    'footer.keys': '↑↓ 选择　Enter/Space 确认　Esc 返回　L 语言　M 静音',

    'help.controls': '操作',
    'help.rules': '规则',
    'help.gag': '本作特色',
    'help.move': '← / A　　向左走　　　　→ / D　向右走',
    'help.jump': '空格 / ↑ / W　　跳跃',
    'help.jumpNote': '按住跳更高，短按跳更低',
    'help.crouch': '↓ / S　　蹲下',
    'help.crouchNote': '大猫可蹲行进入矮通道',
    'help.run': 'Shift　　加速奔跑',
    'help.runNote': '奔跑时起跳会更高',
    'help.pause': 'P / Esc　　暂停',
    'help.pauseNote': '暂停菜单里可以放弃本关',
    'help.retry': 'R　　立即重开本关',
    'help.retryNote': '死亡率很高，重试必须够快',
    'help.ruleStomp': '踩敌人头顶 = 消灭它',
    'help.ruleSide': '从侧面或下方碰到 = 受伤',
    'help.ruleCan': '吃鱼罐头 → 大猫',
    'help.ruleCanNote': '大猫受伤只会退化，不会死',
    'help.ruleStar': '吃无敌星 → 短暂无敌',
    'help.ruleStarNote': '闪烁期间碰到敌人即秒杀',
    'help.ruleQuestion': '顶「?」砖出道具',
    'help.ruleBrick': '大猫能顶碎普通砖块',
    'help.gag1': '地图里布满了伪装成安全区的陷阱。',
    'help.gag1Note': '第一次遇到基本躲不掉 —— 这是设计好的。',
    'help.gag2': '死一次就记一次，重试成本极低。',
    'help.gag2Note': '死亡次数不是惩罚，是你的荣誉勋章。',
    'help.back': '按 Esc 或 Enter 返回',

    'hud.small': '小猫',
    'hud.big': '大猫',
    'hud.star': '无敌 {s}s',

    'loading.title': '猫咪历险记',
    'loading.sub': "Cat's Perilous Adventure",
    'loading.progress': '正在加载… {p}%',
    'loading.tip': '提示：按住跳跃键能跳得更高；掉下平台前的 0.1 秒内仍然可以起跳。',
    'loading.error': '有资源加载失败，请确认是通过 npm run dev 启动的本地服务器访问本页。',

    'toast.blacklist': '「{name}」已加入你的黑名单 🐱',
    'toast.fakeGoalStart': '恭喜通关！……吗？',
    'toast.fakeGoalReveal': '想得美 🐱　真正的终点还在右边',
    'toast.grow': '变大了！这次能挨一下 🐱',
    'toast.star': '无敌！撞谁谁死 ✨',
    'toast.soundOff': '音效已关闭',
    'toast.soundOn': '音效已开启',

    'trap.invisible': '隐形砖块',
    'trap.skyDropper': '伪装天空掉落物',
    'trap.fakeItem': '假道具真陷阱',
    'trap.pipeAmbush': '水管弹出敌人',
    'trap.crumble': '碎裂地板陷阱',
    'trap.conveyor': '隐藏向下传送带',
    'trap.fakeGoal': '终点旗杆的“假通关”陷阱',

    'complete.title': '通 关 ！',
    'complete.deaths': '次死亡',
    'complete.time': '用时',
    'complete.fish': '收集金鱼',
    'complete.fishVal': '{n} 条',
    'complete.score': '得分',
    'complete.bestTime': '历史最佳用时',
    'complete.fewestDeaths': '历史最少死亡',
    'complete.deathsN': '{n} 次',
    'complete.newRecord': '新纪录！',
    'complete.traps': '这一关坑过你的机关：',
    'complete.hintNext': 'Enter 进入下一关　·　R 重玩本关　·　Esc 回主菜单',
    'complete.hintMenu': 'Enter 回主菜单　·　R 重玩本关',

    'over.title': '先歇会儿',
    'over.summary': '你在这一关死了 {n} 次，坚持了 {time}',
    'over.persist': '死亡次数已经记进荣誉榜了，随时可以回来继续。',
    'over.hint': 'Enter 重新挑战　·　Esc 回主菜单',

    'pause.title': '暂 停',
    'pause.stats': '本关已死亡 {n} 次　·　用时 {time}',
    'pause.resume': '继续游戏',
    'pause.restart': '重开本关',
    'pause.abandon': '放弃本关',

    'taunt.god': '零死亡通关？！猫都怀疑你是不是提前看过剧本 🐱❓',
    'taunt.great': '只死了 {n} 次，猫对你竖起了尾巴 🐱✨',
    'taunt.good': '死亡 {n} 次，勉强算是摸清了套路 🐾',
    'taunt.ok': '死亡 {n} 次，猫已经开始同情你了 😿',
    'taunt.bad': '死亡 {n} 次，猫都要哭了 🐱💦',
    'taunt.awful': '死亡 {n} 次，你和地板的关系非常亲密 🐱🔥',
    'taunt.legend': '死亡 {n} 次……这已经不是通关，这是行为艺术 🐱🏆',

    'level.1.name': '第一关 · 后院初探',
    'level.1.subtitle': '看起来人畜无害的那种',
    'level.2.name': '第二关 · 屋顶与水管',
    'level.2.subtitle': '这次连地板都不能信了',
    'level.3.name': '第三关 · 太阳的恶意',
    'level.3.subtitle': '祝你活过三十秒',

    'err.levelLoad': '关卡数据 {file} 加载失败',
  },
};

let current = 'en';

/** 按「URL 参数 → 存档 → 浏览器语言」的顺序决定初始语言（main.js 里调用一次） */
export function initLang() {
  let lang = null;
  try {
    lang = new URLSearchParams(window.location.search).get('lang');
  } catch { /* 非浏览器环境 */ }
  if (!lang || !LANGS.includes(lang)) lang = Save.getLang();
  if (!lang || !LANGS.includes(lang)) {
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
    lang = nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  current = LANGS.includes(lang) ? lang : 'en';
  return current;
}

export function getLang() {
  return current;
}

/** 切换语言并写入存档（界面重建由调用方负责） */
export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  Save.setLang(lang);
}

export function toggleLang() {
  setLang(current === 'en' ? 'zh' : 'en');
  return current;
}

/**
 * 取文案。params 用于占位符替换：t('menu.start', { n: 2 })。
 * 当前语言缺键时回退英文，再缺则直接返回键名（方便在界面上发现漏翻）。
 */
export function t(key, params) {
  let s = DICT[current][key] ?? DICT.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
