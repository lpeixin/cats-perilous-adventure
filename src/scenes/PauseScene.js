/**
 * PauseScene —— 工作室级暂停菜单弹窗
 * ---------------------------------------------------------------
 * 以覆盖层方式启动（LevelScene 被 pause），支持键盘与鼠标悬停点击。
 */
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { formatTime } from '../utils/save.js';
import { drawCard } from '../ui/Hud.js';
import { t } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  init(data) {
    this.info = data || {};
    this.index = 0;
    this.rowObjs = [];
  }

  create() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1e1418, 0.62)
      .setOrigin(0, 0);

    const w = 480;
    const h = 342;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT / 2 - h / 2;
    drawCard(this, x, y, w, h, { radius: 22, alpha: 0.98, selected: true });

    // 顶部标题与数据胶囊底衬
    const topG = this.add.graphics();
    topG.fillStyle(0xf6ede2, 1);
    topG.fillRoundedRect(x + 40, y + 66, w - 80, 34, 17);

    this.add.text(GAME_WIDTH / 2, y + 36, t('pause.title'), {
      fontFamily: FONT, fontSize: '30px', color: '#36262a', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 83,
      t('pause.stats', { n: this.info.deaths ?? 0, time: formatTime(this.info.elapsed ?? 0) }), {
        fontFamily: FONT, fontSize: '13.5px', color: '#6e5c58', fontStyle: 'bold',
      }).setOrigin(0.5);

    this.rows = [
      { icon: '▶', badgeColor: 0x4ca858, label: t('pause.resume'), hint: 'P / ESC', action: () => this.resume() },
      { icon: '↺', badgeColor: 0xe68a2e, label: t('pause.restart'), hint: 'R', action: () => this.restart() },
      { icon: '✕', badgeColor: 0xc8463c, label: t('pause.abandon'), danger: true, hint: '', action: () => this.abandon() },
    ];

    this.renderRows(y);

    const kb = this.input.keyboard;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-P', () => this.resume());
    kb.on('keydown-ESC', () => this.resume());
  }

  renderRows(baseY) {
    this.rowObjs.forEach((o) => o.destroy && o.destroy());
    this.rowObjs = [];

    const y0 = baseY ?? (GAME_HEIGHT / 2 - 342 / 2);
    this.rows.forEach((row, i) => {
      const rw = 380;
      const rh = 50;
      const rx = GAME_WIDTH / 2 - rw / 2;
      const ry = y0 + 120 + i * 62;
      const selected = i === this.index;

      const card = drawCard(this, rx, ry, rw, rh, {
        radius: 15,
        selected,
        danger: row.danger,
        fill: row.danger ? 0xfff0f0 : (selected ? 0xfff5e0 : 0xfffdfa),
        line: selected ? 0xf2a62c : COLORS.line,
      });

      const badge = this.add.graphics();
      badge.fillStyle(row.badgeColor, 1);
      badge.fillRoundedRect(rx + 12, ry + 9, 32, 32, 9);
      const icon = this.add.text(rx + 28, ry + 25, row.icon, {
        fontFamily: FONT, fontSize: '14px', color: '#fffdfa', fontStyle: 'bold',
      }).setOrigin(0.5);

      const txt = this.add.text(rx + 58, ry + rh / 2, row.label, {
        fontFamily: FONT, fontSize: '17px',
        color: row.danger ? '#bf3b3b' : '#36262a',
        fontStyle: selected ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);

      if (row.hint) {
        const hint = this.add.text(rx + rw - 16, ry + rh / 2, row.hint, {
          fontFamily: 'Helvetica Neue, Arial, sans-serif',
          fontSize: '11.5px',
          color: selected ? '#d47c1c' : '#a89892',
          fontStyle: 'bold',
        }).setOrigin(1, 0.5);
        this.rowObjs.push(hint);
      }

      const zone = this.add.zone(rx + rw / 2, ry + rh / 2, rw, rh)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (this.index !== i) {
          this.index = i;
          audio.play('select');
          this.renderRows(y0);
        }
      });
      zone.on('pointerdown', () => {
        this.index = i;
        this.confirm();
      });

      this.rowObjs.push(card, badge, icon, txt, zone);
    });
  }

  move(d) {
    this.index = (this.index + d + this.rows.length) % this.rows.length;
    audio.play('select');
    this.renderRows();
  }

  confirm() {
    this.rows[this.index].action();
  }

  resume() {
    audio.play('select');
    const level = this.scene.get('Level');
    this.scene.resume('Level');
    if (level && level.resumeFromPause) level.resumeFromPause();
    this.scene.stop();
  }

  restart() {
    audio.play('select');
    const level = this.scene.get('Level');
    this.scene.stop();
    this.scene.resume('Level');
    if (level) {
      level.paused = false;
      level.physics.world.resume();
      level.restartLevel();
    }
  }

  abandon() {
    audio.play('select');
    const info = {
      levelId: this.info.levelId,
      deaths: this.info.deaths ?? 0,
      elapsed: this.info.elapsed ?? 0,
      coins: this.info.coins ?? 0,
      abandoned: true,
    };
    this.scene.stop('Level');
    this.scene.stop();
    this.scene.start('GameOver', info);
  }
}
