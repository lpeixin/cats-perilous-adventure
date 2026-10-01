/**
 * HUD —— 圆角卡片 + 柔和阴影的现代扁平风界面
 * ---------------------------------------------------------------
 * 与像素/卡通主体形成有意的风格对比（"复古内容 + 现代 UI"）。
 * 全部元素 setScrollFactor(0)，永远贴在屏幕上。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants.js';
import { formatTime } from '../utils/save.js';

/** 画一张圆角卡片（优先用 9-slice 素材，缺失时退回 Graphics 手绘） */
export function drawCard(scene, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 16;
  const fill = opts.fill ?? 0xfffdfa;
  const alpha = opts.alpha ?? 0.92;
  const line = opts.line ?? COLORS.line;

  const g = scene.add.graphics();
  g.setScrollFactor(0);
  // 柔和阴影
  g.fillStyle(COLORS.shadow, 0.10);
  g.fillRoundedRect(x + 2, y + 4, w, h, radius);
  // 卡片本体
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  // 顶部高光
  g.fillStyle(0xffffff, 0.35);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h * 0.42, radius * 0.8);
  // 描边
  g.lineStyle(2, line, 0.9);
  g.strokeRoundedRect(x, y, w, h, radius);
  return g;
}

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

export default class Hud {
  constructor(scene) {
    this.scene = scene;
    this.depth = 200;
    this.deaths = 0;
    this.coins = 0;
    this.build();
  }

  build() {
    const s = this.scene;

    // —— 左上：关卡名 ——
    this.leftCard = drawCard(s, 14, 12, 236, 52, { radius: 14 });
    this.leftCard.setDepth(this.depth);
    this.levelText = s.add.text(30, 24, '', {
      fontFamily: FONT, fontSize: '16px', color: '#3e2e32', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);
    this.subText = s.add.text(30, 44, '', {
      fontFamily: FONT, fontSize: '11px', color: '#8b7c78',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // —— 右上：金鱼 / 死亡 / 时间 ——
    const w = 300;
    const x = GAME_WIDTH - w - 14;
    this.rightCard = drawCard(s, x, 12, w, 52, { radius: 14 });
    this.rightCard.setDepth(this.depth);

    this.coinIcon = s.add.image(x + 24, 38, 'icon_coin').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.85);
    this.coinText = s.add.text(x + 42, 30, '0', {
      fontFamily: FONT, fontSize: '17px', color: '#3e2e32', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.skullIcon = s.add.image(x + 108, 38, 'icon_skull').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.85);
    this.deathText = s.add.text(x + 126, 30, '0', {
      fontFamily: FONT, fontSize: '17px', color: '#b63c3c', fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    this.clockIcon = s.add.image(x + 196, 38, 'icon_clock').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.85);
    this.timeText = s.add.text(x + 214, 31, '0:00.00', {
      fontFamily: FONT, fontSize: '15px', color: '#3e2e32',
    }).setScrollFactor(0).setDepth(this.depth + 1);

    // —— 左下：形态指示 ——
    this.formCard = drawCard(s, 14, GAME_HEIGHT - 58, 168, 44, { radius: 13 });
    this.formCard.setDepth(this.depth);
    this.catIcon = s.add.image(38, GAME_HEIGHT - 36, 'icon_cat').setScrollFactor(0)
      .setDepth(this.depth + 1).setScale(0.9);
    this.formText = s.add.text(58, GAME_HEIGHT - 45, '小猫', {
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
  }

  setCoins(n) {
    this.coins = n;
    this.coinText.setText(String(n));
    this.scene.tweens.add({
      targets: this.coinIcon, scale: { from: 1.25, to: 0.85 },
      duration: 180, ease: 'Back.easeOut',
    });
  }

  setDeaths(n) {
    this.deaths = n;
    this.deathText.setText(String(n));
    this.scene.tweens.add({
      targets: this.deathText, scale: { from: 1.5, to: 1 },
      duration: 240, ease: 'Back.easeOut',
    });
  }

  setTime(ms) {
    this.timeText.setText(formatTime(ms));
  }

  setForm(form, starLeftMs) {
    const big = form === 'big';
    this.formText.setText(big ? '大猫' : '小猫');
    this.formText.setColor(big ? '#d88034' : '#3e2e32');
    this.starText.setText(starLeftMs > 0 ? `无敌 ${(starLeftMs / 1000).toFixed(1)}s` : '');
  }

  /** 屏幕中部弹出的一句话提示 */
  toast(msg, ms = 1500, color = 0x3e2e32) {
    if (this.toastTimer) this.toastTimer.remove();
    const t = this.toastText;
    t.setText(msg).setAlpha(1).setY(104).setColor('#fffdfa');

    const pad = 26;
    const w = Math.max(220, t.width + pad * 2);
    const h = t.height + 22;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 104 - h / 2;
    this.toastBg.clear();
    this.toastBg.fillStyle(color, 0.86);
    this.toastBg.fillRoundedRect(x, y, w, h, 14);
    this.toastBg.setAlpha(1);

    this.scene.tweens.add({
      targets: [t], scale: { from: 0.86, to: 1 }, duration: 160, ease: 'Back.easeOut',
    });

    this.toastTimer = this.scene.time.delayedCall(ms, () => {
      this.scene.tweens.add({
        targets: [t, this.toastBg], alpha: 0, duration: 260,
      });
    });
  }

  destroy() {
    // 场景切换时 Phaser 会自动清理，这里只清掉计时器
    if (this.toastTimer) this.toastTimer.remove();
  }
}
