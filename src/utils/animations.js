/**
 * 动画注册表
 * ---------------------------------------------------------------
 * 所有精灵表都在 PreloadScene 里按固定网格切好，这里集中注册动画。
 * 猫有 8 组动作 × 2 种形态 = 16 条动画；敌人/道具/瓦片各自若干条。
 */
import { CAT_FRAMES } from './constants.js';

const CFG = { frameRate: 10, repeat: -1 };

export function registerAnimations(anims) {
  // -------------------------------------------------------------------------
  // 猫（小猫 / 大猫各一套，帧索引完全一致）
  // -------------------------------------------------------------------------
  for (const [prefix, sheet] of [['small', 'cat_small'], ['big', 'cat_big']]) {
    anims.create({ key: `${prefix}-idle`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.IDLE }), frameRate: 3, repeat: -1 });
    anims.create({ key: `${prefix}-walk`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.WALK }), frameRate: 11, repeat: -1 });
    anims.create({ key: `${prefix}-jump`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.JUMP }), frameRate: 6, repeat: -1 });
    anims.create({ key: `${prefix}-fall`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.FALL }), frameRate: 6, repeat: -1 });
    anims.create({ key: `${prefix}-crouch`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.CROUCH }), frameRate: 4, repeat: -1 });
    anims.create({ key: `${prefix}-hurt`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.HURT }), frameRate: 4, repeat: -1 });
    anims.create({ key: `${prefix}-slide`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.SLIDE }), frameRate: 6, repeat: -1 });
    anims.create({ key: `${prefix}-land`, frames: anims.generateFrameNumbers(sheet, { frames: CAT_FRAMES.LAND }), frameRate: 8, repeat: 0 });
  }

  // -------------------------------------------------------------------------
  // 敌人
  // -------------------------------------------------------------------------
  anims.create({ key: 'yarn-roll', frames: anims.generateFrameNumbers('enemy_yarn', { start: 0, end: 3 }), ...CFG, frameRate: 9 });
  anims.create({ key: 'crow-fly', frames: anims.generateFrameNumbers('enemy_crow', { start: 0, end: 3 }), ...CFG, frameRate: 8 });
  anims.create({ key: 'fish-swim', frames: anims.generateFrameNumbers('enemy_fish', { start: 0, end: 3 }), ...CFG, frameRate: 8 });
  anims.create({ key: 'mush-idle', frames: anims.generateFrameNumbers('enemy_mushroom', { start: 0, end: 1 }), ...CFG, frameRate: 3 });
  anims.create({ key: 'mush-pounce', frames: anims.generateFrameNumbers('enemy_mushroom', { start: 2, end: 3 }), ...CFG, frameRate: 10 });

  // -------------------------------------------------------------------------
  // 道具
  // -------------------------------------------------------------------------
  anims.create({ key: 'goldfish-swim', frames: anims.generateFrameNumbers('item_goldfish', { start: 0, end: 3 }), ...CFG, frameRate: 9 });
  anims.create({ key: 'star-spin', frames: anims.generateFrameNumbers('item_star', { start: 0, end: 3 }), ...CFG, frameRate: 11 });
  anims.create({ key: 'can-shine', frames: anims.generateFrameNumbers('item_can', { start: 0, end: 3 }), ...CFG, frameRate: 6 });
  anims.create({ key: 'flag-wave', frames: anims.generateFrameNumbers('goal_flagfish', { start: 0, end: 3 }), ...CFG, frameRate: 7 });

  // -------------------------------------------------------------------------
  // 瓦片
  // -------------------------------------------------------------------------
  anims.create({ key: 'question-shine', frames: anims.generateFrameNumbers('question', { start: 0, end: 2 }), ...CFG, frameRate: 4 });
  anims.create({ key: 'lava-flow', frames: anims.generateFrameNumbers('lava', { start: 0, end: 3 }), ...CFG, frameRate: 6 });
  anims.create({ key: 'water-flow', frames: anims.generateFrameNumbers('water', { start: 0, end: 3 }), ...CFG, frameRate: 4 });
  anims.create({ key: 'crumble-break', frames: anims.generateFrameNumbers('crumble', { start: 0, end: 2 }), frameRate: 10, repeat: 0 });
}
