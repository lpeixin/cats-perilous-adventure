/**
 * 《猫咪历险记》Cat's Perilous Adventure
 * 游戏入口 —— Phaser 配置 + 场景注册
 */
import { GAME_WIDTH, GAME_HEIGHT, PIXEL_ART, PHYS, COLORS } from './utils/constants.js';
import { initLang } from './utils/i18n.js';

import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MenuScene from './scenes/MenuScene.js';
import LevelScene from './scenes/LevelScene.js';
import LevelCompleteScene from './scenes/LevelCompleteScene.js';
import PauseScene from './scenes/PauseScene.js';
import GameOverScene from './scenes/GameOverScene.js';

// 决定界面语言（URL ?lang= → 存档 → 浏览器语言），必须在任何场景启动前完成
initLang();

// ============================================================================
// 高清 Retina 渲染增强（WebGL 2× 物理帧缓冲 + 3× 超采样矢量字体）
// 保持逻辑坐标 960×540 完全不变，物理画布升级为 1920×1080，彻底消除像素颗粒感与锯齿
// ============================================================================
const HD_SCALE = 2;
const TEXT_HD_RES = 3;

if (Phaser?.GameObjects?.GameObjectFactory?.prototype?.text) {
  const origAddText = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    const hdStyle = style && typeof style === 'object'
      ? { resolution: TEXT_HD_RES, ...style }
      : { resolution: TEXT_HD_RES };
    return origAddText.call(this, x, y, text, hdStyle);
  };
}

if (Phaser?.Renderer?.WebGL?.WebGLRenderer?.prototype) {
  const proto = Phaser.Renderer.WebGL.WebGLRenderer.prototype;
  const origResize = proto.resize;
  proto.resize = function (width, height) {
    const gl = this.gl;
    if (gl && !gl.__hdPatched) {
      gl.__hdPatched = true;
      const self = this;
      const origViewport = gl.viewport.bind(gl);
      const origScissor = gl.scissor.bind(gl);
      gl.viewport = function (x, y, w, h) {
        if (!self.currentFramebuffer) {
          return origViewport(x * HD_SCALE, y * HD_SCALE, w * HD_SCALE, h * HD_SCALE);
        }
        return origViewport(x, y, w, h);
      };
      gl.scissor = function (x, y, w, h) {
        if (!self.currentFramebuffer) {
          return origScissor(x * HD_SCALE, y * HD_SCALE, w * HD_SCALE, h * HD_SCALE);
        }
        return origScissor(x, y, w, h);
      };
      try {
        Object.defineProperty(gl, 'drawingBufferWidth', {
          configurable: true,
          get: () => self.width || GAME_WIDTH,
        });
        Object.defineProperty(gl, 'drawingBufferHeight', {
          configurable: true,
          get: () => self.height || GAME_HEIGHT,
        });
      } catch (_) {}
    }
    if (this.canvas) {
      const targetW = Math.round((width || GAME_WIDTH) * HD_SCALE);
      const targetH = Math.round((height || GAME_HEIGHT) * HD_SCALE);
      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
    }
    const res = origResize.call(this, width, height);
    this.drawingBufferHeight = height;
    return res;
  };
}

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
    // 画布尺寸取整到整数像素，避免 FIT 缩放时出现半像素模糊
    autoRound: true,
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
