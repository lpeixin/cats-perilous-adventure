/**
 * HUD —— 工作室级立体质感 UI 组件与关卡内状态栏
 * ---------------------------------------------------------------
 * 提供全场景通用的立体圆角卡片 (drawCard)、按键帽徽章 (drawPillBadge)
 * 以及关卡内左上角关卡铭牌、右上角三联数据胶囊、左下角角色头像状态卡与成就式 Toast 横幅。
 *
 * 流畅度注意：setTime/setForm 每帧都会被调用，内部做了脏检查 ——
 * 文本没变化时绝不 setText（Text.setText 会触发重新排版，是隐形开销大户）。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants.js';
import { formatTime } from '../utils/save.js';
import { t } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

/**
 * 画一张工作室级立体圆角卡片（带环境投影、底部 3D 厚度沿、顶部高光与内衬描边）
 */
export function drawCard(scene, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 16;
  const fill = opts.fill ?? 0xfffdfa;
  const alpha = opts.alpha ?? 0.95;
  const line = opts.line ?? COLORS.line;
  const lip = opts.lip ?? (opts.selected ? 0xe09624 : (opts.danger ? 0xd98282 : 0xdccfc2));
  const shadowAlpha = opts.shadowAlpha ?? 0.16;

  const g = scene.add.graphics();
  if (!opts.worldSpace) g.setScrollFactor(0);

  // 1) 环境弥散投影
  g.fillStyle(0x1e1418, shadowAlpha);
  g.fillRoundedRect(x + 2, y + 6, w, h, radius);

  // 2) 底部 3D 物理厚度沿
  g.fillStyle(lip, alpha);
  g.fillRoundedRect(x, y + 3, w, h, radius);

  // 3) 卡片主面板
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);

  // 4) 顶部镜面柔光带
  g.fillStyle(0xffffff, opts.selected ? 0.65 : 0.45);
  g.fillRoundedRect(x + 3, y + 2, w - 6, Math.min(22, h * 0.42), Math.max(4, radius - 3));

  // 5) 可选左侧主题色条
  if (opts.accent) {
    g.fillStyle(opts.accent, 1);
    g.fillRoundedRect(x + 6, y + 7, 5, h - 14, 2.5);
  }

  // 6) 外框描边
  g.lineStyle(opts.lineWidth ?? (opts.selected ? 2.6 : 2), line, 0.96);
  g.strokeRoundedRect(x, y, w, h, radius);

  return g;
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

    this.stageBadgeBg = s.add.graphics().setScrollFactor(0).setDepth(this.depth + 1);
    this._drawStageBadge(1);

    this.stageBadgeText = s.add.text(44, 29, 'S1', {
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

    // 三个内嵌浅底槽位 + 右侧暂停小按钮
    const slotG = s.add.graphics().setScrollFactor(0).setDepth(this.depth + 0.5);
    // 金鱼槽
    slotG.fillStyle(0xfff3d6, 0.9);
    slotG.fillRoundedRect(x + 10, 20, 82, 38, 10);
    // 死亡槽
    slotG.fillStyle(0xffebeb, 0.9);
    slotG.fillRoundedRect(x + 98, 20, 86, 38, 10);
    // 计时槽
    slotG.fillStyle(0xf2eee9, 0.95);
    slotG.fillRoundedRect(x + 190, 20, 114, 38, 10);
    // 暂停键立体小方块
    slotG.fillStyle(0xd8cbc0, 1);
    slotG.fillRoundedRect(x + 310, 22, 36, 36, 10);
    slotG.fillStyle(0xfff7ec, 1);
    slotG.fillRoundedRect(x + 310, 20, 36, 35, 10);
    slotG.lineStyle(1.5, 0xcdbdb0, 1);
    slotG.strokeRoundedRect(x + 310, 20, 36, 35, 10);

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

    this.avatarBg = s.add.graphics().setScrollFactor(0).setDepth(this.depth + 0.5);
    this.avatarBg.fillStyle(0xffe8c2, 1);
    this.avatarBg.fillCircle(39, GAME_HEIGHT - 37, 16);
    this.avatarBg.lineStyle(1.8, 0xe2b274, 1);
    this.avatarBg.strokeCircle(39, GAME_HEIGHT - 37, 16);

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
    this.toastBg = s.add.graphics().setScrollFactor(0).setDepth(this.depth + 2);
    this.toastText = s.add.text(GAME_WIDTH / 2, 102, '', {
      fontFamily: FONT, fontSize: '17px', color: '#fffdfa', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(this.depth + 3).setAlpha(0);
    this.toastTimer = null;
  }

  _drawStageBadge(levelId = 1) {
    const colors = { 1: 0x4ca858, 2: 0xe68432, 3: 0xc8463c };
    const col = colors[levelId] || 0x4ca858;
    this.stageBadgeBg.clear();
    this.stageBadgeBg.fillStyle(0x2a1d20, 0.22);
    this.stageBadgeBg.fillRoundedRect(24, 22, 40, 36, 10);
    this.stageBadgeBg.fillStyle(col, 1);
    this.stageBadgeBg.fillRoundedRect(24, 20, 40, 35, 10);
    this.stageBadgeBg.fillStyle(0xffffff, 0.25);
    this.stageBadgeBg.fillRoundedRect(26, 22, 36, 12, 6);
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
    const w = Math.max(240, t2.width + pad * 2);
    const h = t2.height + 24;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 102 - h / 2;
    this.toastBg.clear();
    // 投影 + 立体底边 + 主体 + 金色细内框
    this.toastBg.fillStyle(0x181014, 0.36);
    this.toastBg.fillRoundedRect(x + 2, y + 5, w, h, 16);
    this.toastBg.fillStyle(color, 0.96);
    this.toastBg.fillRoundedRect(x, y, w, h, 16);
    this.toastBg.fillStyle(0xffffff, 0.16);
    this.toastBg.fillRoundedRect(x + 4, y + 3, w - 8, h * 0.42, 12);
    this.toastBg.lineStyle(2, 0xffe4b8, 0.75);
    this.toastBg.strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, 14);
    this.toastBg.setAlpha(1);

    this.scene.tweens.add({
      targets: [t2], scale: { from: 0.84, to: 1 }, duration: 170, ease: 'Back.easeOut',
    });

    this.toastTimer = this.scene.time.delayedCall(ms, () => {
      this.scene.tweens.add({
        targets: [t2, this.toastBg], alpha: 0, duration: 260,
      });
    });
  }

  destroy() {
    if (this.toastTimer) this.toastTimer.remove();
  }
}
