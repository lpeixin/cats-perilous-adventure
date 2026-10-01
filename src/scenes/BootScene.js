/**
 * BootScene —— 启动场景
 * ---------------------------------------------------------------
 * 只做三件事：读存档里的静音偏好、锁定缩放模式、把键盘事件挂上，
 * 然后立刻交给 PreloadScene 去加载资源。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants.js';
import { Save } from '../utils/save.js';
import { audio } from '../utils/audio.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // 全局：鼠标指针 / 触摸都不需要，纯键盘游戏
    this.input.mouse?.disableContextMenu();

    // 恢复静音偏好
    const muted = Save.isMuted();
    audio.setMuted(muted);

    // 任何一次按键都用来解锁 WebAudio（浏览器自动播放策略）
    this.input.keyboard.once('keydown', () => audio.unlock());
    this.input.once('pointerdown', () => audio.unlock());

    this.cameras.main.setBackgroundColor(COLORS.paper);
    this.scene.start('Preload');
  }
}
