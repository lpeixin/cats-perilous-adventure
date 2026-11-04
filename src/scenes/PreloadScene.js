/**
 * PreloadScene —— 资源加载与工作室纹理初始化
 * ---------------------------------------------------------------
 * 所有资源都来自**本地 assets/ 目录**（Phaser 本体也已复制到 vendor/），
 * 因此加载完成之后整个游戏可以完全离线运行，不请求任何外部域名。
 *
 * 加载完成后还会调用 buildStudioTextures 生成关卡天空、体积光、生态装饰道具与粒子纹理。
 */
import { GAME_WIDTH, GAME_HEIGHT, LEVELS } from '../utils/constants.js';
import { registerAnimations } from '../utils/animations.js';
import { buildStudioTextures } from '../utils/studioArt.js';
import { t } from '../utils/i18n.js';

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

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

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

  create() {
    this.buildAmbientTextures();
    if (this.loadError) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, t('loading.error'), {
        fontFamily: FONT, fontSize: '14px', color: '#ff9a9a',
      }).setOrigin(0.5);
    }
    registerAnimations(this.anims);
    this.scene.start('Menu');
  }

  buildAmbientTextures() {
    buildStudioTextures(this);
  }

  buildLoadingUI() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(0x241a20);

    // 柔和背景装饰与徽章
    const bgG = this.add.graphics();
    bgG.fillGradientStyle(0x33242c, 0x33242c, 0x1e151a, 0x1e151a, 1);
    bgG.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 圆形猫耳徽章光晕
    bgG.fillStyle(0xffc842, 0.08);
    bgG.fillCircle(cx, cy - 115, 72);
    bgG.fillStyle(0xf4943e, 1);
    bgG.fillTriangle(cx - 22, cy - 126, cx - 14, cy - 148, cx - 4, cy - 128);
    bgG.fillTriangle(cx + 4, cy - 128, cx + 14, cy - 148, cx + 22, cy - 126);
    bgG.fillCircle(cx, cy - 112, 22);
    bgG.fillStyle(0x2d2024, 1);
    bgG.fillCircle(cx - 8, cy - 114, 3.2);
    bgG.fillCircle(cx + 8, cy - 114, 3.2);

    this.add.text(cx, cy - 58, t('loading.title'), {
      fontFamily: FONT, fontSize: '42px', color: '#ffefdb', fontStyle: 'bold',
      stroke: '#1b1216', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 16, t('loading.sub'), {
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      fontSize: '14px', color: '#d4b89e', letterSpacing: 4, fontStyle: 'bold',
    }).setOrigin(0.5);

    const barW = 440;
    const barH = 22;
    const trackG = this.add.graphics();
    trackG.fillStyle(0x130d10, 0.65);
    trackG.fillRoundedRect(cx - barW / 2 - 5, cy + 23, barW + 10, barH + 10, 16);
    trackG.lineStyle(2, 0x624952, 0.7);
    trackG.strokeRoundedRect(cx - barW / 2 - 5, cy + 23, barW + 10, barH + 10, 16);
    trackG.fillStyle(0x3a2b32, 0.9);
    trackG.fillRoundedRect(cx - barW / 2, cy + 28, barW, barH, 11);

    this.barG = this.add.graphics();
    this.barGeom = { x: cx - barW / 2, y: cy + 28, w: barW, h: barH };

    this.pctText = this.add.text(cx, cy + 78, t('loading.progress', { p: 0 }), {
      fontFamily: FONT, fontSize: '14px', color: '#e2cfc4', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.tipText = this.add.text(cx, GAME_HEIGHT - 52, t('loading.tip'), {
      fontFamily: FONT, fontSize: '13px', color: '#9c8a84',
      wordWrap: { width: GAME_WIDTH - 200 },
    }).setOrigin(0.5);
  }

  setProgress(p) {
    const { x, y, w, h } = this.barGeom;
    this.barG.clear();
    const filled = Math.max(12, w * p);
    this.barG.fillStyle(0xf09236, 1);
    this.barG.fillRoundedRect(x, y, filled, h, 11);
    this.barG.fillStyle(0xffcf4a, 1);
    this.barG.fillRoundedRect(x, y, filled, h - 4, 10);
    this.barG.fillStyle(0xfff4be, 0.55);
    this.barG.fillRoundedRect(x + 4, y + 3, Math.max(4, filled - 8), 6, 4);

    if (this.pctText) {
      const str = t('loading.progress', { p: Math.round(p * 100) });
      if (str !== this._lastPct) {
        this._lastPct = str;
        this.pctText.setText(str);
      }
    }
  }
}
