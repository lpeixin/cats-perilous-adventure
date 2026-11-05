/**
 * MenuScene —— 工作室级主菜单场景
 * ---------------------------------------------------------------
 * 含：三层视差背景 + 丁达尔体积光 + 实景草地舞台（木栅栏、花丛、鲤鱼旗）+
 * 立体徽章标题 + 支持键盘（↑↓/WS + Enter/Space/Esc）与鼠标悬停点击的立体按钮菜单。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS, LEVELS, TILE } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { Save, formatTime } from '../utils/save.js';
import { drawCard, drawBadge, drawPill } from '../ui/Hud.js';
import { t, toggleLang } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

const MENU = {
  width: 460,
  height: 50,
  pitch: 56,
  startY: 214,
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

    this.cameras.main.fadeIn(320, 36, 26, 30);
  }

  // -------------------------------------------------------------------------
  // 1. 实景舞台背景（天空 + 远山 + 丁达尔光束 + 森林 + 前景草地生态舞台）
  // -------------------------------------------------------------------------
  buildBackground() {
    const skyKey = this.textures.exists('bg_sky_1') ? 'bg_sky_1' : 'bg_sky';
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, skyKey)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.image(GAME_WIDTH / 2, 0, 'skyGrad').setOrigin(0.5, 0);

    this.far = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'bg_far')
      .setTileScale(0.5, 0.5).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.95);

    if (this.textures.exists('sunbeams')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'sunbeams')
        .setAlpha(0.82);
    }

    this.mid = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'bg_mid')
      .setTileScale(0.5, 0.5).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // 飘浮的云朵与暖阳
    this.clouds = [];
    const cloudConfigs = [
      { x: 130, y: 84, key: 'sun_soft', scale: 0.86, speed: 5 },
      { x: 310, y: 112, key: 'cloud_soft', scale: 0.72, speed: 12 },
      { x: 690, y: 78, key: 'cloud_soft', scale: 0.85, speed: 10 },
      { x: 850, y: 145, key: 'cloud_soft', scale: 0.62, speed: 15 },
    ];
    for (const cfg of cloudConfigs) {
      const c = this.add.image(cfg.x, cfg.y, cfg.key)
        .setAlpha(0.92).setScale(cfg.scale);
      c.speed = cfg.speed;
      this.clouds.push(c);
    }

    // 底部实景草地舞台（使用真实 ground_top 与 ground_fill 瓦片铺陈）
    const groundY = GAME_HEIGHT - 84;
    for (let x = 0; x < GAME_WIDTH + TILE; x += TILE) {
      this.add.image(x + TILE / 2, groundY + TILE / 2, 'ground_top').setDepth(2);
      this.add.image(x + TILE / 2, groundY + TILE + TILE / 2, 'ground_fill').setDepth(2);
    }

    // 左右两侧舞台生态布景（不遮挡中央菜单）
    if (this.textures.exists('prop_fence')) {
      this.add.image(86, groundY + 4, 'prop_fence').setOrigin(0.5, 1).setDepth(1.5);
      this.add.image(874, groundY + 4, 'prop_fence').setOrigin(0.5, 1).setDepth(1.5);
    }
    if (this.textures.exists('prop_bush')) {
      this.add.image(28, groundY + 5, 'prop_bush').setOrigin(0.5, 1).setDepth(1.6);
      this.add.image(765, groundY + 5, 'prop_bush').setOrigin(0.5, 1).setDepth(1.6);
    }
    if (this.textures.exists('prop_flowers_1')) {
      this.add.image(68, groundY + 3, 'prop_flowers_1').setOrigin(0.5, 1).setDepth(2.5);
      this.add.image(796, groundY + 3, 'prop_flowers_2').setOrigin(0.5, 1).setDepth(2.5);
      this.add.image(918, groundY + 3, 'prop_flowers_1').setOrigin(0.5, 1).setDepth(2.5);
    }
    if (this.textures.exists('prop_grass')) {
      this.add.image(118, groundY + 3, 'prop_grass').setOrigin(0.5, 1).setDepth(2.5);
      this.add.image(730, groundY + 3, 'prop_grass').setOrigin(0.5, 1).setDepth(2.5);
    }

    // 右侧舞台：终点鲤鱼旗杆与漂浮金鱼币，与左侧主角遥相呼应
    this.add.image(848, groundY + 4, 'goal_pole')
      .setOrigin(0.5, 1).setScale(0.92).setDepth(1.8);
    const flag = this.add.sprite(848 + 24, groundY - 132, 'goal_flagfish', 0)
      .setScale(0.92).setDepth(1.9);
    if (this.anims.exists('flagfish-wave')) flag.play('flagfish-wave');

    const coin = this.add.sprite(776, groundY - 58, 'item_goldfish', 0).setDepth(2.5);
    if (this.anims.exists('goldfish-swim')) coin.play('goldfish-swim');
    this.tweens.add({
      targets: coin, y: groundY - 68, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // 暗角：四周轻轻压暗，视线更聚焦
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette').setDepth(4);
  }

  // -------------------------------------------------------------------------
  // 2. 角色与工作室级立体徽章标题
  // -------------------------------------------------------------------------
  buildTitle() {
    const groundY = GAME_HEIGHT - 82;

    // 左侧舞台：大猫与小猫整装待发
    this.hero = this.add.sprite(158, groundY, 'cat_big', 0)
      .setOrigin(0.5, 1).setScale(1.32).setDepth(3);
    this.hero.play('big-idle');
    this.tweens.add({
      targets: this.hero, y: groundY - 4, duration: 920,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.heroSmall = this.add.sprite(222, groundY, 'cat_small', 0)
      .setOrigin(0.5, 1).setScale(1.12).setDepth(3);
    this.heroSmall.play('small-idle');
    this.tweens.add({
      targets: this.heroSmall, y: groundY - 3, duration: 780, delay: 220,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const cx = GAME_WIDTH / 2;

    // 副标题胶囊底托（3× 超清抗锯齿矢量绘制）
    drawPill(this, cx - 210, 118, 420, 28, {
      radius: 14, fill: 0x2d1f24, alpha: 0.80, line: 0xffd26a, lineAlpha: 0.78, lineWidth: 1.5,
    }).setDepth(3);

    // 主标题（三层立体字：深色远影 → 暖金描边底 → 亮白主体，英文自动字号自适应）
    const title = t('game.title');
    const titleSize = title.length > 10 ? '45px' : '56px';
    this.add.text(cx + 3, 78, title, {
      fontFamily: FONT, fontSize: titleSize, color: '#1d1216', fontStyle: 'bold',
      stroke: '#1d1216', strokeThickness: 12,
    }).setOrigin(0.5).setAlpha(0.55).setDepth(3);

    this.add.text(cx, 74, title, {
      fontFamily: FONT, fontSize: titleSize, color: '#fffdf8', fontStyle: 'bold',
      stroke: '#3a2429', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(3);

    this.add.text(cx, 132, t('game.titleAlt'), {
      fontFamily: 'Helvetica Neue, Arial, sans-serif', fontSize: '14px',
      color: '#ffe29c', letterSpacing: 4, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    this.add.text(cx, 168, t('game.tagline'), {
      fontFamily: FONT, fontSize: '13.5px', color: '#fff8ec', fontStyle: 'bold',
      stroke: '#2d1e22', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(3);
  }

  // -------------------------------------------------------------------------
  // 3. 页脚与顶部状态胶囊（宽度随中英双语自适应）
  // -------------------------------------------------------------------------
  buildFooter() {
    const data = Save.all();

    // 左下：累计统计胶囊
    const statsTxt = this.add.text(28, GAME_HEIGHT - 25, t('footer.stats', {
      n: data.totalDeaths, fish: data.totalFish,
    }), {
      fontFamily: FONT, fontSize: '12.5px', color: '#fff8ee', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(6);
    const statsW = Math.ceil(statsTxt.width) + 28;
    drawPill(this, 14, GAME_HEIGHT - 40, statsW, 30, {
      radius: 15, fill: 0x21161a, alpha: 0.82, line: 0xffe4b8, lineAlpha: 0.38, lineWidth: 1.5,
    }).setDepth(5);

    // 右下：音效开关胶囊（支持点击切换）
    const muted = audio.muted;
    this.muteText = this.add.text(GAME_WIDTH - 28, GAME_HEIGHT - 25,
      muted ? t('footer.soundOff') : t('footer.soundOn'), {
        fontFamily: FONT, fontSize: '12.5px', color: '#ffe49c', fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(6)
      .setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', () => this.toggleMute());
    const muteW = Math.max(146, Math.ceil(this.muteText.width) + 28);
    drawPill(this, GAME_WIDTH - 14 - muteW, GAME_HEIGHT - 40, muteW, 30, {
      radius: 15, fill: 0x21161a, alpha: 0.82, line: 0xffe4b8, lineAlpha: 0.38, lineWidth: 1.5,
    }).setDepth(5);

    // 右上：按键提示胶囊
    const keysTxt = this.add.text(GAME_WIDTH - 26, 25, t('footer.keys'), {
      fontFamily: FONT, fontSize: '11.5px', color: '#fff5e6',
    }).setOrigin(1, 0.5).setDepth(6);
    const keysW = Math.ceil(keysTxt.width) + 24;
    drawPill(this, GAME_WIDTH - 14 - keysW, 12, keysW, 26, {
      radius: 13, fill: 0x21161a, alpha: 0.65, line: 0xffe4b8, lineAlpha: 0.25, lineWidth: 1.2,
    }).setDepth(5);
  }

  // -------------------------------------------------------------------------
  // 4. 菜单数据构建与渲染
  // -------------------------------------------------------------------------
  buildMenu() {
    this.clearMenu();

    const data = Save.all();
    const unlocked = Math.min(3, data.unlocked || 1);

    if (this.mode === 'main') {
      this.rows = [
        {
          icon: '▶', badgeColor: 0x4ca858,
          label: t('menu.start', { n: unlocked }),
          hint: 'ENTER',
          action: () => this.startLevel(unlocked),
        },
        {
          icon: '★', badgeColor: 0xe68a2e,
          label: t('menu.levels'),
          hint: `${unlocked}/3`,
          action: () => this.setMode('levels'),
        },
        {
          icon: '?', badgeColor: 0x4e8cc8,
          label: t('menu.help'),
          hint: 'INFO',
          action: () => this.setMode('help'),
        },
        {
          icon: '文', badgeColor: 0x8862b8,
          label: t('menu.language'),
          hint: 'L',
          action: () => this.switchLang(),
        },
        {
          icon: '↺', badgeColor: 0xc45858,
          label: t('menu.clear'),
          hint: '',
          action: () => this.setMode('confirm'),
        },
      ];
    } else if (this.mode === 'levels') {
      const stageColors = { 1: 0x4ca858, 2: 0xe68a2e, 3: 0xc8463c };
      this.rows = LEVELS.map((lv) => {
        const rec = Save.level(lv.id);
        const locked = lv.id > unlocked;
        const detail = locked
          ? t('menu.locked')
          : (rec && rec.bestTimeMs !== null
              ? t('menu.best', { time: formatTime(rec.bestTimeMs), n: rec.fewestDeaths })
              : t('menu.notCleared'));
        return {
          icon: locked ? '🔒' : `S${lv.id}`,
          badgeColor: locked ? 0x9c908c : stageColors[lv.id],
          label: t(lv.nameKey),
          detail,
          locked,
          hint: locked ? '' : 'GO →',
          action: () => !locked && this.startLevel(lv.id),
        };
      });
      this.rows.push({
        icon: '←', badgeColor: 0x7a6a66,
        label: t('menu.back'),
        hint: 'ESC',
        action: () => this.setMode('main'),
      });
    } else if (this.mode === 'confirm') {
      this.rows = [
        {
          icon: '!', badgeColor: 0xc84242,
          label: t('menu.confirmClear'),
          danger: true,
          hint: 'ENTER',
          action: () => {
            Save.reset();
            audio.play('trap');
            this.setMode('main');
            this.buildFooterRefresh();
          },
        },
        {
          icon: '←', badgeColor: 0x7a6a66,
          label: t('menu.cancel'),
          hint: 'ESC',
          action: () => this.setMode('main'),
        },
      ];
    }

    this.index = 0;
    this.renderRows();
  }

  switchLang() {
    audio.play('select');
    toggleLang();
    this.scene.restart();
  }

  buildFooterRefresh() {
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
        selected,
        danger: row.danger,
        fill: row.danger ? 0xfff0f0 : (selected ? 0xfff5e0 : 0xfffdfa),
        alpha: selected ? 0.99 : 0.95,
        line: selected ? 0xf2a62c : COLORS.line,
      });
      g.setDepth(10);

      // 左侧彩色圆角图标徽章（3× 超清矢量抗锯齿）
      const badgeG = drawBadge(this, x + 12, y + 9, 32, 32, {
        radius: 9,
        fill: row.badgeColor || 0xe68a2e,
        alpha: row.locked ? 0.55 : 1,
        lipAlpha: 0.18,
      }).setDepth(11);

      const iconTxt = this.add.text(x + 28, y + 25, row.icon || '•', {
        fontFamily: FONT, fontSize: '14px', color: '#fffdfa', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(12);

      // 主文案
      const label = this.add.text(x + 56, y + (row.detail ? 8 : h / 2), row.label, {
        fontFamily: FONT, fontSize: '17.5px',
        color: row.locked ? '#b0a29c' : (row.danger ? '#bf3b3b' : '#36262a'),
        fontStyle: selected ? 'bold' : 'normal',
      }).setDepth(11);
      if (row.detail) label.setOrigin(0, 0);
      else label.setOrigin(0, 0.5);

      if (row.detail) {
        const det = this.add.text(x + 56, y + 30, row.detail, {
          fontFamily: FONT, fontSize: '11.5px', color: '#82706c',
        }).setDepth(11);
        this.menuObjects.push(det);
      }

      // 右侧快捷键胶囊提示
      if (row.hint) {
        const hintTxt = this.add.text(x + w - 18, y + h / 2, row.hint, {
          fontFamily: 'Helvetica Neue, Arial, sans-serif',
          fontSize: '11.5px',
          color: selected ? '#d47c1c' : '#a89892',
          fontStyle: 'bold',
        }).setOrigin(1, 0.5).setDepth(11);
        this.menuObjects.push(hintTxt);
      }

      // 鼠标交互热区（悬停高亮 + 点击执行）
      const hitZone = this.add.zone(x + w / 2, y + h / 2, w, h)
        .setDepth(15)
        .setInteractive({ useHandCursor: !row.locked });
      hitZone.on('pointerover', () => {
        if (this.index !== i) {
          this.index = i;
          audio.play('select');
          this.clearMenu();
          this.renderRows();
        }
      });
      hitZone.on('pointerdown', () => {
        this.index = i;
        this.confirm();
      });

      if (selected) {
        const arrow = this.add.text(x - 24, y + h / 2, '🐾', {
          fontFamily: FONT, fontSize: '18px',
        }).setOrigin(0.5).setDepth(12);
        this.tweens.add({
          targets: arrow, x: x - 16, duration: 500, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.menuObjects.push(arrow);
      }

      this.menuObjects.push(g, badgeG, iconTxt, label, hitZone);
    });
  }

  renderHelp() {
    const w = 760;
    const h = 398;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 98;
    const g = drawCard(this, x, y, w, h, { radius: 22, alpha: 0.98, selected: true });
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

    let ty = y + 22;
    let lastHead = false;
    for (const [a, b] of lines) {
      if (!a && !b) { ty += 8; continue; }
      const isHead = heads.includes(a) && !b && !lastHead;
      lastHead = isHead;

      if (isHead) {
        const hg = drawPill(this, x + 24, ty - 2, w - 48, 24, {
          radius: 7, fill: 0xfff0d4, alpha: 1,
        }).setDepth(10.5);
        this.menuObjects.push(hg);
      }

      this.menuObjects.push(this.add.text(x + 34, ty, a, {
        fontFamily: FONT, fontSize: isHead ? '15px' : '13.5px',
        color: isHead ? '#d2721e' : '#36262a',
        fontStyle: isHead ? 'bold' : 'normal',
      }).setDepth(11));

      if (b) {
        this.menuObjects.push(this.add.text(x + 398, ty, b, {
          fontFamily: FONT, fontSize: '13px', color: '#7e6c68',
        }).setDepth(11));
      }
      ty += isHead ? 28 : 22;
    }

    const backBtn = this.add.text(GAME_WIDTH / 2, y + h - 22, t('help.back'), {
      fontFamily: FONT, fontSize: '13.5px', color: '#d2721e', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.back());
    this.menuObjects.push(backBtn);
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
  // 5. 键盘控制
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
    this.cameras.main.fadeOut(260, 36, 26, 30);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Level', { levelId: id });
    });
  }

  // -------------------------------------------------------------------------
  update(time, delta) {
    const dt = delta / 1000;
    this.far.tilePositionX += 12 * dt;
    this.mid.tilePositionX += 32 * dt;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > GAME_WIDTH + 100) c.x = -100;
    }
  }
}
