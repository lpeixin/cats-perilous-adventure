/**
 * PauseScene —— 暂停覆盖层
 * ---------------------------------------------------------------
 * 以覆盖层方式启动（LevelScene 被 pause），所以死亡重试循环不会被打断。
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
  }

  create() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x2b2024, 0.55)
      .setOrigin(0, 0);

    const w = 460;
    const h = 320;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT / 2 - h / 2;
    drawCard(this, x, y, w, h, { radius: 20, alpha: 0.98 });

    this.add.text(GAME_WIDTH / 2, y + 34, t('pause.title'), {
      fontFamily: FONT, fontSize: '30px', color: '#3e2e32', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 74,
      t('pause.stats', { n: this.info.deaths ?? 0, time: formatTime(this.info.elapsed ?? 0) }), {
        fontFamily: FONT, fontSize: '13px', color: '#8b7c78',
      }).setOrigin(0.5);

    this.rows = [
      { label: t('pause.resume'), action: () => this.resume() },
      { label: t('pause.restart'), action: () => this.restart() },
      { label: t('pause.abandon'), danger: true, action: () => this.abandon() },
    ];

    this.rows.forEach((row, i) => {
      const rw = 360;
      const rh = 48;
      const rx = GAME_WIDTH / 2 - rw / 2;
      const ry = y + 108 + i * 58;
      const selected = i === this.index;
      drawCard(this, rx, ry, rw, rh, {
        radius: 14,
        fill: row.danger ? 0xfff0f0 : (selected ? 0xfff4e2 : 0xfffdfa),
        line: selected ? 0xffc842 : COLORS.line,
      });
      this.add.text(GAME_WIDTH / 2, ry + rh / 2, row.label, {
        fontFamily: FONT, fontSize: '17px',
        color: row.danger ? '#b63c3c' : '#3e2e32',
        fontStyle: selected ? 'bold' : 'normal',
      }).setOrigin(0.5);
      row.rect = { x: rx, y: ry, w: rw, h: rh };
    });

    this.highlight();

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

  highlight() {
    // 用一层描边表示当前选中项
    if (this.cursor) this.cursor.destroy();
    const r = this.rows[this.index].rect;
    this.cursor = this.add.graphics();
    this.cursor.lineStyle(3, 0xffc842, 1);
    this.cursor.strokeRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 16);
  }

  move(d) {
    this.index = (this.index + d + this.rows.length) % this.rows.length;
    audio.play('select');
    this.highlight();
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
    const level = this.scene.get('Level');
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
