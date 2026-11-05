/**
 * HUD —— 工作室级 3× 超清矢量抗锯齿 UI 组件与关卡内状态栏
 * ---------------------------------------------------------------
 * 所有圆角卡片 (drawCard)、徽章 (drawBadge)、胶囊槽 (drawPill)、圆形头像框 (drawCircleBadge)
 * 均采用 3× 超采样 HTML5 2D Canvas 矢量绘制并缓存为 WebGL 纹理，
 * 彻底根除 WebGL Graphics 多边形折线锯齿，呈现丝滑细腻的 Retina 级 UI 质感。
 *
 * 流畅度注意：setTime/setForm 每帧都会被调用，内部做了脏检查 ——
 * 文本没变化时绝不 setText（Text.setText 会触发重新排版，是隐形开销大户）。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants.js';
import { normalizeTextureLogicalScale } from '../utils/studioArt.js';
import { formatTime } from '../utils/save.js';
import { t } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';
const UI_SS = 3; // 3× 超采样矢量渲染倍率

function hexToRgba(hex, alpha = 1) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function getOrMakeUiTexture(scene, key, w, h, drawFn) {
  const texMgr = scene.textures;
  if (!texMgr.exists(key)) {
    const cw = Math.max(1, Math.ceil(w));
    const ch = Math.max(1, Math.ceil(h));
    const cv = texMgr.createCanvas(key, cw * UI_SS, ch * UI_SS);
    const ctx = cv.getContext();
    ctx.clearRect(0, 0, cw * UI_SS, ch * UI_SS);
    ctx.save();
    ctx.scale(UI_SS, UI_SS);
    drawFn(ctx, cw, ch);
    ctx.restore();
    cv.refresh();
    normalizeTextureLogicalScale(texMgr.get(key), UI_SS);
  }
  return key;
}

/**
 * 画一张工作室级 3× 超清抗锯齿立体圆角卡片（带环境投影、底部 3D 厚度沿、顶部高光与内衬描边）
 */
export function drawCard(scene, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 16;
  const fill = opts.fill ?? 0xfffdfa;
  const alpha = opts.alpha ?? 0.96;
  const line = opts.line ?? COLORS.line;
  const lineAlpha = opts.lineAlpha ?? 0.96;
  const lineWidth = opts.lineWidth ?? (opts.selected ? 2.4 : 1.8);
  const lip = opts.lip ?? (opts.selected ? 0xe09624 : (opts.danger ? 0xd98282 : 0xdccfc2));
  const shadowAlpha = opts.shadowAlpha ?? 0.16;
  const accent = opts.accent ?? 0;
  const selected = opts.selected ? 1 : 0;

  const pad = 8;
  const tw = Math.ceil(w) + pad * 2;
  const th = Math.ceil(h) + pad * 2;
  const key = [
    '__ui_card', Math.ceil(w), Math.ceil(h), radius,
    fill, Math.round(alpha * 100), line, Math.round(lineWidth * 10),
    lip, Math.round(shadowAlpha * 100), accent, selected,
  ].join('_');

  getOrMakeUiTexture(scene, key, tw, th, (ctx) => {
    const ox = pad;
    const oy = pad;

    // 1) 环境弥散投影
    if (shadowAlpha > 0) {
      roundRectPath(ctx, ox + 1.5, oy + 5, w, h, radius);
      ctx.fillStyle = hexToRgba(0x1e1418, shadowAlpha);
      ctx.fill();
    }

    // 2) 底部 3D 物理厚度沿
    roundRectPath(ctx, ox, oy + 3, w, h, radius);
    ctx.fillStyle = hexToRgba(lip, alpha);
    ctx.fill();

    // 3) 卡片主面板
    roundRectPath(ctx, ox, oy, w, h, radius);
    ctx.fillStyle = hexToRgba(fill, alpha);
    ctx.fill();

    // 4) 顶部镜面柔光带
    const glossH = Math.min(22, h * 0.42);
    roundRectPath(ctx, ox + 3, oy + 2, Math.max(4, w - 6), glossH, Math.max(4, radius - 3));
    const gg = ctx.createLinearGradient(0, oy + 2, 0, oy + 2 + glossH);
    gg.addColorStop(0, hexToRgba(0xffffff, selected ? 0.72 : 0.52));
    gg.addColorStop(1, hexToRgba(0xffffff, 0.05));
    ctx.fillStyle = gg;
    ctx.fill();

    // 5) 可选左侧主题色条
    if (accent) {
      roundRectPath(ctx, ox + 6, oy + 7, 5, Math.max(6, h - 14), 2.5);
      ctx.fillStyle = hexToRgba(accent, 1);
      ctx.fill();
    }

    // 6) 外框丝滑抗锯齿描边
    roundRectPath(ctx, ox, oy, w, h, radius);
    ctx.strokeStyle = hexToRgba(line, lineAlpha);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  });

  const img = scene.add.image(x - pad, y - pad, key).setOrigin(0, 0);
  if (!opts.worldSpace) img.setScrollFactor(0);
  return img;
}

/**
 * 画一枚 3× 超清抗锯齿立体图标徽章（用于菜单项图标底托、STAGE 徽章、暂停小按钮等）
 */
export function drawBadge(scene, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 9;
  const fill = opts.fill ?? 0xe68a2e;
  const alpha = opts.alpha ?? 1;
  const lip = opts.lip ?? 0x2a1d20;
  const lipAlpha = opts.lipAlpha ?? 0.22;
  const line = opts.line ?? 0;
  const lineWidth = opts.lineWidth ?? 1.5;
  const gloss = opts.gloss !== false;

  const pad = 4;
  const tw = Math.ceil(w) + pad * 2;
  const th = Math.ceil(h) + pad * 2;
  const key = [
    '__ui_badge', Math.ceil(w), Math.ceil(h), radius,
    fill, Math.round(alpha * 100), lip, Math.round(lipAlpha * 100),
    line, Math.round(lineWidth * 10), gloss ? 1 : 0,
  ].join('_');

  getOrMakeUiTexture(scene, key, tw, th, (ctx) => {
    const ox = pad;
    const oy = pad;
    if (lipAlpha > 0) {
      roundRectPath(ctx, ox, oy + 2, w, h, radius);
      ctx.fillStyle = hexToRgba(lip, lipAlpha * alpha);
      ctx.fill();
    }
    roundRectPath(ctx, ox, oy, w, h, radius);
    ctx.fillStyle = hexToRgba(fill, alpha);
    ctx.fill();

    if (gloss) {
      roundRectPath(ctx, ox + 2, oy + 2, Math.max(4, w - 4), Math.min(12, h * 0.36), Math.max(3, radius - 3));
      ctx.fillStyle = hexToRgba(0xffffff, 0.24 * alpha);
      ctx.fill();
    }
    if (line) {
      roundRectPath(ctx, ox, oy, w, h, radius);
      ctx.strokeStyle = hexToRgba(line, alpha);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  });

  const img = scene.add.image(x - pad, y - pad, key).setOrigin(0, 0);
  if (!opts.worldSpace) img.setScrollFactor(0);
  return img;
}

/**
 * 画一枚 3× 超清抗锯齿圆角胶囊/内嵌底槽（用于副标题胶囊、页脚胶囊、数据槽、内衬面板等）
 */
export function drawPill(scene, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? Math.round(h / 2);
  const fill = opts.fill ?? 0x21161a;
  const alpha = opts.alpha ?? 0.82;
  const line = opts.line ?? 0;
  const lineAlpha = opts.lineAlpha ?? 0.65;
  const lineWidth = opts.lineWidth ?? 1.5;
  const shadowAlpha = opts.shadowAlpha ?? 0;

  const pad = 4;
  const tw = Math.ceil(w) + pad * 2;
  const th = Math.ceil(h) + pad * 2;
  const key = [
    '__ui_pill', Math.ceil(w), Math.ceil(h), radius,
    fill, Math.round(alpha * 100), line, Math.round(lineAlpha * 100),
    Math.round(lineWidth * 10), Math.round(shadowAlpha * 100),
  ].join('_');

  getOrMakeUiTexture(scene, key, tw, th, (ctx) => {
    const ox = pad;
    const oy = pad;
    if (shadowAlpha > 0) {
      roundRectPath(ctx, ox + 1, oy + 3, w, h, radius);
      ctx.fillStyle = hexToRgba(0x181014, shadowAlpha);
      ctx.fill();
    }
    roundRectPath(ctx, ox, oy, w, h, radius);
    ctx.fillStyle = hexToRgba(fill, alpha);
    ctx.fill();
    if (line && lineAlpha > 0) {
      roundRectPath(ctx, ox, oy, w, h, radius);
      ctx.strokeStyle = hexToRgba(line, lineAlpha);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  });

  const img = scene.add.image(x - pad, y - pad, key).setOrigin(0, 0);
  if (!opts.worldSpace) img.setScrollFactor(0);
  return img;
}

/**
 * 画一枚 3× 超清抗锯齿圆形头像底座
 */
export function drawCircleBadge(scene, cx, cy, r, opts = {}) {
  const fill = opts.fill ?? 0xffe8c2;
  const alpha = opts.alpha ?? 1;
  const line = opts.line ?? 0xe2b274;
  const lineWidth = opts.lineWidth ?? 2;

  const pad = 4;
  const size = Math.ceil(r * 2) + pad * 2;
  const key = [
    '__ui_circ', Math.ceil(r), fill, Math.round(alpha * 100), line, Math.round(lineWidth * 10),
  ].join('_');

  getOrMakeUiTexture(scene, key, size, size, (ctx, cw, ch) => {
    const mx = cw / 2;
    const my = ch / 2;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(fill, alpha);
    ctx.fill();
    if (line) {
      ctx.strokeStyle = hexToRgba(line, alpha);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  });

  const img = scene.add.image(cx, cy, key).setOrigin(0.5);
  if (!opts.worldSpace) img.setScrollFactor(0);
  return img;
}

export default class Hud {
  constructor(scene) {
    this.scene = scene;
    this.depth = 200;
    this.deaths = 0;
    this.coins = 0;
    this._lastTime = '';
    this._lastForm = '';
    this._lastStar = -1;
    this.build();
  }

  build() {
    const s = this.scene;

    // =========================================================================
    // 1. 左上：STAGE 徽章 + 关卡标题与副标题铭牌
    // =========================================================================
    this._leftW = 280;
    this.leftCard = drawCard(s, 14, 12, this._leftW, 54, { radius: 15 });
    this.leftCard.setDepth(this.depth);

    this._drawStageBadge(1);

    this.stageBadgeText = s.add.text(44, 37, 'S1', {
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      fontSize: '13px',
      color: '#fffdfa',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(this.depth + 2);

    this.levelText = s.add.text(72, 20, '', {
      fontFamily: FONT, fontSize: '15.5px', color: '#36262a', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.subText = s.add.text(72, 42, '', {
      fontFamily: FONT, fontSize: '11px', color: '#82706c',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // =========================================================================
    // 2. 右上：金鱼币 / 死亡数 / 计时器 三联数据胶囊 + 可点击暂停键
    // =========================================================================
    const w = 356;
    const x = GAME_WIDTH - w - 14;
    this.rightCard = drawCard(s, x, 12, w, 54, { radius: 15 });
    this.rightCard.setDepth(this.depth);

    // 三个内嵌浅底槽位 + 右侧暂停小按钮（全部 3× 超清矢量抗锯齿）
    drawPill(s, x + 10, 20, 82, 38, { radius: 10, fill: 0xfff3d6, alpha: 0.92 }).setDepth(this.depth + 0.5);
    drawPill(s, x + 98, 20, 86, 38, { radius: 10, fill: 0xffebeb, alpha: 0.92 }).setDepth(this.depth + 0.5);
    drawPill(s, x + 190, 20, 114, 38, { radius: 10, fill: 0xf2eee9, alpha: 0.95 }).setDepth(this.depth + 0.5);
    drawBadge(s, x + 310, 20, 36, 35, {
      radius: 10, fill: 0xfff7ec, lip: 0xd8cbc0, lipAlpha: 1, line: 0xcdbdb0, lineWidth: 1.5, gloss: false,
    }).setDepth(this.depth + 0.5);

    this.coinIcon = s.add.image(x + 28, 39, 'icon_coin').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.86);
    this.coinText = s.add.text(x + 46, 30, '0', {
      fontFamily: FONT, fontSize: '17px', color: '#36262a', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.skullIcon = s.add.image(x + 116, 39, 'icon_skull').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.86);
    this.deathText = s.add.text(x + 135, 30, '0', {
      fontFamily: FONT, fontSize: '17px', color: '#bf3b3b', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.clockIcon = s.add.image(x + 208, 39, 'icon_clock').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.84);
    this.timeText = s.add.text(x + 225, 31, '0:00.00', {
      fontFamily: 'Helvetica Neue, Arial, sans-serif',
      fontSize: '15px', color: '#36262a', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // 暂停图标文字（支持鼠标点击暂停）
    this.pauseBtn = s.add.text(x + 328, 37, '❚❚', {
      fontFamily: FONT, fontSize: '12px', color: '#5c494e', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(this.depth + 1)
      .setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => {
      if (s.togglePause) s.togglePause();
    });

    // =========================================================================
    // 3. 左下：角色头像框 + 形态与无敌星能量条
    // =========================================================================
    this.formCard = drawCard(s, 14, GAME_HEIGHT - 60, 186, 46, { radius: 14 });
    this.formCard.setDepth(this.depth);

    this.avatarBg = drawCircleBadge(s, 39, GAME_HEIGHT - 37, 16, {
      fill: 0xffe8c2, line: 0xe2b274, lineWidth: 1.8,
    }).setDepth(this.depth + 0.5);

    this.catIcon = s.add.image(39, GAME_HEIGHT - 37, 'icon_cat').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.92);
    this.formText = s.add.text(63, GAME_HEIGHT - 48, t('hud.small'), {
      fontFamily: FONT, fontSize: '14px', color: '#36262a', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);
    this.starText = s.add.text(63, GAME_HEIGHT - 29, '', {
      fontFamily: FONT, fontSize: '11px', color: '#d68b18', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // =========================================================================
    // 4. 屏幕中上部：成就式横幅 Toast
    // =========================================================================
    this.toastBg = null;
    this.toastText = s.add.text(GAME_WIDTH / 2, 102, '', {
      fontFamily: FONT, fontSize: '17px', color: '#fffdfa', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(this.depth + 3).setAlpha(0);
    this.toastTimer = null;
  }

  _drawStageBadge(levelId = 1) {
    const colors = { 1: 0x4ca858, 2: 0xe68432, 3: 0xc8463c };
    const col = colors[levelId] || 0x4ca858;
    if (this.stageBadgeBg) this.stageBadgeBg.destroy();
    this.stageBadgeBg = drawBadge(this.scene, 24, 20, 40, 35, {
      radius: 10, fill: col, lip: 0x2a1d20, lipAlpha: 0.22,
    }).setDepth(this.depth + 1);
    if (this.stageBadgeText) {
      this.stageBadgeText.setText(`S${levelId}`);
      this.stageBadgeText.setPosition(44, 37);
    }
  }

  setLevelName(name, subtitle, levelId = 1) {
    this._drawStageBadge(levelId || this.scene.levelId || 1);
    this.levelText.setText(name);
    this.subText.setText(subtitle || '');
    const w = Math.max(264,
      Math.ceil(this.levelText.width) + 76,
      Math.ceil(this.subText.width) + 76);
    if (w !== this._leftW) {
      this._leftW = w;
      const d = this.leftCard.depth;
      this.leftCard.destroy();
      this.leftCard = drawCard(this.scene, 14, 12, w, 54, { radius: 15 });
      this.leftCard.setDepth(d);
    }
  }

  setCoins(n) {
    if (n === this.coins) return;
    this.coins = n;
    this.coinText.setText(String(n));
    this.scene.tweens.add({
      targets: this.coinIcon, scale: { from: 1.28, to: 0.86 },
      duration: 190, ease: 'Back.easeOut',
    });
  }

  setDeaths(n) {
    if (n === this.deaths) return;
    this.deaths = n;
    this.deathText.setText(String(n));
    this.scene.tweens.add({
      targets: this.deathText, scale: { from: 1.5, to: 1 },
      duration: 240, ease: 'Back.easeOut',
    });
  }

  setTime(ms) {
    const str = formatTime(ms);
    if (str === this._lastTime) return;
    this._lastTime = str;
    this.timeText.setText(str);
  }

  setForm(form, starLeftMs) {
    const star = starLeftMs > 0 ? Math.ceil(starLeftMs / 100) : 0;
    if (form === this._lastForm && star === this._lastStar) return;
    this._lastForm = form;
    this._lastStar = star;

    const big = form === 'big';
    this.formText.setText(big ? t('hud.big') : t('hud.small'));
    this.formText.setColor(big ? '#d87624' : '#36262a');
    this.starText.setText(star > 0 ? t('hud.star', { s: (star / 10).toFixed(1) }) : 'HP ♥ ' + (big ? '2/2' : '1/1'));
    this.starText.setColor(star > 0 ? '#d68b18' : (big ? '#469c56' : '#96847e'));
  }

  /** 屏幕中部弹出的一句话成就风横幅提示 */
  toast(msg, ms = 1500, color = 0x3e2e32) {
    if (this.toastTimer) this.toastTimer.remove();
    const t2 = this.toastText;
    t2.setText(msg).setAlpha(1).setY(102).setColor('#fffdfa');

    const pad = 30;
    const w = Math.ceil(Math.max(240, t2.width + pad * 2));
    const h = Math.ceil(t2.height + 24);
    const x = Math.round(GAME_WIDTH / 2 - w / 2);
    const y = Math.round(102 - h / 2);

    if (this.toastBg) this.toastBg.destroy();
    this.toastBg = drawPill(this.scene, x, y, w, h, {
      radius: 16, fill: color, alpha: 0.96, line: 0xffe4b8, lineAlpha: 0.78, lineWidth: 2, shadowAlpha: 0.32,
    }).setDepth(this.depth + 2);

    const bgRef = this.toastBg;
    this.scene.tweens.add({
      targets: [t2], scale: { from: 0.84, to: 1 }, duration: 170, ease: 'Back.easeOut',
    });

    this.toastTimer = this.scene.time.delayedCall(ms, () => {
      this.scene.tweens.add({
        targets: [t2, bgRef], alpha: 0, duration: 260,
      });
    });
  }

  destroy() {
    if (this.toastTimer) this.toastTimer.remove();
  }
}
