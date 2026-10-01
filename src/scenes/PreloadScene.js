/**
 * PreloadScene —— 资源加载
 * ---------------------------------------------------------------
 * 所有资源都来自**本地 assets/ 目录**（Phaser 本体也已复制到 vendor/），
 * 因此加载完成之后整个游戏可以完全离线运行，不请求任何外部域名。
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, LEVELS, TILE } from '../utils/constants.js';
import { registerAnimations } from '../utils/animations.js';

/** 需要按精灵表切分的图（key, 路径, 单帧宽, 单帧高） */
const SHEETS = [
  ['cat_small', 'assets/sprites/cat_small.png', 64, 64],
  ['cat_big', 'assets/sprites/cat_big.png', 64, 64],
  ['enemy_yarn', 'assets/sprites/enemy_yarn.png', 48, 48],
  ['enemy_crow', 'assets/sprites/enemy_crow.png', 48, 48],
  ['enemy_fish', 'assets/sprites/enemy_fish.png', 48, 48],
  ['enemy_mushroom', 'assets/sprites/enemy_mushroom.png', 48, 48],
  ['item_goldfish', 'assets/sprites/item_goldfish.png', 32, 32],
  ['item_star', 'assets/sprites/item_star.png', 32, 32],
  ['item_can', 'assets/sprites/item_can.png', 32, 32],
  ['goal_flagfish', 'assets/sprites/goal_flagfish.png', 72, 48],
  ['question', 'assets/tiles/question.png', 48, 48],
  ['crumble', 'assets/tiles/crumble.png', 48, 48],
  ['crumble_ground', 'assets/tiles/crumble_ground.png', 48, 48],
  ['lava', 'assets/tiles/lava.png', 48, 48],
  ['water', 'assets/tiles/water.png', 48, 48],
];

/** 普通图片（key, 路径） */
const IMAGES = [
  ['goal_pole', 'assets/sprites/goal_pole.png'],
  ['ground_top', 'assets/tiles/ground_top.png'],
  ['ground_fill', 'assets/tiles/ground_fill.png'],
  ['brick', 'assets/tiles/brick.png'],
  ['stone', 'assets/tiles/stone.png'],
  ['question_used', 'assets/tiles/question_used.png'],
  ['pipe_tl', 'assets/tiles/pipe_tl.png'],
  ['pipe_tr', 'assets/tiles/pipe_tr.png'],
  ['pipe_bl', 'assets/tiles/pipe_bl.png'],
  ['pipe_br', 'assets/tiles/pipe_br.png'],
  ['spike', 'assets/tiles/spike.png'],
  ['invisible', 'assets/tiles/invisible.png'],
  ['conveyor', 'assets/tiles/conveyor.png'],
  ['bg_sky', 'assets/ui/bg_sky.png'],
  ['bg_far', 'assets/ui/bg_far.png'],
  ['bg_mid', 'assets/ui/bg_mid.png'],
  ['cloud_soft', 'assets/ui/cloud_soft.png'],
  ['cloud_evil', 'assets/ui/cloud_evil.png'],
  ['sun_soft', 'assets/ui/sun_soft.png'],
  ['sun_evil', 'assets/ui/sun_evil.png'],
  ['panel', 'assets/ui/panel.png'],
  ['icon_coin', 'assets/ui/icon_coin.png'],
  ['icon_skull', 'assets/ui/icon_skull.png'],
  ['icon_cat', 'assets/ui/icon_cat.png'],
  ['icon_clock', 'assets/ui/icon_clock.png'],
];

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    this.buildLoadingUI();

    for (const [key, path] of IMAGES) this.load.image(key, path);
    for (const [key, path, w, h] of SHEETS) this.load.spritesheet(key, path, { frameWidth: w, frameHeight: h });
    for (const lv of LEVELS) this.load.json(lv.key, lv.file);

    this.load.on('progress', (p) => this.setProgress(p));
    this.load.on('loaderror', (file) => {
      console.error('[Preload] 资源加载失败:', file.key, file.src);
      this.loadError = true;
    });
  }

  buildLoadingUI() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(0x2b2024);
    this.add.image(cx, cy, 'bg_sky').setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.18);

    this.add.text(cx, cy - 96, '猫咪历险记', {
      fontFamily: 'PingFang SC, Helvetica Neue, Arial, sans-serif',
      fontSize: '44px', color: '#ffecd6', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 52, "Cat's Perilous Adventure", {
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      fontSize: '16px', color: '#c4b2aa', letterSpacing: 3,
    }).setOrigin(0.5);

    const barW = 420;
    const barH = 22;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(cx - barW / 2 - 4, cy + 18, barW + 8, barH + 8, 15);
    g.fillStyle(0xfffdfa, 0.18);
    g.fillRoundedRect(cx - barW / 2, cy + 22, barW, barH, 11);
    this.barG = g;
    this.barGeom = { x: cx - barW / 2, y: cy + 22, w: barW, h: barH };

    this.pctText = this.add.text(cx, cy + 76, '正在加载…', {
      fontFamily: 'PingFang SC, Helvetica Neue, Arial, sans-serif',
      fontSize: '14px', color: '#c4b2aa',
    }).setOrigin(0.5);

    this.tipText = this.add.text(cx, GAME_HEIGHT - 54,
      '提示：按住跳跃键能跳得更高；掉下平台前的 0.1 秒内仍然可以起跳。', {
        fontFamily: 'PingFang SC, Helvetica Neue, Arial, sans-serif',
        fontSize: '13px', color: '#8b7c78',
      }).setOrigin(0.5);
  }

  setProgress(p) {
    const { x, y, w, h } = this.barGeom;
    this.barG.fillStyle(0xffc842, 1);
    const filled = Math.max(6, w * p);
    this.barG.fillRoundedRect(x, y, filled, h, 11);
    if (this.pctText) this.pctText.setText(`正在加载… ${Math.round(p * 100)}%`);
  }

  create() {
    if (this.loadError) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24,
        '有资源加载失败，请确认是通过 npm run dev 启动的本地服务器访问本页。', {
          fontFamily: 'PingFang SC, sans-serif', fontSize: '14px', color: '#ff9a9a',
        }).setOrigin(0.5);
    }
    registerAnimations(this.anims);
    this.scene.start('Menu');
  }
}
