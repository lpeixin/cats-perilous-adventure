/**
 * GameOverScene —— 挑战中断结算（工作室级界面版）
 * ---------------------------------------------------------------
 * 本作是"无限重试"设计：正常死亡不会进入这里，而是立刻重开当前关卡。
 * 只有玩家从暂停菜单里主动「放弃本关」时才会走到这个场景 ——
 * 所以它的语气不是"你失败了"，而是"先歇会儿，记录都给你留着"。
 */
import { GAME_WIDTH, GAME_HEIGHT, LEVELS } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { formatTime, deathTaunt } from '../utils/save.js';
import { drawCard, drawPill, drawCircleBadge } from '../ui/Hud.js';
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

    const skyKey = this.textures.exists('bg_sky_2') ? 'bg_sky_2' : 'bg_sky';
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, skyKey)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setAlpha(0.55);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1e1418, 0.72).setOrigin(0, 0);

    const w = 580;
    const h = 310;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT / 2 - h / 2 - 8;
    drawCard(this, x, y, w, h, { radius: 22, alpha: 0.98, selected: true });

    // 内嵌装饰面板
    drawPill(this, x + 28, y + 108, w - 56, 98, {
      radius: 14, fill: 0xf8eee4, alpha: 1, line: 0xe4d0be, lineAlpha: 1, lineWidth: 1.5,
    });

    // 委屈巴巴的小猫徽章
    drawCircleBadge(this, GAME_WIDTH / 2, y - 16, 36, {
      fill: 0xffe4bc, line: 0xe6a040, lineWidth: 3,
    });

    const cat = this.add.sprite(GAME_WIDTH / 2, y - 16, 'cat_small', 9).setScale(1.45);
    this.tweens.add({
      targets: cat, angle: { from: -8, to: 8 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.add.text(GAME_WIDTH / 2, y + 48, t('over.title'), {
      fontFamily: FONT, fontSize: '32px', color: '#36262a', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 84, t(cfg.nameKey), {
      fontFamily: FONT, fontSize: '14px', color: '#82706c', fontStyle: 'bold',
    }).setOrigin(0.5);

    const taunt = deathTaunt(this.info.deaths || 0);
    this.add.text(GAME_WIDTH / 2, y + 134,
      t('over.summary', { n: this.info.deaths || 0, time: formatTime(this.info.elapsed || 0) }), {
        fontFamily: FONT, fontSize: '15.5px', color: '#36262a', fontStyle: 'bold',
      }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 170, t(taunt.key, taunt.params), {
      fontFamily: FONT, fontSize: '14px', color: '#bf3b3b', fontStyle: 'bold',
      wordWrap: { width: w - 80 }, align: 'center',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, y + 236, t('over.persist'), {
      fontFamily: FONT, fontSize: '12.5px', color: '#82706c',
    }).setOrigin(0.5);

    // 底部提示胶囊（支持点击重试）
    const cx = GAME_WIDTH / 2;
    drawPill(this, cx - 240, GAME_HEIGHT - 64, 480, 36, {
      radius: 18, fill: 0x21161a, alpha: 0.85, line: 0xffd26a, lineAlpha: 0.68, lineWidth: 1.5,
    });

    const hint = this.add.text(cx, GAME_HEIGHT - 46,
      t('over.hint'), {
        fontFamily: FONT, fontSize: '14.5px', color: '#fffdfa', fontStyle: 'bold',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hint.on('pointerdown', () => this.retry());

    this.tweens.add({
      targets: hint, alpha: { from: 1, to: 0.6 },
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
