/**
 * LevelCompleteScene —— 工作室级过关结算与荣誉榜
 * ---------------------------------------------------------------
 * 结算面板是这类游戏的"荣誉墙"：**死亡次数被摆在最显眼的位置**，
 * 并且配上一句调侃文案 —— 死得多不是丢人，是勋章。
 */
import { GAME_WIDTH, GAME_HEIGHT, LEVELS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { formatTime, deathTaunt } from '../utils/save.js';
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

    const skyKey = this.textures.exists('bg_sky_1') ? 'bg_sky_1' : 'bg_sky';
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, skyKey)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.image(GAME_WIDTH / 2, 0, 'skyGrad').setOrigin(0.5, 0);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_far')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.9);
    if (this.textures.exists('sunbeams')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'sunbeams').setAlpha(0.8);
    }
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_mid')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.75);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette');

    // 庆祝：撒金鱼与星星彩带
    this.time.addEvent({
      delay: 120,
      repeat: 24,
      callback: () => this.spawnConfetti(),
    });

    // 立体通关标题
    const cx = GAME_WIDTH / 2;
    this.add.text(cx + 3, 52, t('complete.title'), {
      fontFamily: FONT, fontSize: '48px', color: '#1d1216', fontStyle: 'bold',
      stroke: '#1d1216', strokeThickness: 11,
    }).setOrigin(0.5).setAlpha(0.5);

    this.add.text(cx, 49, t('complete.title'), {
      fontFamily: FONT, fontSize: '48px', color: '#fffdfa', fontStyle: 'bold',
      stroke: '#3a2429', strokeThickness: 9,
    }).setOrigin(0.5);

    const subBg = this.add.graphics();
    subBg.fillStyle(0x2d1f24, 0.76);
    subBg.fillRoundedRect(cx - 140, 82, 280, 26, 13);
    subBg.lineStyle(1.5, 0xffd26a, 0.65);
    subBg.strokeRoundedRect(cx - 140, 82, 280, 26, 13);

    this.add.text(cx, 95, t(cfg.nameKey), {
      fontFamily: FONT, fontSize: '14px', color: '#ffe49c', fontStyle: 'bold',
    }).setOrigin(0.5);

    // —— 结算主卡片 ——
    const w = 650;
    const h = 304;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 122;
    const card = drawCard(this, x, y, w, h, { radius: 22, alpha: 0.98, selected: true });
    card.setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 280 });

    // 内部排版底衬（上方荣誉横幅 + 下方斑马纹数据行）
    const innerG = this.add.graphics();
    innerG.fillStyle(0xfff1e4, 1);
    innerG.fillRoundedRect(x + 22, y + 18, w - 44, 112, 14);
    innerG.lineStyle(1.5, 0xead4be, 1);
    innerG.strokeRoundedRect(x + 22, y + 18, w - 44, 112, 14);

    // 胜利小猫立绘站在荣誉横幅右侧
    const winCat = this.add.sprite(x + w - 68, y + 118, 'cat_big', 0)
      .setOrigin(0.5, 1).setScale(1.38);
    if (this.anims.exists('big-idle')) winCat.play('big-idle');

    // 死亡次数勋章区
    const taunt = deathTaunt(d.deaths);
    const bigY = y + 52;
    this.add.image(x + 62, bigY, 'icon_skull').setScale(1.55);
    const deathNum = this.add.text(x + 96, bigY - 26, '0', {
      fontFamily: FONT, fontSize: '50px', color: '#bf3b3b', fontStyle: 'bold',
    });
    this.add.text(x + 172, bigY + 8, t('complete.deaths'), {
      fontFamily: FONT, fontSize: '15px', color: '#7e6c68', fontStyle: 'bold',
    });

    // 数字滚动动画
    this.tweens.addCounter({
      from: 0, to: d.deaths, duration: 850, ease: 'Cubic.easeOut',
      onUpdate: (tw) => deathNum.setText(String(Math.floor(tw.getValue()))),
      onComplete: () => deathNum.setText(String(d.deaths)),
    });

    this.add.text(x + 38, bigY + 42, t(taunt.key, taunt.params), {
      fontFamily: FONT, fontSize: '15.5px', color: this.tauntColor(taunt.tier),
      fontStyle: 'bold',
      wordWrap: { width: w - 160 },
    });

    // 明细表格（带柔和交替底纹）
    const rows = [
      [t('complete.time'), formatTime(d.timeMs), d.isBestTime ? t('complete.newRecord') : ''],
      [t('complete.fish'), t('complete.fishVal', { n: d.coins }), ''],
      [t('complete.score'), `${d.score}`, ''],
      [t('complete.bestTime'), formatTime(d.record.bestTimeMs), ''],
      [t('complete.fewestDeaths'), t('complete.deathsN', { n: d.record.fewestDeaths }), ''],
    ];
    let ry = y + 144;
    rows.forEach(([k, v, tag], i) => {
      if (i % 2 === 0) {
        innerG.fillStyle(0xf7f1ea, 0.9);
        innerG.fillRoundedRect(x + 22, ry - 4, w - 44, 26, 7);
      }
      const line = this.add.text(x + 36, ry, k, {
        fontFamily: FONT, fontSize: '14px', color: '#7e6c68', fontStyle: 'bold',
      });
      const val = this.add.text(x + 230, ry, v, {
        fontFamily: FONT, fontSize: '15px', color: '#36262a', fontStyle: 'bold',
      });
      line.setAlpha(0); val.setAlpha(0);
      this.tweens.add({ targets: [line, val], alpha: 1, duration: 240, delay: 220 + i * 80 });
      if (tag) {
        this.add.text(x + 410, ry, tag, {
          fontFamily: FONT, fontSize: '13px', color: '#d88218', fontStyle: 'bold',
        }).setAlpha(0.98);
      }
      ry += 28;
    });

    // —— 陷阱黑名单胶囊条 ——
    const traps = Object.entries(d.trapLog || {}).sort((a, b) => b[1] - a[1]);
    if (traps.length) {
      const ty = y + h + 12;
      const trapG = this.add.graphics();
      trapG.fillStyle(0x24181c, 0.76);
      trapG.fillRoundedRect(cx - 325, ty, 650, 48, 14);
      trapG.lineStyle(1.5, 0xe89090, 0.45);
      trapG.strokeRoundedRect(cx - 325, ty, 650, 48, 14);

      this.add.text(cx, ty + 13, t('complete.traps'), {
        fontFamily: FONT, fontSize: '12px', color: '#ffb6b6', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(cx, ty + 33,
        traps.map(([k, v]) => `${t(`trap.${k}`)} ×${v}`).join('   ·   '), {
          fontFamily: FONT, fontSize: '12.5px', color: '#fff5ee',
          wordWrap: { width: 620 }, align: 'center',
        }).setOrigin(0.5);
    }

    // —— 底部操作栏（支持键盘与鼠标点击）——
    const hasNext = d.levelId < 3;
    const footG = this.add.graphics();
    footG.fillStyle(0x21161a, 0.82);
    footG.fillRoundedRect(cx - 260, GAME_HEIGHT - 46, 520, 34, 17);
    footG.lineStyle(1.5, 0xffd26a, 0.65);
    footG.strokeRoundedRect(cx - 260, GAME_HEIGHT - 46, 520, 34, 17);

    this.hint = this.add.text(cx, GAME_HEIGHT - 29,
      hasNext ? t('complete.hintNext') : t('complete.hintMenu'), {
        fontFamily: FONT, fontSize: '14px', color: '#fffdfa', fontStyle: 'bold',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.hint.on('pointerdown', () => this.next());

    this.tweens.add({
      targets: this.hint, alpha: { from: 1, to: 0.65 },
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
      god: '#d68818', great: '#388a52', good: '#388a52',
      ok: '#786662', bad: '#bf3b3b', awful: '#bf3b3b', legend: '#d68818',
    }[tier] || '#36262a';
  }

  spawnConfetti() {
    const isStar = Math.random() < 0.35;
    const s = this.add.sprite(
      Phaser.Math.Between(60, GAME_WIDTH - 60),
      -20,
      isStar ? 'item_star' : 'item_goldfish',
      0
    ).setScale(Phaser.Math.FloatBetween(0.65, 1.2));
    s.play(isStar ? 'star-spin' : 'goldfish-swim');
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
