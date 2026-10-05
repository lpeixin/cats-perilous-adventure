/**
 * GameOverScene —— 挑战中断结算
 * ---------------------------------------------------------------
 * 本作是"无限重试"设计：正常死亡不会进入这里，而是立刻重开当前关卡。
 * 只有玩家从暂停菜单里主动「放弃本关」时才会走到这个场景 ——
 * 所以它的语气不是"你失败了"，而是"先歇会儿，记录都给你留着"。
 */
import { GAME_WIDTH, GAME_HEIGHT, LEVELS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { formatTime, deathTaunt } from '../utils/save.js';
import { drawCard } from '../ui/Hud.js';
import { t } from '../utils/i18n.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.info = data || {};
  }

  create() {
    const cfg = LEVELS.find((l) => l.id === this.info.levelId) || LEVELS[0];

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_sky')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.5);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x2b2024, 0.72).setOrigin(0, 0);

    const w = 560;
    const h = 300;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT / 2 - h / 2 - 10;
    drawCard(this, x, y, w, h, { radius: 22, alpha: 0.97 });

    // 一只哭丧着脸的猫
    const cat = this.add.sprite(GAME_WIDTH / 2, y - 26, 'cat_small', 9).setScale(1.7);
    this.tweens.add({
      targets: cat, angle: { from: -8, to: 8 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.add.text(GAME_WIDTH / 2, y + 44, t('over.title'), {
      fontFamily: FONT, fontSize: '34px', color: '#3e2e32', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 84, t(cfg.nameKey), {
      fontFamily: FONT, fontSize: '14px', color: '#8b7c78',
    }).setOrigin(0.5);

    const taunt = deathTaunt(this.info.deaths || 0);
    this.add.text(GAME_WIDTH / 2, y + 124,
      t('over.summary', { n: this.info.deaths || 0, time: formatTime(this.info.elapsed || 0) }), {
        fontFamily: FONT, fontSize: '15px', color: '#3e2e32',
      }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 154, t(taunt.key, taunt.params), {
      fontFamily: FONT, fontSize: '14px', color: '#b63c3c',
      wordWrap: { width: w - 70 }, align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 200, t('over.persist'), {
        fontFamily: FONT, fontSize: '12.5px', color: '#8b7c78',
      }).setOrigin(0.5);

    const hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 62,
      t('over.hint'), {
        fontFamily: FONT, fontSize: '15px', color: '#fffdfa', fontStyle: 'bold',
        stroke: '#3e2e32', strokeThickness: 4,
      }).setOrigin(0.5);
    this.tweens.add({
      targets: hint, alpha: { from: 1, to: 0.5 },
      duration: 900, yoyo: true, repeat: -1,
    });

    audio.play('hurt');

    const kb = this.input.keyboard;
    kb.on('keydown-ENTER', () => this.retry());
    kb.on('keydown-SPACE', () => this.retry());
    kb.on('keydown-ESC', () => this.scene.start('Menu'));
  }

  retry() {
    audio.play('select');
    this.scene.start('Level', { levelId: this.info.levelId || 1 });
  }
}
