/**
 * MenuScene —— 主菜单
 * ---------------------------------------------------------------
 * 三层视差滚动背景 + 圆角卡片菜单。纯键盘操作（↑↓ 选择，Enter/Space 确认，Esc 返回）。
 * L 键或菜单里的 Language 行可以切换中英文，切换后场景重启、整菜单重建。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS, LEVELS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { Save, formatTime } from '../utils/save.js';
import { drawCard } from '../ui/Hud.js';
import { t, toggleLang } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

const MENU = {
  width: 470,
  height: 50,
  pitch: 56,
  startY: 240,
};

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.mode = 'main';      // 'main' | 'levels' | 'help' | 'confirm'
    this.index = 0;
    this.rows = [];
    this.menuObjects = [];

    this.buildBackground();
    this.buildTitle();
    this.buildFooter();
    this.buildMenu();
    this.bindKeys();

    audio.startMusic();

    this.cameras.main.fadeIn(320, 43, 32, 36);
  }

  // -------------------------------------------------------------------------
  buildBackground() {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_sky')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    // 顶部渐变：给平涂的蓝天一点纵深
    this.add.image(GAME_WIDTH / 2, 0, 'skyGrad').setOrigin(0.5, 0);

    this.far = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'bg_far')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.9);
    this.mid = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'bg_mid')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // 几只飘浮的云，增加"这游戏很无害"的错觉
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const c = this.add.image(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(50, 220),
        i % 3 === 0 ? 'sun_soft' : 'cloud_soft'
      ).setAlpha(0.85).setScale(Phaser.Math.FloatBetween(0.5, 0.9));
      c.speed = Phaser.Math.FloatBetween(6, 18);
      this.clouds.push(c);
    }

    // 底部草地色带
    const g = this.add.graphics();
    g.fillStyle(0x68bc6a, 1);
    g.fillRect(0, GAME_HEIGHT - 92, GAME_WIDTH, 92);
    g.fillStyle(0x54a458, 1);
    g.fillRect(0, GAME_HEIGHT - 92, GAME_WIDTH, 10);
    g.fillStyle(0x8ed48c, 0.7);
    for (let x = 0; x < GAME_WIDTH; x += 24) {
      g.fillTriangle(x, GAME_HEIGHT - 92, x + 12, GAME_HEIGHT - 104, x + 24, GAME_HEIGHT - 92);
    }
    g.fillStyle(0x2b2024, 0.10);
    g.fillRect(0, GAME_HEIGHT - 92, GAME_WIDTH, 92);

    // 暗角：四周轻轻压暗，视线更聚焦
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette');
  }

  buildTitle() {
    // 两只主角猫站在草地上（大猫 + 小猫）。
    // 注意 x 别放在菜单按钮正下方，否则会被按钮压住。
    this.hero = this.add.sprite(GAME_WIDTH * 0.155, GAME_HEIGHT - 90, 'cat_big', 0)
      .setOrigin(0.5, 1).setScale(1.6);
    this.hero.play('big-idle');
    this.tweens.add({
      targets: this.hero, y: GAME_HEIGHT - 94, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.heroSmall = this.add.sprite(GAME_WIDTH * 0.155 + 74, GAME_HEIGHT - 90, 'cat_small', 0)
      .setOrigin(0.5, 1).setScale(1.25);
    this.heroSmall.play('small-idle');
    this.tweens.add({
      targets: this.heroSmall, y: GAME_HEIGHT - 93, duration: 760, delay: 240,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // 标题的柔和投影：同一文案错位重画一层深色，再叠主体
    const title = t('game.title');
    this.add.text(GAME_WIDTH / 2 + 3, 91, title, {
      fontFamily: FONT, fontSize: '58px', color: '#2b2024', fontStyle: 'bold',
      stroke: '#2b2024', strokeThickness: 8,
    }).setOrigin(0.5).setAlpha(0.45);

    this.add.text(GAME_WIDTH / 2, 88, title, {
      fontFamily: FONT, fontSize: '58px', color: '#fffdfa', fontStyle: 'bold',
      stroke: '#3e2e32', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 140, t('game.titleAlt'), {
      fontFamily: 'Helvetica Neue, Arial, sans-serif', fontSize: '17px',
      color: '#fff0da', letterSpacing: 4, stroke: '#3e2e32', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 176, t('game.tagline'), {
      fontFamily: FONT, fontSize: '14px', color: '#fff0da',
      stroke: '#3e2e32', strokeThickness: 3,
    }).setOrigin(0.5);
  }

  buildFooter() {
    const data = Save.all();
    this.add.text(20, GAME_HEIGHT - 30, t('footer.stats', {
      n: data.totalDeaths, fish: data.totalFish,
    }), {
      fontFamily: FONT, fontSize: '13px', color: '#fffdfa',
      stroke: '#3e2e32', strokeThickness: 3,
    });

    const muted = audio.muted;
    this.muteText = this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 30,
      muted ? t('footer.soundOff') : t('footer.soundOn'), {
        fontFamily: FONT, fontSize: '13px', color: '#fffdfa',
        stroke: '#3e2e32', strokeThickness: 3,
      }).setOrigin(1, 0);

    this.add.text(GAME_WIDTH - 20, 18, t('footer.keys'), {
      fontFamily: FONT, fontSize: '12px', color: '#fffdfa',
      stroke: '#3e2e32', strokeThickness: 3,
    }).setOrigin(1, 0);
  }

  // -------------------------------------------------------------------------
  buildMenu() {
    this.clearMenu();

    const data = Save.all();
    const unlocked = Math.min(3, data.unlocked || 1);

    if (this.mode === 'main') {
      this.rows = [
        { label: t('menu.start', { n: unlocked }), action: () => this.startLevel(unlocked) },
        { label: t('menu.levels'), action: () => this.setMode('levels') },
        { label: t('menu.help'), action: () => this.setMode('help') },
        { label: t('menu.language'), action: () => this.switchLang() },
        { label: t('menu.clear'), action: () => this.setMode('confirm') },
      ];
    } else if (this.mode === 'levels') {
      this.rows = LEVELS.map((lv) => {
        const rec = Save.level(lv.id);
        const locked = lv.id > unlocked;
        const detail = locked
          ? t('menu.locked')
          : (rec && rec.bestTimeMs !== null
              ? t('menu.best', { time: formatTime(rec.bestTimeMs), n: rec.fewestDeaths })
              : t('menu.notCleared'));
        return {
          label: t(lv.nameKey), detail, locked,
          action: () => !locked && this.startLevel(lv.id),
        };
      });
      this.rows.push({ label: t('menu.back'), action: () => this.setMode('main') });
    } else if (this.mode === 'confirm') {
      this.rows = [
        { label: t('menu.confirmClear'), danger: true, action: () => {
          Save.reset();
          audio.play('trap');
          this.setMode('main');
          this.buildFooterRefresh();
        } },
        { label: t('menu.cancel'), action: () => this.setMode('main') },
      ];
    }

    this.index = 0;
    this.renderRows();
  }

  switchLang() {
    audio.play('select');
    toggleLang();
    // 整个场景重启一次，让标题/页脚/菜单全部按新语言重建
    this.scene.restart();
  }

  buildFooterRefresh() {
    // 简单起见：重开本场景即可刷新底部的累计统计
    this.scene.restart();
  }

  renderRows() {
    if (this.mode === 'help') {
      this.renderHelp();
      return;
    }

    const { width: w, height: h, pitch, startY } = MENU;
    this.rows.forEach((row, i) => {
      const x = GAME_WIDTH / 2 - w / 2;
      const y = startY + i * pitch;

      const selected = i === this.index;
      const g = drawCard(this, x, y, w, h, {
        radius: 15,
        fill: row.danger ? 0xfff0f0 : (selected ? 0xfff4e2 : 0xfffdfa),
        // 不透明度别太低：背后是山和树，太透会让按钮上的字很难读
        alpha: selected ? 0.99 : 0.95,
        line: selected ? 0xffc842 : COLORS.line,
      });
      g.setDepth(10);

      const label = this.add.text(x + 26, y + (row.detail ? 8 : h / 2), row.label, {
        fontFamily: FONT, fontSize: '18px',
        color: row.locked ? '#b9aca6' : (row.danger ? '#b63c3c' : '#3e2e32'),
        fontStyle: selected ? 'bold' : 'normal',
      }).setDepth(11);
      if (row.detail) label.setOrigin(0, 0);
      else label.setOrigin(0, 0.5);

      if (row.detail) {
        this.add.text(x + 26, y + 31, row.detail, {
          fontFamily: FONT, fontSize: '11.5px', color: '#8b7c78',
        }).setDepth(11);
      }

      if (selected) {
        const arrow = this.add.text(x - 26, y + h / 2, '🐾', {
          fontFamily: FONT, fontSize: '18px',
        }).setOrigin(0.5).setDepth(11);
        this.tweens.add({
          targets: arrow, x: x - 18, duration: 520, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.menuObjects.push(arrow);
      }
      this.menuObjects.push(g, label);
    });
  }

  renderHelp() {
    const w = 740;
    const h = 390;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 112;
    const g = drawCard(this, x, y, w, h, { radius: 20, alpha: 0.97 });
    g.setDepth(10);
    this.menuObjects.push(g);

    const heads = [t('help.controls'), t('help.rules'), t('help.gag')];
    const lines = [
      [t('help.move'), ''],
      [t('help.jump'), t('help.jumpNote')],
      [t('help.crouch'), t('help.crouchNote')],
      [t('help.run'), t('help.runNote')],
      [t('help.pause'), t('help.pauseNote')],
      [t('help.retry'), t('help.retryNote')],
      ['', ''],
      [t('help.ruleStomp'), t('help.ruleSide')],
      [t('help.ruleCan'), t('help.ruleCanNote')],
      [t('help.ruleStar'), t('help.ruleStarNote')],
      [t('help.ruleQuestion'), t('help.ruleBrick')],
      ['', ''],
      [t('help.gag1'), t('help.gag1Note')],
      [t('help.gag2'), t('help.gag2Note')],
    ];

    let ty = y + 24;
    let lastHead = false;
    for (const [a, b] of lines) {
      if (!a && !b) { ty += 10; continue; }
      const isHead = heads.includes(a) && !b && !lastHead;
      lastHead = isHead;
      this.menuObjects.push(this.add.text(x + 30, ty, a, {
        fontFamily: FONT, fontSize: isHead ? '16px' : '14px',
        color: isHead ? '#d88034' : '#3e2e32',
        fontStyle: isHead ? 'bold' : 'normal',
      }).setDepth(11));
      if (b) {
        this.menuObjects.push(this.add.text(x + 392, ty, b, {
          fontFamily: FONT, fontSize: '13px', color: '#8b7c78',
        }).setDepth(11));
      }
      ty += isHead ? 28 : 22;
    }

    this.menuObjects.push(this.add.text(GAME_WIDTH / 2, y + h - 22, t('help.back'), {
      fontFamily: FONT, fontSize: '13px', color: '#8b7c78',
    }).setOrigin(0.5).setDepth(11));
  }

  clearMenu() {
    if (this.menuObjects) this.menuObjects.forEach((o) => o.destroy && o.destroy());
    this.menuObjects = [];
  }

  setMode(mode) {
    this.mode = mode;
    this.index = 0;
    audio.play('select');
    this.buildMenu();
  }

  // -------------------------------------------------------------------------
  bindKeys() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', w: 'W', s: 'S',
      enter: 'ENTER', space: 'SPACE', esc: 'ESC', m: 'M', l: 'L',
      a: 'A', d: 'D',
    });
    kb.addCapture(['SPACE', 'UP', 'DOWN', 'ENTER']);

    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ESC', () => this.back());
    kb.on('keydown-M', () => this.toggleMute());
    kb.on('keydown-L', () => this.switchLang());
  }

  move(d) {
    if (this.mode === 'help') return;
    if (!this.rows.length) return;
    this.index = (this.index + d + this.rows.length) % this.rows.length;
    audio.play('select');
    this.clearMenu();
    this.renderRows();
  }

  confirm() {
    audio.unlock();
    if (this.mode === 'help') return this.back();
    const row = this.rows[this.index];
    if (row && row.action) row.action();
  }

  back() {
    if (this.mode === 'main') return;
    this.setMode('main');
  }

  toggleMute() {
    const m = audio.toggleMute();
    Save.setMuted(m);
    this.muteText.setText(m ? t('footer.soundOff') : t('footer.soundOn'));
  }

  startLevel(id) {
    audio.play('goal');
    this.cameras.main.fadeOut(260, 43, 32, 36);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Level', { levelId: id });
    });
  }

  // -------------------------------------------------------------------------
  update(time, delta) {
    const dt = delta / 1000;
    this.far.tilePositionX += 6 * dt;
    this.mid.tilePositionX += 16 * dt;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > GAME_WIDTH + 100) c.x = -100;
    }
  }
}
