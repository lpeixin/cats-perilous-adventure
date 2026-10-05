/**
 * 陷阱组件库
 * ---------------------------------------------------------------
 * 设计原则：**每一种陷阱都是可复用组件，而不是在某一关里硬编码**。
 * 关卡数据里只写一个字符，关卡场景负责把字符实例化成对应组件。
 * 想调整"这个陷阱有多阴"，改 constants.js 里的 TRAP 参数即可，全关卡生效。
 *
 * 本文件实现 7 类原创陷阱：
 *   1. InvisibleBlock  隐形砖块
 *   2. SkyDropper      伪装天空掉落物（云/太阳突然砸下来）
 *   3. FakeItemBlock   假道具真陷阱（顶出来的是会扑咬的蘑菇怪）
 *   4. PipeAmbush      突然弹出的水管敌人
 *   5. CrumbleTile     地板消失陷阱
 *   6. FakeGoalPole    终点旗杆的"假通关"陷阱
 *   7. ConveyorTile    视觉误导的高台 + 隐藏向下传送带
 */
import { TRAP, TILE } from '../utils/constants.js';
import { audio } from '../utils/audio.js';
import { createEnemy } from './Enemy.js';

// ===========================================================================
// 1. 隐形砖块
// ===========================================================================
export class InvisibleBlock {
  constructor(scene, tile) {
    this.scene = scene;
    this.tile = tile;
    this.revealed = false;
    tile.setAlpha(0);
  }

  /** 猫撞上来了：把它"现形"，制造"刚才那是什么东西"的错愕感 */
  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    this.tile.setAlpha(1);
    this.tile.setTint(0xffffff);
    audio.play('bump');
    this.scene.tweens.add({
      targets: this.tile,
      alpha: { from: 0.25, to: 1 },
      scaleX: { from: 1.12, to: 1 },
      scaleY: { from: 1.12, to: 1 },
      duration: 180,
      ease: 'Back.easeOut',
    });
    this.scene.popText(this.tile.x, this.tile.y - 26, '！', '#ffd36e');
  }
}

// ===========================================================================
// 2. 伪装天空掉落物
// ===========================================================================
export class SkyDropper {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x 世界坐标
   * @param {number} y 世界坐标
   * @param {'cloud'|'sun'} kind
   */
  constructor(scene, x, y, kind) {
    this.scene = scene;
    this.kind = kind;
    this.triggered = false;
    this.landed = false;
    this.done = false;

    const tex = kind === 'sun'
      ? 'sun_evil'
      : 'cloud_evil';

    this.sprite = scene.physics.add.image(x, y, tex);
    this.sprite.setDepth(30);
    this.sprite.body.setAllowGravity(false);
    this.sprite.body.setCircle(
      kind === 'sun' ? 34 : 44,
      kind === 'sun' ? this.sprite.width / 2 - 34 : this.sprite.width / 2 - 44,
      kind === 'sun' ? this.sprite.height / 2 - 34 : this.sprite.height / 2 - 44
    );
    this.sprite.body.moves = false;
    // 纯装饰：在触发前对猫完全无害，也不参与碰撞
    this.sprite.body.enable = false;

    // 轻微飘浮，进一步坐实"这只是背景装饰"的错觉
    this.floatTween = scene.tweens.add({
      targets: this.sprite,
      y: y + 7,
      duration: 1600 + Math.random() * 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get active() { return this.sprite && this.sprite.active && !this.done; }

  update() {
    if (this.triggered || this.done || !this.sprite.active) return;
    const cat = this.scene.cat;
    if (!cat || cat.isDead) return;

    const dx = Math.abs(cat.x - this.sprite.x);
    const dy = cat.y - this.sprite.y;
    // 只有猫走到正下方附近才触发 —— 让它"专门等着你"
    if (dx < TILE * 1.9 + TRAP.SKY_TRIGGER_PAD * 0.4 && dy > 0 && dy < 460) {
      this.trigger();
    }
  }

  trigger() {
    if (this.triggered) return;
    this.triggered = true;
    if (this.floatTween) this.floatTween.stop();

    // 极短的抖动预警：第一次基本躲不掉，第二次就能靠这个细节反应
    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: this.sprite.x - 3, to: this.sprite.x + 3 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.drop(),
    });
  }

  drop() {
    if (!this.sprite.active) return;
    const body = this.sprite.body;
    body.enable = true;
    body.moves = true;
    body.setAllowGravity(false);
    body.setAccelerationY(TRAP.SKY_FALL_ACCEL);
    body.setMaxVelocity(0, 1400);
    body.setVelocityY(120);
    audio.play('crash');
    this.scene.cameras.main.shake(160, 0.004);
    this.scene.onTrapTriggered('skyDropper');
  }

  /** 砸到地面：碎裂、震屏，短暂停留后消散 */
  onLand() {
    if (this.landed || this.done) return;
    this.landed = true;
    const b = this.sprite.body;
    b.setVelocity(0, 0);
    b.setAcceleration(0, 0);
    b.setAllowGravity(false);
    b.moves = false;
    audio.play('crash');
    this.scene.cameras.main.shake(300, 0.010);
    this.scene.spawnDebris(this.sprite.x, this.sprite.y + 24, 0xc8c2b6, 7);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.14, scaleY: 0.8,
      duration: 110, yoyo: true,
    });
    // 停留一会儿再消散：让玩家真切地感受到"刚才差一点就被砸死了"
    this.scene.time.delayedCall(900, () => {
      if (!this.sprite.active) return;
      this.scene.tweens.add({
        targets: this.sprite, alpha: 0, y: this.sprite.y + 16,
        duration: 320, onComplete: () => this.destroy(),
      });
    });
  }

  /** 砸到猫身上 */
  onHitCat() {
    this.scene.cat.die();
  }

  destroy() {
    this.done = true;
    if (this.sprite && this.sprite.active) this.sprite.destroy();
  }
}

// ===========================================================================
// 3. 地板消失陷阱
// ===========================================================================
export class CrumbleTile {
  constructor(scene, tile) {
    this.scene = scene;
    this.tile = tile;
    // 纹理键由关卡解析器决定：摆在地表的是"伪装成草地"的版本
    this.texKey = (tile.tileData && tile.tileData.texture) || 'crumble';
    this.state = 'idle';
    this.timer = 0;
  }

  /** 猫踩上来了 */
  step() {
    if (this.state !== 'idle') return;
    this.state = 'shaking';
    this.timer = TRAP.CRUMBLE_DELAY_MS;
    this.tile.setTexture(this.texKey, 1);
    audio.play('crumble');
    // 抖动预警：给"手快的人"一个逃生的机会
    this.shakeTween = this.scene.tweens.add({
      targets: this.tile,
      x: this.tile.x + 2,
      duration: 42,
      yoyo: true,
      repeat: -1,
    });
  }

  update(delta) {
    if (this.state === 'idle') return;
    this.timer -= delta;
    if (this.timer <= 0) {
      if (this.state === 'shaking') {
        this.state = 'falling';
        this.timer = 60;
        this.tile.setTexture(this.texKey, 2);
      } else {
        this.collapse();
      }
    }
  }

  collapse() {
    this.state = 'gone';
    if (this.shakeTween) this.shakeTween.stop();
    const { x, y } = this.tile;
    audio.play('brick');
    this.scene.spawnDebris(x, y, 0xb4bcc8);
    this.scene.removeSolid(this.tile);
  }
}

// ===========================================================================
// 4. 视觉误导的高台 + 隐藏向下传送带
// ===========================================================================
export class ConveyorTile {
  constructor(scene, tile) {
    this.scene = scene;
    this.tile = tile;
    this.state = 'idle';
    this.timer = 0;
    // 外观与石块完全一致（见 levelLoader：texture = 'stone'）
  }

  step() {
    if (this.state !== 'idle') return;
    this.state = 'waiting';
    this.timer = TRAP.CONVEYOR_DELAY_MS;
  }

  update(delta) {
    if (this.state === 'waiting') {
      this.timer -= delta;
      if (this.timer <= 0) this.start();
    }
  }

  start() {
    this.state = 'sinking';
    this.scene.onTrapTriggered('conveyor');
    // 不做任何提示音 —— 就是要"悄悄地把玩家送走"
    const dy = TRAP.CONVEYOR_DISTANCE * TILE;
    this.scene.tweens.add({
      targets: this.tile,
      y: this.tile.y + dy,
      duration: TRAP.CONVEYOR_MS,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        if (this.tile.body) {
          this.tile.body.updateFromGameObject();
        }
      },
      onComplete: () => {
        this.state = 'gone';
        this.scene.removeSolid(this.tile);
        this.scene.onTrapSprung('conveyor');
      },
    });
  }
}

// ===========================================================================
// 5. 突然弹出的水管敌人
// ===========================================================================
export class PipeAmbush {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} pipeX 管道顶部中心的世界坐标 X
   * @param {number} pipeTopY 管道顶部世界坐标 Y
   */
  constructor(scene, pipeX, pipeTopY) {
    this.scene = scene;
    this.x = pipeX;
    this.y = pipeTopY;
    this.fired = false;
  }

  update() {
    if (this.fired) return;
    const cat = this.scene.cat;
    if (!cat || cat.isDead) return;
    if (Math.abs(cat.x - this.x) > TRAP.PIPE_AMBUSH_RANGE) return;
    this.fire();
  }

  fire() {
    this.fired = true;
    const e = createEnemy(this.scene, this.x, this.y - 6, 'yarn', { launched: true });
    if (!e) return;
    // 必须走 scene.addEnemy 登记：否则它既没有地形碰撞（会穿地掉下去），
    // 也没有和猫的 overlap（根本撞不到人）—— 那这个伏兵就白埋了。
    this.scene.addEnemy(e);
    e.body.setAllowGravity(true);
    e.body.setVelocityY(TRAP.PIPE_AMBUSH_VY);
    e.body.setVelocityX(0);
    // 在管道内部时先"藏"起来（视觉上不可见），弹出过程中逐渐显形
    e.setAlpha(0);
    this.scene.tweens.add({
      targets: e,
      alpha: 1,
      duration: 120,
      onComplete: () => {
        if (e.active) e.body.setVelocityX(e.facing * e.speed);
      },
    });
    audio.play('pop');
    this.scene.cameras.main.shake(140, 0.005);
    this.scene.onTrapTriggered('pipeAmbush');
  }
}

// ===========================================================================
// 6. 终点旗杆（含"假通关"陷阱）
// ===========================================================================
export class GoalPole {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x 格坐标
   * @param {number} y 格坐标（旗杆底部所在格）
   * @param {boolean} isFake
   */
  constructor(scene, x, y, isFake) {
    this.scene = scene;
    this.isFake = isFake;
    this.touched = false;
    this.worldX = x * TILE + TILE / 2;
    // 旗杆素材高 192px（4 格），底部对齐到 y 格的下沿
    this.baseY = (y + 1) * TILE;

    this.pole = scene.add.image(this.worldX, this.baseY - 96, 'goal_pole');
    this.pole.setOrigin(0.5, 0.5);
    this.pole.setDepth(8);

    this.flag = scene.add.sprite(this.worldX + 30, this.baseY - 176, 'goal_flagfish', 0);
    this.flag.setOrigin(0.5, 0.5);
    this.flag.setDepth(9);
    this.flag.play('flag-wave');

    // 触发区必须覆盖**整根旗杆**（杆顶到地面），而不是只有顶端那颗金球。
    //
    // 这里踩过一个很隐蔽的坑：原来的 zone 是 (baseY-176) 高 200，
    // 只覆盖旗杆的上半段。而小猫的碰撞盒只有 32px 高，站在地面上时
    // 它的 y 区间大约是 [baseY-32, baseY]，整段都在 zone 下沿之下 ——
    // 也就是说**走到旗杆前什么都不会发生**，玩家必须原地起跳才算过关。
    // 对一个满地假旗杆的恶搞游戏来说，这会让玩家以为真旗杆也是假的，
    // 直接卡死在最后一格。现在改成覆盖 baseY-196 ~ baseY+4，走进来即触发。
    this.zone = scene.add.zone(this.worldX, this.baseY - 96, TILE * 1.2, 200);
    scene.physics.add.existing(this.zone, true);
    this.zone.body.setSize(TILE * 1.2, 200);
    this.zone.body.updateFromGameObject();

    if (!isFake) {
      // 真终点：给一层柔和的暖光提示
      this.glow = scene.add.circle(this.worldX + 30, this.baseY - 176, 40, 0xffd76e, 0.16);
      this.glow.setDepth(7);
      scene.tweens.add({
        targets: this.glow, scale: 1.3, alpha: 0.05,
        duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  get active() { return !this.touched; }

  /** 猫碰到了旗杆 */
  onTouch(cat) {
    if (this.touched) return;
    this.touched = true;
    if (this.isFake) this.playFake(cat);
    else this.scene.completeLevel(cat);
  }

  /** 假通关演出：先让你高兴一下，再把地板抽走 */
  playFake(cat) {
    audio.play('fakeGoal');
    this.scene.onFakeGoalStart();

    // 旗子疯狂摇摆，装得很像真的
    this.scene.tweens.add({
      targets: this.flag,
      angle: { from: -14, to: 14 },
      duration: 110,
      yoyo: true,
      repeat: 4,
    });

    this.scene.time.delayedCall(TRAP.FAKE_GOAL_FAKE_MS, () => {
      // 1) 地板塌陷
      this.scene.collapseAround(this.worldX, 4);
      // 2) 旗杆歪倒、沉下去
      this.scene.tweens.add({
        targets: [this.pole, this.flag],
        angle: this.isFake ? 76 : 0,
        y: '+=180',
        alpha: 0,
        duration: 700,
        ease: 'Quad.easeIn',
      });
      audio.play('trap');
      this.scene.cameras.main.shake(320, 0.011);
      this.scene.onFakeGoalReveal();
    });
  }
}
