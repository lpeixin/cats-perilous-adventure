/**
 * 《猫咪历险记》Cat's Perilous Adventure
 * 游戏入口 —— Phaser 配置 + 场景注册
 */
import { GAME_WIDTH, GAME_HEIGHT, PIXEL_ART, PHYS, COLORS } from './utils/constants.js';

import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MenuScene from './scenes/MenuScene.js';
import LevelScene from './scenes/LevelScene.js';
import LevelCompleteScene from './scenes/LevelCompleteScene.js';
import PauseScene from './scenes/PauseScene.js';
import GameOverScene from './scenes/GameOverScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#6cbcf0',

  // 自适应窗口：保持设计分辨率比例，letterbox 留黑边
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },

  // 本项目用的是"高分辨率扁平卡通"素材（4× 超采样后降采样），
  // 因此关闭 pixelArt、开启平滑采样，边缘才干净（详见 constants.js 的说明）
  pixelArt: PIXEL_ART,
  antialias: !PIXEL_ART,
  roundPixels: false,

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: PHYS.GRAVITY },
      debug: false,
      // 固定时间步长，保证不同帧率下手感一致
      fixedStep: true,
      fps: 60,
    },
  },

  render: {
    powerPreference: 'high-performance',
  },

  // 暂停时不要自动静音（暂停菜单里还要放音效）
  disableContextMenu: true,

  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    LevelScene,
    LevelCompleteScene,
    PauseScene,
    GameOverScene,
  ],
};

const game = new Phaser.Game(config);

// 调试用：把 game 挂到 window 上，方便在控制台里检查状态
window.__CAT_MARIO__ = game;

export default game;
