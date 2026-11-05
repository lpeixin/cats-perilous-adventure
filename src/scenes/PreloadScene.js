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
import { buildStudioTextures, normalizeTextureLogicalScale } from '../utils/studioArt.js';
import { t } from '../utils/i18n.js';

/** PNG 素材的高清倍率（与 tools/gen_assets.py 中 HD = 2 对应） */
const ASSET_HD = 2;

/** 需要按精灵表切分的图（key, 路径, 逻辑单帧宽, 逻辑单帧高） */
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

/** TileSprite 使用完整 2× 源图配合 setTileScale(0.5)，不缩小 frame.cutWidth */
const TILESPRITE_KEYS = new Set(['bg_far', 'bg_mid']);

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    this.buildLoadingUI();

    for (const [key, path] of IMAGES) this.load.image(key, path);
    for (const [key, path, w, h] of SHEETS) {
      this.load.spritesheet(key, path, {
        frameWidth: w * ASSET_HD,
        frameHeight: h * ASSET_HD,
      });
    }
    for (const lv of LEVELS) this.load.json(lv.key, lv.file);

    this.load.on('progress', (p) => this.setProgress(p));
    this.load.on('loaderror', (file) => {
      console.error('[Preload] 资源加载失败:', file.key, file.src);
      this.loadError = true;
    });
  }

  create() {
    for (const [key] of IMAGES) {
      if (!TILESPRITE_KEYS.has(key) && this.textures.exists(key)) {
        normalizeTextureLogicalScale(this.textures.get(key), ASSET_HD);
      }
    }
    for (const [key] of SHEETS) {
      if (this.textures.exists(key)) {
        normalizeTextureLogicalScale(this.textures.get(key), ASSET_HD);
      }
    }
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

    // 柔和背景渐变
    const bgG = this.add.graphics();
    bgG.fillGradientStyle(0x33242c, 0x33242c, 0x1e151a, 0x1e151a, 1);
    bgG.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 使用 3× 超采样 2D Canvas 绘制猫耳徽章与进度条底槽，杜绝 WebGL Graphics 多边形锯齿
    const S = 3;
    if (!this.textures.exists('__preload_emblem')) {
      const cv = this.textures.createCanvas('__preload_emblem', 160 * S, 160 * S);
      const ctx = cv.getContext();
      ctx.save();
      ctx.scale(S, S);
      const rg = ctx.createRadialGradient(80, 84, 6, 80, 84, 72);
      rg.addColorStop(0, 'rgba(255, 200, 66, 0.20)');
      rg.addColorStop(1, 'rgba(255, 200, 66, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(80, 84, 72, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f4943e';
      ctx.strokeStyle = '#1b1216';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      for (const [x0, y0, x1, y1, x2, y2] of [
        [58, 70, 66, 46, 76, 68],
        [84, 68, 94, 46, 102, 70],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(80, 84, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#2d2024';
      ctx.beginPath();
      ctx.arc(72, 82, 3.2, 0, Math.PI * 2);
      ctx.arc(88, 82, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      cv.refresh();
      normalizeTextureLogicalScale(this.textures.get('__preload_emblem'), S);
    }
    this.add.image(cx, cy - 115, '__preload_emblem');

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
    const pad = 8;
    const cw = barW + pad * 2;
    const ch = barH + pad * 2;
    if (this.textures.exists('__preload_bar')) this.textures.remove('__preload_bar');
    this.barCanvas = this.textures.createCanvas('__preload_bar', cw * S, ch * S);
    normalizeTextureLogicalScale(this.textures.get('__preload_bar'), S);
    this.add.image(cx, cy + 39, '__preload_bar');
    this.barGeom = { w: barW, h: barH, pad, cw, ch, s: S };

    this.pctText = this.add.text(cx, cy + 78, t('loading.progress', { p: 0 }), {
      fontFamily: FONT, fontSize: '14px', color: '#e2cfc4', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.tipText = this.add.text(cx, GAME_HEIGHT - 52, t('loading.tip'), {
      fontFamily: FONT, fontSize: '13px', color: '#9c8a84',
      wordWrap: { width: GAME_WIDTH - 200 },
    }).setOrigin(0.5);

    this.setProgress(0.02);
  }

  setProgress(p) {
    if (this.barCanvas && this.barGeom) {
      const { w, h, pad, cw, ch, s } = this.barGeom;
      const ctx = this.barCanvas.getContext();
      ctx.clearRect(0, 0, cw * s, ch * s);
      ctx.save();
      ctx.scale(s, s);

      const rr = (x, y, rw, rh, r) => {
        const rad = Math.min(r, rw / 2, rh / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
        ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
        ctx.arcTo(x, y + rh, x, y, rad);
        ctx.arcTo(x, y, x + rw, y, rad);
        ctx.closePath();
      };

      rr(pad - 5, pad - 5, w + 10, h + 10, 16);
      ctx.fillStyle = 'rgba(19, 13, 16, 0.68)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(98, 73, 82, 0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();

      rr(pad, pad, w, h, 11);
      ctx.fillStyle = 'rgba(58, 43, 50, 0.92)';
      ctx.fill();

      const filled = Math.max(14, w * p);
      rr(pad, pad, filled, h, 11);
      ctx.fillStyle = '#f09236';
      ctx.fill();

      rr(pad, pad, filled, h - 4, 10);
      ctx.fillStyle = '#ffcf4a';
      ctx.fill();

      rr(pad + 4, pad + 3, Math.max(4, filled - 8), 6, 3);
      ctx.fillStyle = 'rgba(255, 244, 190, 0.6)';
      ctx.fill();

      ctx.restore();
      this.barCanvas.refresh();
    }

    if (this.pctText) {
      const str = t('loading.progress', { p: Math.round(p * 100) });
      if (str !== this._lastPct) {
        this._lastPct = str;
        this.pctText.setText(str);
      }
    }
  }
}
