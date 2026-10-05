/**
 * LevelCompleteScene —— 过关结算
 * ---------------------------------------------------------------
 * 结算面板是这类游戏的"荣誉墙"：**死亡次数被摆在最显眼的位置**，
 * 并且配上一句调侃文案 —— 死得多不是丢人，是勋章。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS, LEVELS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { formatTime, deathTaunt, Save } from '../utils/save.js';
import { drawCard } from '../ui/Hud.js';
import { t } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

export default class LevelCompleteScene extends Phaser.Scene {
  constructor() {
    super('LevelComplete');
  }

  init(data) {
    this.info = data;
    this.revealStep = 0;
  }

  create() {
    const cfg = LEVELS.find((l) => l.id === this.info.levelId) || LEVELS[0];
    const d = this.info;

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_sky')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.image(GAME_WIDTH / 2, 0, 'skyGrad').setOrigin(0.5, 0);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_far')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.85);
    // 暗角：结算页也要有和游戏内一致的"镜头感"
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette');

    // 庆祝：撒金鱼
    this.time.addEvent({
      delay: 130,
      repeat: 22,
      callback: () => this.spawnConfetti(),
    });

    this.add.text(GAME_WIDTH / 2, 61, t('complete.title'), {
      fontFamily: FONT, fontSize: '52px', color: '#fffdfa', fontStyle: 'bold',
      stroke: '#3e2e32', strokeThickness: 9,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 106, t(cfg.nameKey), {
      fontFamily: FONT, fontSize: '17px', color: '#fff0da',
      stroke: '#3e2e32', strokeThickness: 4,
    }).setOrigin(0.5);

    // —— 结算卡片 ——
    const w = 620;
    const h = 300;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 140;
    const card = drawCard(this, x, y, w, h, { radius: 22, alpha: 0.97 });
    card.setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 300 });

    // 死亡次数单独放大展示
    const taunt = deathTaunt(d.deaths);
    const bigY = y + 46;
    this.add.image(x + 60, bigY, 'icon_skull').setScale(1.5);
    const deathNum = this.add.text(x + 92, bigY - 22, '0', {
      fontFamily: FONT, fontSize: '52px', color: '#b63c3c', fontStyle: 'bold',
    });
    this.add.text(x + 96 + 70, bigY + 14, t('complete.deaths'), {
      fontFamily: FONT, fontSize: '16px', color: '#8b7c78',
    });

    // 数字滚动动画：让"荣誉"更有仪式感
    this.tweens.addCounter({
      from: 0, to: d.deaths, duration: 900, ease: 'Cubic.easeOut',
      onUpdate: (tw) => deathNum.setText(String(Math.floor(tw.getValue()))),
      onComplete: () => deathNum.setText(String(d.deaths)),
    });

    this.add.text(x + 30, bigY + 48, t(taunt.key, taunt.params), {
      fontFamily: FONT, fontSize: '16px', color: this.tauntColor(taunt.tier),
      wordWrap: { width: w - 60 },
    });

    // 明细
    const rows = [
      [t('complete.time'), formatTime(d.timeMs), d.isBestTime ? t('complete.newRecord') : ''],
      [t('complete.fish'), t('complete.fishVal', { n: d.coins }), ''],
      [t('complete.score'), `${d.score}`, ''],
      [t('complete.bestTime'), formatTime(d.record.bestTimeMs), ''],
      [t('complete.fewestDeaths'), t('complete.deathsN', { n: d.record.fewestDeaths }), ''],
    ];
    let ry = y + 150;
    rows.forEach(([k, v, tag], i) => {
      const line = this.add.text(x + 30, ry, k, {
        fontFamily: FONT, fontSize: '14px', color: '#8b7c78',
      });
      const val = this.add.text(x + 200, ry, v, {
        fontFamily: FONT, fontSize: '15px', color: '#3e2e32', fontStyle: 'bold',
      });
      line.setAlpha(0); val.setAlpha(0);
      this.tweens.add({ targets: [line, val], alpha: 1, duration: 240, delay: 260 + i * 90 });
      if (tag) {
        this.add.text(x + 380, ry, tag, {
          fontFamily: FONT, fontSize: '13px', color: '#de9a22', fontStyle: 'bold',
        }).setAlpha(0.95);
      }
      ry += 26;
    });

    // —— 被哪些陷阱坑过 ——
    const traps = Object.entries(d.trapLog || {}).sort((a, b) => b[1] - a[1]);
    if (traps.length) {
      const ty = y + h + 16;
      this.add.text(GAME_WIDTH / 2, ty, t('complete.traps'), {
        fontFamily: FONT, fontSize: '13px', color: '#3e2e32', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, ty + 22,
        traps.map(([k, v]) => `${t(`trap.${k}`)} ×${v}`).join('　·　'), {
          fontFamily: FONT, fontSize: '12.5px', color: '#8b7c78',
          wordWrap: { width: GAME_WIDTH - 160 }, align: 'center',
        }).setOrigin(0.5, 0);
    }

    // —— 底部操作 ——
    const hasNext = d.levelId < 3;
    this.hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40,
      hasNext ? t('complete.hintNext') : t('complete.hintMenu'), {
        fontFamily: FONT, fontSize: '14px', color: '#fffdfa',
        stroke: '#3e2e32', strokeThickness: 4,
      }).setOrigin(0.5);
    this.tweens.add({
      targets: this.hint, alpha: { from: 1, to: 0.55 },
      duration: 900, yoyo: true, repeat: -1,
    });

    audio.play('goal');

    const kb = this.input.keyboard;
    kb.on('keydown-ENTER', () => this.next());
    kb.on('keydown-SPACE', () => this.next());
    kb.on('keydown-R', () => this.retry());
    kb.on('keydown-ESC', () => this.toMenu());
  }

  tauntColor(tier) {
    return {
      god: '#de9a22', great: '#3e8f5a', good: '#3e8f5a',
      ok: '#8b7c78', bad: '#b63c3c', awful: '#b63c3c', legend: '#de9a22',
    }[tier] || '#3e2e32';
  }

  spawnConfetti() {
    const s = this.add.sprite(Phaser.Math.Between(60, GAME_WIDTH - 60), -20,
      'item_goldfish', 0).setScale(Phaser.Math.FloatBetween(0.6, 1.2));
    s.play('goldfish-swim');
    this.tweens.add({
      targets: s,
      y: GAME_HEIGHT + 30,
      x: s.x + Phaser.Math.Between(-70, 70),
      angle: Phaser.Math.Between(-320, 320),
      duration: Phaser.Math.Between(1700, 3000),
      ease: 'Sine.easeIn',
      onComplete: () => s.destroy(),
    });
  }

  next() {
    audio.play('select');
    if (this.info.levelId < 3) {
      this.scene.start('Level', { levelId: this.info.levelId + 1 });
    } else {
      this.toMenu();
    }
  }

  retry() {
    audio.play('select');
    this.scene.start('Level', { levelId: this.info.levelId });
  }

  toMenu() {
    audio.play('select');
    this.scene.start('Menu');
  }
}
