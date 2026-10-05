/**
 * HUD —— 圆角卡片 + 柔和阴影的现代扁平风界面
 * ---------------------------------------------------------------
 * 与像素/卡通主体形成有意的风格对比（"复古内容 + 现代 UI"）。
 * 全部元素 setScrollFactor(0)，永远贴在屏幕上。
 *
 * 流畅度注意：setTime/setForm 每帧都会被调用，内部做了脏检查 ——
 * 文本没变化时绝不 setText（Text.setText 会触发重新排版，是隐形开销大户）。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants.js';
import { formatTime } from '../utils/save.js';
import { t } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

/** 画一张圆角卡片（优先用 9-slice 素材，缺失时退回 Graphics 手绘） */
export function drawCard(scene, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 16;
  const fill = opts.fill ?? 0xfffdfa;
  const alpha = opts.alpha ?? 0.92;
  const line = opts.line ?? COLORS.line;

  const g = scene.add.graphics();
  if (!opts.worldSpace) g.setScrollFactor(0);
  // 柔和阴影（双层：近影贴边、远影发散）
  g.fillStyle(COLORS.shadow, 0.08);
  g.fillRoundedRect(x + 3, y + 6, w, h, radius);
  // 卡片本体
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  // 顶部高光
  g.fillStyle(0xffffff, 0.35);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h * 0.40, radius * 0.8);
  // 描边
  g.lineStyle(2, line, 0.9);
  g.strokeRoundedRect(x, y, w, h, radius);
  return g;
}

export default class Hud {
  constructor(scene) {
    this.scene = scene;
    this.depth = 200;
    this.deaths = 0;
    this.coins = 0;
    // —— 脏检查缓存 ——
    this._lastTime = '';
    this._lastForm = '';
    this._lastStar = '';
    this.build();
  }

  build() {
    const s = this.scene;

    // —— 左上：关卡名 ——
    this._leftW = 244;
    this.leftCard = drawCard(s, 14, 12, this._leftW, 52, { radius: 14 });
    this.leftCard.setDepth(this.depth);
    this.levelText = s.add.text(30, 23, '', {
      fontFamily: FONT, fontSize: '16px', color: '#3e2e32', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);
    this.subText = s.add.text(30, 44, '', {
      fontFamily: FONT, fontSize: '11px', color: '#8b7c78',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // —— 右上：金鱼 / 死亡 / 时间（三组等距排布）——
    const w = 312;
    const x = GAME_WIDTH - w - 14;
    this.rightCard = drawCard(s, x, 12, w, 52, { radius: 14 });
    this.rightCard.setDepth(this.depth);

    this.coinIcon = s.add.image(x + 26, 38, 'icon_coin').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.85);
    this.coinText = s.add.text(x + 44, 30, '0', {
      fontFamily: FONT, fontSize: '17px', color: '#3e2e32', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.skullIcon = s.add.image(x + 118, 38, 'icon_skull').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.85);
    this.deathText = s.add.text(x + 136, 30, '0', {
      fontFamily: FONT, fontSize: '17px', color: '#b63c3c', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.clockIcon = s.add.image(x + 210, 38, 'icon_clock').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.85);
    this.timeText = s.add.text(x + 228, 31, '0:00.00', {
      fontFamily: FONT, fontSize: '15px', color: '#3e2e32',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // —— 左下：形态指示 ——
    this.formCard = drawCard(s, 14, GAME_HEIGHT - 58, 168, 44, { radius: 13 });
    this.formCard.setDepth(this.depth);
    this.catIcon = s.add.image(38, GAME_HEIGHT - 36, 'icon_cat').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.9);
    this.formText = s.add.text(58, GAME_HEIGHT - 45, t('hud.small'), {
      fontFamily: FONT, fontSize: '14px', color: '#3e2e32', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);
    this.starText = s.add.text(58, GAME_HEIGHT - 28, '', {
      fontFamily: FONT, fontSize: '11px', color: '#de9a22',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // —— 提示条（屏幕中上部，用于"这是第几次被坑"之类的调侃）——
    this.toastBg = s.add.graphics().setScrollFactor(0).setDepth(this.depth + 2);
    this.toastText = s.add.text(GAME_WIDTH / 2, 104, '', {
      fontFamily: FONT, fontSize: '18px', color: '#fffdfa', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(this.depth + 3).setAlpha(0);
    this.toastTimer = null;
  }

  setLevelName(name, subtitle) {
    this.levelText.setText(name);
    this.subText.setText(subtitle || '');
    // 卡片宽度随文字自适应：英文关卡名比中文长不少，固定宽度会溢出
    const w = Math.max(244,
      Math.ceil(this.levelText.width) + 34,
      Math.ceil(this.subText.width) + 34);
    if (w !== this._leftW) {
      this._leftW = w;
      const d = this.leftCard.depth;
      this.leftCard.destroy();
      this.leftCard = drawCard(this.scene, 14, 12, w, 52, { radius: 14 });
      this.leftCard.setDepth(d);
    }
  }

  setCoins(n) {
    if (n === this.coins) return;
    this.coins = n;
    this.coinText.setText(String(n));
    this.scene.tweens.add({
      targets: this.coinIcon, scale: { from: 1.25, to: 0.85 },
      duration: 180, ease: 'Back.easeOut',
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
    // 无敌星倒计时按 0.1s 粒度缓存，避免每帧重排文本
    const star = starLeftMs > 0 ? Math.ceil(starLeftMs / 100) : 0;
    if (form === this._lastForm && star === this._lastStar) return;
    this._lastForm = form;
    this._lastStar = star;

    const big = form === 'big';
    this.formText.setText(big ? t('hud.big') : t('hud.small'));
    this.formText.setColor(big ? '#d88034' : '#3e2e32');
    this.starText.setText(star > 0 ? t('hud.star', { s: (star / 10).toFixed(1) }) : '');
  }

  /** 屏幕中部弹出的一句话提示 */
  toast(msg, ms = 1500, color = 0x3e2e32) {
    if (this.toastTimer) this.toastTimer.remove();
    const t2 = this.toastText;
    t2.setText(msg).setAlpha(1).setY(104).setColor('#fffdfa');

    const pad = 26;
    const w = Math.max(220, t2.width + pad * 2);
    const h = t2.height + 22;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 104 - h / 2;
    this.toastBg.clear();
    // 提示条：主体 + 底部深色压边，比单色块更有分量
    this.toastBg.fillStyle(0x2b2024, 0.35);
    this.toastBg.fillRoundedRect(x, y + 3, w, h, 14);
    this.toastBg.fillStyle(color, 0.92);
    this.toastBg.fillRoundedRect(x, y, w, h, 14);
    this.toastBg.setAlpha(1);

    this.scene.tweens.add({
      targets: [t2], scale: { from: 0.86, to: 1 }, duration: 160, ease: 'Back.easeOut',
    });

    this.toastTimer = this.scene.time.delayedCall(ms, () => {
      this.scene.tweens.add({
        targets: [t2, this.toastBg], alpha: 0, duration: 260,
      });
    });
  }

  destroy() {
    // 场景切换时 Phaser 会自动清理，这里只清掉计时器
    if (this.toastTimer) this.toastTimer.remove();
  }
}
