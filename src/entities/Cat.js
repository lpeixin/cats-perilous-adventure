/**
 * 主角：猫咪
 * ---------------------------------------------------------------
 * 手感是这个游戏能不能玩下去的命脉，所以这里集中实现了几条
 * "经典平台跳跃手感"的硬性要求：
 *
 *   · 可变跳跃高度 —— 按住跳得高，短按跳得低（松开即截断上升速度）
 *   · 土狼时间 Coyote Time —— 刚离开平台边缘 ~100ms 内仍可起跳
 *   · 跳跃缓冲 Jump Buffer —— 落地前 ~100ms 按下的跳跃会被记住并补发
 *   · 加速度/摩擦分离 —— 地面加速快、空中加速慢，保留一点惯性
 *
 * 形态状态机：
 *   小猫(small) --吃鱼罐头--> 大猫(big) --受伤--> 小猫 --再受伤--> 死亡
 *   吃无敌星后进入 invincible：闪烁 + 接触敌人即秒杀
 */
import { PHYS, CAT, CAT_FRAMES } from '../utils/constants.js';
import { audio } from '../utils/audio.js';

/** 素材里两种形态的脚底都画在 y=60（帧高 64），据此得到统一的锚点 */
const FRAME_H = 64;
const FEET_Y = 60;
const ORIGIN_Y = FEET_Y / FRAME_H;

export default class Cat extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'cat_small', CAT_FRAMES.IDLE[0]);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, ORIGIN_Y);
    this.setDepth(20);

    const body = this.body;
    body.setMaxVelocity(PHYS.RUN_SPEED * 1.2, PHYS.MAX_FALL);
    body.setDragX(PHYS.GROUND_DRAG);
    body.useDamping = false;

    // —— 状态 ——
    this.form = 'small';            // 'small' | 'big'
    this.isDead = false;
    this.isInvincible = false;
    this.isHurt = false;
    this.frozen = false;            // 过关演出 / 假通关演出时锁住操作
    this.facing = 1;                // 1 右, -1 左
    this.crouching = false;
    this.starUntil = 0;
    this.invulnUntil = 0;

    // —— 手感计时器（毫秒）——
    this.lastGroundedAt = -Infinity;
    this.jumpPressedAt = -Infinity;
    this.jumpHeld = false;
    this.wasOnGround = true;
    this.fallPeak = 0;          // 空中下落的峰值速度（落地尘土大小用）
    this.juiceTween = null;     // 挤压拉伸动画（同一时间只保留一个）

    this.applyForm('small', { silent: true });
    this.setupInput(scene);
    this.playAnim('idle');
  }

  // =========================================================================
  // 输入
  // =========================================================================
  setupInput(scene) {
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });
    // 防止空格/方向键滚动页面
    kb.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
  }

  get leftDown() {
    return this.keys.left.isDown || this.keys.a.isDown;
  }

  get rightDown() {
    return this.keys.right.isDown || this.keys.d.isDown;
  }

  get downDown() {
    return this.keys.down.isDown || this.keys.s.isDown;
  }

  get runDown() {
    return this.keys.shift.isDown;
  }

  get jumpJustDown() {
    const k = this.keys;
    return (
      Phaser.Input.Keyboard.JustDown(k.space) ||
      Phaser.Input.Keyboard.JustDown(k.up) ||
      Phaser.Input.Keyboard.JustDown(k.w)
    );
  }

  get jumpDown() {
    const k = this.keys;
    return k.space.isDown || k.up.isDown || k.w.isDown;
  }

  // =========================================================================
  // 形态
  // =========================================================================
  applyForm(form, { silent = false } = {}) {
    this.form = form;
    const tex = form === 'big' ? 'cat_big' : 'cat_small';
    if (this.texture.key !== tex) this.setTexture(tex, this.frame.name);
    this.refreshBody();
    if (!silent) this.updateAnimState();
  }

  /** 按当前形态/蹲下状态重设碰撞盒 */
  refreshBody() {
    const b = this.body;
    if (!b) return;
    let w, h;
    if (this.form === 'big') {
      w = this.crouching ? CAT.BIG_W + 4 : CAT.BIG_W;
      h = this.crouching ? CAT.CROUCH_H : CAT.BIG_H;
    } else {
      w = CAT.SMALL_W;
      h = CAT.SMALL_H;
    }
    b.setSize(w, h);
    // 让碰撞盒底部正好落在脚底锚点上
    b.setOffset(FRAME_H / 2 - w / 2, FEET_Y - h);
  }

  grow() {
    if (this.isDead) return;
    if (this.form === 'big') {
      this.scene.addScore(200);
      return;
    }
    this.applyForm('big');
    this.setTintFlash(0xffffff, 120, 3);
    audio.play('powerup');
    this.scene.onCatGrew();
  }

  /** 进入无敌星状态 */
  makeInvincible(ms) {
    this.starUntil = this.scene.time.now + ms;
    this.isInvincible = true;
    this.scene.onStarStart();
  }

  // =========================================================================
  // 受伤 / 死亡
  // =========================================================================
  hurt() {
    if (this.isDead || this.isFrozenByInvuln() || this.isInvincible) return;
    if (this.form === 'big') {
      // 大猫受伤 → 退化回小猫，而不是直接死
      this.applyForm('small');
      this.startInvuln(CAT.HURT_INVULN_MS);
      audio.play('hurt');
      this.setTintFlash(0xff8888, 90, 6);
      this.scene.onCatHurt();
    } else {
      this.die();
    }
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.crouching = false;
    audio.play('die');
    this.body.checkCollision.none = true;
    this.body.setAllowGravity(true);
    this.body.setVelocity(0, PHYS.DEATH_POP);
    this.setTexture(this.form === 'big' ? 'cat_big' : 'cat_small', CAT_FRAMES.HURT[0]);
    this.setTint(0xffb0b0);
    this.scene.onCatDied();
  }

  startInvuln(ms) {
    this.invulnUntil = this.scene.time.now + ms;
  }

  isFrozenByInvuln() {
    return this.scene.time.now < this.invulnUntil;
  }

  setTintFlash(color, stepMs, times) {
    let n = 0;
    const timer = this.scene.time.addEvent({
      delay: stepMs,
      repeat: times * 2 - 1,
      callback: () => {
        if (!this.active) return;
        n++;
        if (n % 2 === 1) this.setTint(color);
        else this.clearTint();
        if (n >= times * 2) this.clearTint();
      },
    });
    return timer;
  }

  // =========================================================================
  // 每帧更新
  // =========================================================================
  update(time, delta) {
    const body = this.body;
    if (!body) return;
    const dt = delta / 1000;

    // 无敌星计时
    if (this.isInvincible && time >= this.starUntil) {
      this.isInvincible = false;
      this.clearTint();
      this.scene.onStarEnd();
    }
    if (this.isInvincible) {
      // 彩虹闪烁
      const hue = (time / 4) % 360;
      this.setTint(Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.66).color);
    } else if (this.isFrozenByInvuln()) {
      this.setAlpha(Math.floor(time / 70) % 2 === 0 ? 0.35 : 1);
    } else if (!this.isDead) {
      this.setAlpha(1);
      if (!this.isInvincible) this.clearTint();
    }

    if (this.isDead || this.frozen) {
      this.updateAnimState();
      return;
    }

    const onGround = body.blocked.down || body.touching.down;

    // —— 土狼时间 ——
    if (onGround) this.lastGroundedAt = time;
    const canCoyote = time - this.lastGroundedAt <= PHYS.COYOTE_MS;

    // —— 蹲下（只有大猫能蹲）——
    const wantCrouch = this.downDown && this.form === 'big' && onGround;
    if (wantCrouch !== this.crouching) {
      // 起身前先确认头顶没有东西
      if (!wantCrouch && !this.canStandUp()) {
        // 站不起来，继续蹲着
      } else {
        this.crouching = wantCrouch;
        this.refreshBody();
      }
    }

    // —— 水平移动 ——
    const locked = this.crouching;
    let dir = 0;
    if (!locked) {
      if (this.leftDown) dir -= 1;
      if (this.rightDown) dir += 1;
    }
    const maxSpeed = this.runDown ? PHYS.RUN_SPEED : PHYS.WALK_SPEED;
    const accel = onGround ? PHYS.GROUND_ACCEL : PHYS.AIR_ACCEL;

    if (dir !== 0) {
      this.facing = dir;
      // 直接朝目标速度靠拢，并在到达时精确钳制。
      // （不用 setAccelerationX：那样加速度会一直把速度顶到 maxVelocity，
      //   导致"走路"实际跑得比 WALK_SPEED 快，手感会飘。）
      const target = dir * maxSpeed;
      let v = body.velocity.x + dir * accel * dt;
      v = dir > 0 ? Math.min(v, target) : Math.max(v, target);
      body.setVelocityX(v);
      body.setAccelerationX(0);
      body.setDragX(0);
    } else {
      body.setAccelerationX(0);
      body.setDragX(onGround ? PHYS.GROUND_DRAG : PHYS.AIR_DRAG);
    }
    this.setFlipX(this.facing < 0);

    // —— 跳跃 ——
    if (this.jumpJustDown) this.jumpPressedAt = time;
    const buffered = time - this.jumpPressedAt <= PHYS.JUMP_BUFFER_MS;

    if (buffered && canCoyote && !this.crouching) {
      let vy = PHYS.JUMP_VELOCITY;
      // 奔跑时跳得更高一点，让高速冲刺更有回报
      if (Math.abs(body.velocity.x) > PHYS.WALK_SPEED + 30) vy = PHYS.JUMP_BOOST;
      body.setVelocityY(vy);
      this.jumpHeld = true;
      this.jumpPressedAt = -Infinity;
      this.lastGroundedAt = -Infinity;
      this.juiceStretch();
      if (this.scene.dust) this.scene.dust(this.x, this.y, 3);
      audio.play('jump');
      this.scene.onCatJumped();
    }

    // —— 可变跳跃高度：松开跳跃键立刻截断上升 ——
    if (this.jumpHeld) {
      if (!this.jumpDown) {
        if (body.velocity.y < PHYS.JUMP_CUT) body.setVelocityY(PHYS.JUMP_CUT);
        this.jumpHeld = false;
      } else if (body.velocity.y >= 0) {
        this.jumpHeld = false;
      }
    }

    // —— 落地缓冲帧 ——
    if (!this.wasOnGround && onGround) {
      this.landedAt = time;
      // 落地挤压 + 尘土：下落越快，效果越明显
      const impact = Phaser.Math.Clamp((this.fallPeak - 220) / 500, 0, 1);
      this.fallPeak = 0;
      if (impact > 0.02) {
        this.juiceSquash(impact);
        if (this.scene.dust) {
          this.scene.dust(this.x, this.y, 2 + Math.round(impact * 4));
        }
      }
    }
    if (!onGround) this.fallPeak = Math.max(this.fallPeak, body.velocity.y);
    this.wasOnGround = onGround;

    this.updateAnimState(onGround);
  }

  // =========================================================================
  // 挤压拉伸（跳跃/落地的小动画，纯视觉，不影响碰撞盒）
  // 猫的 origin 在脚底（0.5, 0.94），所以缩放时脚不会陷进地里
  // =========================================================================
  juiceStretch() {
    if (this.isDead) return;
    if (this.juiceTween) this.juiceTween.remove();
    this.setScale(1.12, 0.88);
    this.juiceTween = this.scene.tweens.add({
      targets: this, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut',
    });
  }

  juiceSquash(strength = 1) {
    if (this.isDead) return;
    if (this.juiceTween) this.juiceTween.remove();
    this.setScale(1 + 0.14 * strength, 1 - 0.18 * strength);
    this.juiceTween = this.scene.tweens.add({
      targets: this, scaleX: 1, scaleY: 1, duration: 190, ease: 'Back.easeOut',
    });
  }

  canStandUp() {
    const b = this.body;
    const w = CAT.BIG_W;
    const h = CAT.BIG_H;
    const top = b.bottom - h;
    const probe = new Phaser.Geom.Rectangle(b.center.x - w / 2, top, w, h - CAT.CROUCH_H);
    return !this.scene.solidsOverlapping(probe);
  }

  // =========================================================================
  // 动画
  // =========================================================================
  updateAnimState(onGround) {
    if (this.isDead) return;
    const body = this.body;
    const prefix = this.form === 'big' ? 'big' : 'small';
    const grounded = onGround ?? (body.blocked.down || body.touching.down);

    let anim;
    if (this.crouching) anim = 'crouch';
    else if (!grounded) anim = body.velocity.y < -30 ? 'jump' : 'fall';
    else if (this.landedAt && this.scene.time.now - this.landedAt < 90
             && Math.abs(body.velocity.x) > 40) anim = 'land';
    else if (Math.abs(body.velocity.x) > 12) anim = 'walk';
    else anim = 'idle';

    this.playAnim(anim);
    // 走路动画速度跟着实际速度走，慢走时不会"划水"
    if (anim === 'walk') {
      const speed = Phaser.Math.Clamp(Math.abs(body.velocity.x) / PHYS.WALK_SPEED, 0.6, 1.9);
      this.anims.timeScale = speed;
    } else {
      this.anims.timeScale = 1;
    }
  }

  playAnim(name) {
    const prefix = this.form === 'big' ? 'big' : 'small';
    const key = `${prefix}-${name}`;
    if (this.anims.currentAnim && this.anims.currentAnim.key === key) return;
    if (this.scene.anims.exists(key)) this.play(key, true);
  }

  // =========================================================================
  // 工具
  // =========================================================================
  /** 把主角放回出生点（重开时用） */
  respawnAt(x, y) {
    this.isDead = false;
    this.frozen = false;
    this.crouching = false;
    this.isInvincible = false;
    this.invulnUntil = 0;
    this.starUntil = 0;
    this.setAlpha(1);
    this.clearTint();
    this.setScale(1);
    this.juiceTween = null;
    this.fallPeak = 0;
    this.setPosition(x, y);
    this.body.setAllowGravity(true);
    this.body.checkCollision.none = false;
    this.body.setVelocity(0, 0);
    this.body.setAcceleration(0, 0);
    this.applyForm('small', { silent: true });
    this.refreshBody();
    this.lastGroundedAt = -Infinity;
    this.jumpPressedAt = -Infinity;
    this.jumpHeld = false;
    this.landedAt = 0;
    this.playAnim('idle');
  }

  get isBig() {
    return this.form === 'big';
  }
}
