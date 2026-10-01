/**
 * MenuScene —— 主菜单
 * ---------------------------------------------------------------
 * 三层视差滚动背景 + 圆角卡片菜单。纯键盘操作（↑↓ 选择，Enter/Space 确认，Esc 返回）。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS, LEVELS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { Save, formatTime } from '../utils/save.js';
import { drawCard } from '../ui/Hud.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.mode = 'main';      // 'main' | 'levels' | 'help' | 'confirm'
    this.index = 0;
    this.rows = [];

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
  }

  buildTitle() {
    // 主角站在草地上。
    // 注意别放在 GAME_WIDTH/2 - 210：那里正好被菜单按钮压住半只猫。
    this.hero = this.add.sprite(GAME_WIDTH * 0.175, GAME_HEIGHT - 92, 'cat_big', 0)
      .setOrigin(0.5, 1).setScale(1.5);
    this.hero.play('big-idle');
    this.tweens.add({
      targets: this.hero, y: GAME_HEIGHT - 96, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.add.text(GAME_WIDTH / 2, 88, '猫咪历险记', {
      fontFamily: FONT, fontSize: '58px', color: '#fffdfa', fontStyle: 'bold',
      stroke: '#3e2e32', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 140, "Cat's Perilous Adventure", {
      fontFamily: 'Helvetica Neue, Arial, sans-serif', fontSize: '17px',
      color: '#fff0da', letterSpacing: 4, stroke: '#3e2e32', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 176, '看起来人畜无害的那种平台跳跃游戏', {
      fontFamily: FONT, fontSize: '14px', color: '#fff0da',
      stroke: '#3e2e32', strokeThickness: 3,
    }).setOrigin(0.5);
  }

  buildFooter() {
    const data = Save.all();
    this.add.text(20, GAME_HEIGHT - 30,
      `累计死亡 ${data.totalDeaths} 次　·　累计收集金鱼 ${data.totalFish} 条`, {
        fontFamily: FONT, fontSize: '13px', color: '#fffdfa',
        stroke: '#3e2e32', strokeThickness: 3,
      });

    const muted = audio.muted;
    this.muteText = this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 30,
      muted ? 'M  音效：关' : 'M  音效：开', {
        fontFamily: FONT, fontSize: '13px', color: '#fffdfa',
        stroke: '#3e2e32', strokeThickness: 3,
      }).setOrigin(1, 0);

    this.add.text(GAME_WIDTH - 20, 18,
      '↑↓ 选择　Enter/Space 确认　Esc 返回　M 静音', {
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
        { label: `开始冒险　（从第 ${unlocked} 关继续）`, action: () => this.startLevel(unlocked) },
        { label: '选择关卡', action: () => this.setMode('levels') },
        { label: '操作说明', action: () => this.setMode('help') },
        { label: '清除记录', action: () => this.setMode('confirm') },
      ];
    } else if (this.mode === 'levels') {
      this.rows = LEVELS.map((lv) => {
        const rec = Save.level(lv.id);
        const locked = lv.id > unlocked;
        const detail = locked
          ? '未解锁'
          : (rec && rec.bestTimeMs !== null
              ? `最佳 ${formatTime(rec.bestTimeMs)}　最少死亡 ${rec.fewestDeaths} 次`
              : '尚未通关');
        return {
          label: `${lv.name}`, detail, locked,
          action: () => !locked && this.startLevel(lv.id),
        };
      });
      this.rows.push({ label: '返回', action: () => this.setMode('main') });
    } else if (this.mode === 'confirm') {
      this.rows = [
        { label: '确认清除所有记录', danger: true, action: () => {
          Save.reset();
          audio.play('trap');
          this.setMode('main');
          this.buildFooterRefresh();
        } },
        { label: '取消', action: () => this.setMode('main') },
      ];
    }

    this.index = 0;
    this.renderRows();
  }

  buildFooterRefresh() {
    // 简单起见：重开本场景即可刷新底部的累计统计
    this.scene.restart({ keepMode: true });
  }

  renderRows() {
    const startY = this.mode === 'help' ? 0 : 250;
    if (this.mode === 'help') {
      this.renderHelp();
      return;
    }

    this.rows.forEach((row, i) => {
      const w = 460;
      const h = 54;
      const x = GAME_WIDTH / 2 - w / 2;
      const y = startY + i * 64;

      const selected = i === this.index;
      const g = drawCard(this, x, y, w, h, {
        radius: 15,
        fill: row.danger ? 0xfff0f0 : (selected ? 0xfff4e2 : 0xfffdfa),
        // 不透明度别太低：背后是山和树，太透会让按钮上的字很难读
        alpha: selected ? 0.99 : 0.95,
        line: selected ? 0xffc842 : COLORS.line,
      });
      g.setDepth(10);

      const label = this.add.text(x + 26, y + (row.detail ? 12 : 17), row.label, {
        fontFamily: FONT, fontSize: '18px',
        color: row.locked ? '#b9aca6' : (row.danger ? '#b63c3c' : '#3e2e32'),
        fontStyle: selected ? 'bold' : 'normal',
      }).setDepth(11);

      if (row.detail) {
        this.add.text(x + 26, y + 33, row.detail, {
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
    const w = 720;
    const h = 380;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = 118;
    const g = drawCard(this, x, y, w, h, { radius: 20, alpha: 0.97 });
    g.setDepth(10);
    this.menuObjects.push(g);

    const lines = [
      ['操作', ''],
      ['← / A　　向右走（向左同理）', '→ / D　向右走'],
      ['空格 / ↑ / W　　跳跃', '按住跳更高，短按跳更低'],
      ['↓ / S　　蹲下', '大猫可蹲行进入矮通道'],
      ['Shift　　加速奔跑', '奔跑时起跳会更高'],
      ['P / Esc　　暂停', '暂停菜单里可以放弃本关'],
      ['R　　立即重开本关', '死亡率很高，重试必须够快'],
      ['', ''],
      ['规则', ''],
      ['踩敌人头顶 = 消灭它', '从侧面或下方碰到 = 受伤'],
      ['吃鱼罐头 → 大猫', '大猫受伤只会退化，不会死'],
      ['吃无敌星 → 短暂无敌', '闪烁期间碰到敌人即秒杀'],
      ['顶「?」砖出道具', '大猫能顶碎普通砖块'],
      ['', ''],
      ['本作特色', ''],
      ['地图里布满了伪装成安全区的陷阱。', '第一次遇到基本躲不掉 —— 这是设计好的。'],
      ['死一次就记一次，重试成本极低。', '死亡次数不是惩罚，是你的荣誉勋章。'],
    ];

    let ty = y + 22;
    for (const [a, b] of lines) {
      if (!a && !b) { ty += 10; continue; }
      const isHead = ['操作', '规则', '本作特色'].includes(a) && !b;
      this.menuObjects.push(this.add.text(x + 30, ty, a, {
        fontFamily: FONT, fontSize: isHead ? '16px' : '14px',
        color: isHead ? '#d88034' : '#3e2e32',
        fontStyle: isHead ? 'bold' : 'normal',
      }).setDepth(11));
      if (b) {
        this.menuObjects.push(this.add.text(x + 380, ty, b, {
          fontFamily: FONT, fontSize: '13px', color: '#8b7c78',
        }).setDepth(11));
      }
      ty += isHead ? 26 : 21;
    }

    this.menuObjects.push(this.add.text(GAME_WIDTH / 2, y + h - 22, '按 Esc 或 Enter 返回', {
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
      enter: 'ENTER', space: 'SPACE', esc: 'ESC', m: 'M',
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
    this.muteText.setText(m ? 'M  音效：关' : 'M  音效：开');
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
