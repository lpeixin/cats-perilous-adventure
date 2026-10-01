/**
 * 原创敌人
 * ---------------------------------------------------------------
 * 四种敌人，全部为本项目原创设计（造型见 assets/sprites/enemy_*.png）：
 *
 *   · 毛线球怪 YarnBall   —— 地面巡逻，走到边缘/墙自动掉头（最"讲道理"的敌人）
 *   · 乌鸦     Crow       —— 空中正弦飞行，走固定航线，逼玩家卡节奏
 *   · 跳跳鱼   Fish       —— 从水里/岩浆里周期性弹跳，落地判定点很阴
 *   · 蘑菇陷阱怪 Mushroom —— 平时一动不动装成道具，玩家靠近就高速扑咬
 *
 * 所有敌人：踩头顶 = 消灭；侧面/下方接触 = 猫受伤或死亡；
 * 猫处于无敌星状态时 = 接触即秒杀。
 */
import { TRAP } from '../utils/constants.js';
import { audio } from '../utils/audio.js';

const DEPTH = 15;

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture, opts = {}) {
    super(scene, x, y, texture, opts.frame || 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.enemyType = opts.enemyType || 'yarn';
    this.stompable = opts.stompable !== false;
    this.dying = false;
    this.homeX = x;
    this.homeY = y;
    this.facing = opts.facing || -1;
    this.setDepth(DEPTH);
    this.setOrigin(0.5, 0.5);

    const body = this.body;
    body.setAllowGravity(opts.gravity !== false);
    body.setMaxVelocity(600, 900);
    body.setSize(opts.bodyW || 34, opts.bodyH || 34);
    body.setOffset((this.width - (opts.bodyW || 34)) / 2,
                   (this.height - (opts.bodyH || 34)) / 2);
    this.setFlipX(this.facing > 0);
    this.speed = opts.speed || 90;
    this.body.setVelocityX(this.facing * this.speed);
  }

  // -------------------------------------------------------------------------
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.dying || !this.active) return;
    this.behave(time, delta);
  }

  /** 子类覆写 */
  behave() {}

  // -------------------------------------------------------------------------
  /** 被踩：压扁后消失 */
  stomp() {
    if (this.dying) return;
    this.dying = true;
    this.body.enable = false;
    this.setVelocity(0, 0);
    audio.play('stomp');
    this.scene.tweens.add({
      targets: this,
      scaleY: 0.18,
      scaleX: 1.28,
      alpha: 0,
      y: this.y + 12,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => this.destroy(),
    });
  }

  /** 被无敌星撞到：飞出去 */
  killByStar() {
    if (this.dying) return;
    this.dying = true;
    this.body.enable = false;
    audio.play('stomp');
    this.setFlipY(true);
    this.scene.tweens.add({
      targets: this,
      y: this.y - 90,
      alpha: 0,
      angle: 220,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => this.destroy(),
    });
  }

  /** 掉进坑里/被机关清除 */
  vanish() {
    if (this.dying) return;
    this.dying = true;
    this.destroy();
  }
}

// ===========================================================================
// 毛线球怪
// ===========================================================================
export class YarnBall extends Enemy {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, 'enemy_yarn', {
      enemyType: 'yarn', bodyW: 34, bodyH: 34, speed: opts.speed ?? 88, ...opts,
    });
    this.play('yarn-roll');
    this.launched = opts.launched || false;   // 从水管里弹出来的那只会飞一段
    this.turnCooldown = 0;
  }

  behave(time, delta) {
    const body = this.body;
    if (!body.enable) return;

    if (this.launched) {
      // 水管伏兵：先被弹到空中，落地后转为普通巡逻
      if (body.blocked.down || body.touching.down) this.launched = false;
      return;
    }

    // 撞墙就掉头
    if (body.blocked.left || body.touching.left) {
      this.facing = 1;
      body.setVelocityX(this.speed);
    } else if (body.blocked.right || body.touching.right) {
      this.facing = -1;
      body.setVelocityX(-this.speed);
    }
    this.setFlipX(this.facing > 0);

    // 走到平台边缘也掉头 —— 免得它自己掉下去（那样玩家就少了一份乐趣）
    if (body.blocked.down && this.turnCooldown <= 0) {
      const probeX = this.x + this.facing * (this.body.width / 2 + 6);
      const probeY = this.body.bottom + 8;
      if (!this.scene.isSolidAt(probeX, probeY)) {
        this.facing *= -1;
        body.setVelocityX(this.facing * this.speed);
        this.setFlipX(this.facing > 0);
        this.turnCooldown = 6;
      }
    }
    if (this.turnCooldown > 0) this.turnCooldown--;
  }
}

// ===========================================================================
// 乌鸦
// ===========================================================================
export class Crow extends Enemy {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, 'enemy_crow', {
      enemyType: 'crow', bodyW: 32, bodyH: 24, gravity: false, ...opts,
    });
    this.body.setAllowGravity(false);
    this.play('crow-fly');
    this.rangeX = opts.rangeX ?? 220;
    this.baseY = y;
    this.t = opts.phase ?? 0;
    this.amp = opts.amp ?? 34;
    this.flySpeed = opts.speed ?? 78;
  }

  behave(time, delta) {
    const dt = delta / 1000;
    this.t += dt;
    // 水平：在 [homeX-rangeX, homeX+rangeX] 之间来回
    this.x += this.facing * this.flySpeed * dt;
    if (this.x < this.homeX - this.rangeX) this.facing = 1;
    if (this.x > this.homeX + this.rangeX) this.facing = -1;
    this.setFlipX(this.facing > 0);
    // 垂直：正弦飘浮，制造"忽高忽低"的压迫感
    this.y = this.baseY + Math.sin(this.t * 1.9) * this.amp;
    this.body.updateFromGameObject();
  }
}

// ===========================================================================
// 跳跳鱼
// ===========================================================================
export class Fish extends Enemy {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, 'enemy_fish', {
      enemyType: 'fish', bodyW: 30, bodyH: 24, speed: 0, ...opts,
    });
    this.play('fish-swim');
    this.homeX = x;
    this.homeY = y;
    this.body.setAllowGravity(false);
    this.state = 'idle';
    this.timer = opts.delay ?? 400;
    this.jumpVx = opts.jumpVx ?? 150;
    this.jumpVy = opts.jumpVy ?? -520;
    this.setFlipX(false);
  }

  behave(time, delta) {
    const body = this.body;
    if (this.state === 'idle') {
      this.timer -= delta;
      // 出水前先在水面"探头"两下，给一点点（但不太够的）预告
      const peek = Math.sin(time / 90) * 3;
      this.y = this.homeY + peek;
      this.body.updateFromGameObject();
      if (this.timer <= 0) {
        this.state = 'jump';
        body.setAllowGravity(true);
        body.setVelocity(this.jumpVx * (this.scene.cat && this.scene.cat.x > this.x ? 1 : -1) * 0.6,
                         this.jumpVy);
        audio.play('pop');
      }
      return;
    }
    // 飞行中：落地后回到 idle
    if (body.velocity.y > 0 && body.blocked.down) {
      this.state = 'idle';
      this.timer = 900 + Math.random() * 700;
      body.setAllowGravity(false);
      body.setVelocity(0, 0);
      this.homeX = this.x;
      this.homeY = this.y;
    }
  }
}

// ===========================================================================
// 蘑菇陷阱怪
// ===========================================================================
export class MushroomTrap extends Enemy {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, 'enemy_mushroom', {
      enemyType: 'mushroom', bodyW: 34, bodyH: 36, speed: 0, ...opts,
    });
    this.state = 'idle';
    this.chargeDir = 0;
    this.play('mush-idle');
    this.emerging = !!opts.emerging;   // 从问号砖里顶出来时，先做一个"冒头"演出
    if (this.emerging) {
      this.body.enable = false;
      this.setAlpha(0);
      this.setScale(0.6);
      scene.tweens.add({
        targets: this, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut',
        onComplete: () => {
          if (!this.active) return;
          this.body.enable = true;
          this.body.setAllowGravity(true);
        },
      });
    }
  }

  behave(time, delta) {
    const cat = this.scene.cat;
    if (!cat || cat.isDead) return;

    const dist = Phaser.Math.Distance.Between(this.x, this.y, cat.x, cat.y);

    if (this.state === 'idle') {
      if (dist < TRAP.FAKE_ITEM_RANGE) {
        this.state = 'charge';
        this.play('mush-pounce');
        this.chargeDir = Math.sign(cat.x - this.x) || 1;
        this.setFlipX(this.chargeDir > 0);
        audio.play('trap');
        // 起跳扑击
        this.body.setVelocityX(this.chargeDir * TRAP.MUSH_CHARGE_SPEED);
        this.body.setVelocityY(-330);
      }
      return;
    }

    // 冲锋：持续朝猫的方向微调，落地后继续跑
    if (this.body.blocked.down || this.body.touching.down) {
      const want = Math.sign(cat.x - this.x) || this.chargeDir;
      this.chargeDir = want;
      this.setFlipX(this.chargeDir > 0);
      this.body.setVelocityX(this.chargeDir * TRAP.MUSH_CHARGE_SPEED);
    }
    if (this.body.blocked.left || this.body.blocked.right) {
      this.body.setVelocityY(-300);
    }
  }
}

// ===========================================================================
// 工厂
// ===========================================================================
export function createEnemy(scene, x, y, type, opts = {}) {
  switch (type) {
    case 'yarn': return new YarnBall(scene, x, y, opts);
    case 'crow': return new Crow(scene, x, y, opts);
    case 'fish': return new Fish(scene, x, y, opts);
    case 'mushroom': return new MushroomTrap(scene, x, y, opts);
    default: return null;
  }
}

export const ENEMY_TEXTURES = {
  yarn: 'enemy_yarn',
  crow: 'enemy_crow',
  fish: 'enemy_fish',
  mushroom: 'enemy_mushroom',
};
