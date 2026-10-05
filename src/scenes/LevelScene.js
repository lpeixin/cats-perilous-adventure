/**
 * LevelScene —— 关卡核心场景
 * ---------------------------------------------------------------
 * 职责：把「ASCII 关卡数据」变成可玩的世界，并承载所有玩法规则。
 *
 * 场景对外暴露了一组给陷阱组件调用的方法（isSolidAt / removeSolid /
 * collapseAround / popText / spawnDebris / onTrapTriggered …），
 * 这样陷阱组件本身不需要知道场景内部是怎么实现的。
 */
import {
  TILE, GAME_WIDTH, GAME_HEIGHT, COLORS, LEVELS, TRAP, PHYS,
} from '../utils/constants.js';
import { parseLevel } from '../utils/levelLoader.js';
import { audio } from '../utils/audio.js';
import { Save } from '../utils/save.js';
import { t } from '../utils/i18n.js';
import Cat from '../entities/Cat.js';
import { createEnemy } from '../entities/Enemy.js';
import {
  InvisibleBlock, CrumbleTile, ConveyorTile, SkyDropper, PipeAmbush, GoalPole,
} from '../entities/Trap.js';
import Hud from '../ui/Hud.js';

const FONT = 'PingFang SC, Helvetica Neue, Arial, sans-serif';
const DEPTH = { bg: -20, tile: 10, enemy: 15, item: 12, cat: 20, fx: 40, ambient: 150 };

export default class LevelScene extends Phaser.Scene {
  constructor() {
    super('Level');
  }

  init(data) {
    this.levelId = data.levelId || 1;
    // 这些状态在"重开本关"时会被带过来，不会被重置
    this.deaths = data.deaths || 0;
    this.elapsed = data.elapsed || 0;
    this.score = data.score || 0;
    this.trapLog = data.trapLog || {};
    this.started = false;
  }

  create() {
    const cfg = LEVELS.find((l) => l.id === this.levelId) || LEVELS[0];
    this.levelCfg = cfg;

    const raw = this.cache.json.get(cfg.key);
    if (!raw) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2,
        t('err.levelLoad', { file: cfg.file }), { fontFamily: FONT, fontSize: '18px', color: '#ff9a9a' })
        .setOrigin(0.5);
      return;
    }
    this.level = parseLevel(raw);

    this.physics.world.setBounds(0, 0, this.level.width * TILE, this.level.height * TILE + 600);
    this.physics.world.gravity.y = PHYS.GRAVITY;

    this.buildBackground();
    this.buildTiles();
    // 主角必须先于实体创建：实体在生成时就要和主角挂上接触判定
    this.buildCat();
    this.buildEntities();
    this.buildCamera();
    this.buildColliders();
    this.buildHud();
    this.bindKeys();

    this.coins = 0;
    this.isRestarting = false;
    this.paused = false;
    this.levelDone = false;

    this.hud.setLevelName(t(cfg.nameKey), t(cfg.subtitleKey));
    this.hud.setDeaths(this.deaths);
    this.hud.setCoins(0);
    this.hud.setForm('small', 0);
    this.hud.setTime(this.elapsed);

    this.cameras.main.fadeIn(300, 43, 32, 36);

    // 暗角氛围层：在 HUD 之下、游戏画面之上，四周轻轻压暗
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
      .setScrollFactor(0).setDepth(DEPTH.ambient).setAlpha(0.8);

    this.started = true;
  }

  // =========================================================================
  // 背景（三层视差）
  // =========================================================================
  buildBackground() {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_sky')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0).setDepth(DEPTH.bg);
    // 顶部渐变：让平涂的蓝天有一点纵深（scrollFactor=0，跟随屏幕）
    this.add.image(GAME_WIDTH / 2, 0, 'skyGrad')
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.bg + 1);

    this.bgFar = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg_far')
      .setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0).setDepth(DEPTH.bg + 2).setAlpha(0.95);

    this.bgMid = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg_mid')
      .setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0).setDepth(DEPTH.bg + 3);

    // 地下"深色底衬"。
    // 三个背景层都是 scrollFactor=0 的整屏图，而坑里是空的 ——
    // 没有这一层的话，任何坑都会露出一整块视差中景（树、山），
    // 看起来像"地面被开了一扇窗"，非常出戏。铺一层深棕就立刻读成"洞"了。
    const groundTiles = this.level.tiles.filter((t) => t.type === 'ground' || t.type === 'dirt');
    if (groundTiles.length) {
      const surfaceRow = Math.min(...groundTiles.map((t) => t.cy));
      const top = surfaceRow * TILE;
      const bottom = this.level.height * TILE;
      this.add.rectangle(0, top, this.level.width * TILE, bottom - top, 0x2b1f19)
        .setOrigin(0, 0).setDepth(DEPTH.bg + 5);
      // 再压一道更深的，做出"越往下越黑"的层次
      this.add.rectangle(0, top + TILE * 2, this.level.width * TILE,
        Math.max(0, bottom - top - TILE * 2), 0x1d1512)
        .setOrigin(0, 0).setDepth(DEPTH.bg + 6);
    }

    this.bgFar.tilePositionX = this.level.width * TILE * 0.0;
  }

  // =========================================================================
  // 瓦片
  // =========================================================================
  buildTiles() {
    this.solids = this.physics.add.staticGroup();
    this.hazards = this.physics.add.staticGroup();
    this.solidMap = new Map();       // "cx,cy" → 瓦片对象（O(1) 查询）
    this.trapTiles = [];             // 需要每帧 update 的瓦片型陷阱

    for (const t of this.level.tiles) {
      const x = t.cx * TILE + TILE / 2;
      const y = t.cy * TILE + TILE / 2;
      const obj = this.solids.create(x, y, t.texture, 0);
      obj.setDepth(DEPTH.tile);
      obj.tileData = t;
      t.obj = obj;
      this.solidMap.set(`${t.cx},${t.cy}`, obj);

      if (t.hidden) {
        const ib = new InvisibleBlock(this, obj);
        t.handler = ib;
      } else if (t.crumble) {
        const ct = new CrumbleTile(this, obj);
        t.handler = ct;
        this.trapTiles.push(ct);
      } else if (t.conveyor) {
        const cv = new ConveyorTile(this, obj);
        t.handler = cv;
        this.trapTiles.push(cv);
      } else if (t.type === 'question' || t.type === 'fakeQuestion') {
        // 让问号砖轻轻闪光，暗示"这里有东西"（也可能是个陷阱）
        obj.setTexture('question', 0);
        this.tweens.add({
          targets: obj,
          alpha: { from: 1, to: 0.86 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // 即死地形
    for (const d of this.level.deadly) {
      const x = d.cx * TILE + TILE / 2;
      const y = d.cy * TILE + TILE / 2;
      const obj = this.hazards.create(x, y, d.texture, 0);
      obj.setDepth(DEPTH.tile - 1);
      if (d.texture === 'lava') obj.play('lava-flow');
      else if (d.texture === 'water') obj.play('water-flow');
    }
  }

  /** 把静态瓦片从世界里摘掉（碎裂、塌陷、被顶碎都走这里） */
  removeSolid(obj) {
    if (!obj || !obj.active) return;
    const t = obj.tileData;
    if (t) {
      t.removed = true;
      this.solidMap.delete(`${t.cx},${t.cy}`);
    }
    this.solids.remove(obj, true, true);
  }

  isSolidAt(worldX, worldY) {
    const cx = Math.floor(worldX / TILE);
    const cy = Math.floor(worldY / TILE);
    return this.solidMap.has(`${cx},${cy}`);
  }

  solidsOverlapping(rect) {
    const x0 = Math.floor(rect.x / TILE);
    const x1 = Math.floor((rect.x + rect.width) / TILE);
    const y0 = Math.floor(rect.y / TILE);
    const y1 = Math.floor((rect.y + rect.height) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.solidMap.has(`${cx},${cy}`)) return true;
      }
    }
    return false;
  }

  /** 假通关演出用：把某处的地板整片抽掉 */
  collapseAround(worldX, tileRadius) {
    const cx = Math.floor(worldX / TILE);
    const victims = [];
    for (let dx = -tileRadius; dx <= tileRadius; dx++) {
      for (let cy = 0; cy < this.level.height; cy++) {
        const obj = this.solidMap.get(`${cx + dx},${cy}`);
        if (obj) victims.push(obj);
      }
    }
    victims.forEach((obj, i) => {
      this.time.delayedCall(i * 26, () => {
        if (!obj.active) return;
        this.spawnDebris(obj.x, obj.y, 0xb4bcc8);
        audio.play('crumble');
        this.removeSolid(obj);
      });
    });
  }

  // =========================================================================
  // 实体
  // =========================================================================
  buildEntities() {
    // 注意：这里刻意**不使用** Arcade Physics Group。
    // Arcade Group 在 add() 时会用 defaults 覆盖子对象的 body 属性
    // （把 velocity / allowGravity 重置回默认值），会把"无重力飞行"的
    // 乌鸦和跳跳鱼打回原形。用普通数组 + 逐对象 overlap 更可控。
    this.enemyList = [];
    this.itemList = [];
    this.skyDroppers = [];
    this.pipeAmbushes = [];
    this.goals = [];

    for (const e of this.level.entities) {
      const x = e.cx * TILE + TILE / 2;
      const y = e.cy * TILE + TILE / 2;

      switch (e.type) {
        case 'goldfish':
        case 'star':
        case 'can':
          this.spawnCollectible(x, y, e.type, { floating: true });
          break;

        case 'yarn':
        case 'crow':
        case 'fish':
        case 'mushroom': {
          const en = createEnemy(this, x, y, e.type, {});
          if (en) this.addEnemy(en);
          break;
        }

        case 'pipeAmbush': {
          // 标记点就放在管道正上方那一格
          const pipeTop = this.findPipeTopBelow(e.cx, e.cy);
          const px = e.cx * TILE + TILE / 2;
          const py = (pipeTop !== null ? pipeTop : e.cy + 1) * TILE;
          this.pipeAmbushes.push(new PipeAmbush(this, px + TILE / 2, py + 4));
          break;
        }

        case 'evilCloud':
        case 'evilSun':
          this.skyDroppers.push(
            new SkyDropper(this, x, y, e.type === 'evilSun' ? 'sun' : 'cloud')
          );
          break;

        case 'softCloud': {
          const c = this.add.image(x, y, 'cloud_soft')
            .setDepth(DEPTH.bg + 4).setAlpha(0.95);
          this.tweens.add({
            targets: c, y: y + 9, duration: 2400 + Math.random() * 900,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
          break;
        }

        case 'goalFake':
        case 'goalReal': {
          const pole = new GoalPole(this, e.cx, e.cy, e.type === 'goalFake');
          this.goals.push(pole);
          break;
        }

        default:
          break;
      }
    }
  }

  /** 登记一个敌人，并挂上它与猫的接触判定 */
  addEnemy(en) {
    if (!en) return;
    this.enemyList.push(en);

    // 地面敌人必须和地形做**碰撞**，而不只是和猫做 overlap。
    // 少了这一条，敌人会直接穿过地板一路往下掉：
    // 巡逻没了、blocked.down 永远为 false、边缘掉头也永远不会触发。
    // 乌鸦是"无重力、按剧本飞"的，加了反而会被地形弹开，所以排除掉。
    if (en.enemyType !== 'crow') {
      this.physics.add.collider(en, this.solids);
    }

    this.physics.add.overlap(this.cat, en, (c, e) => this.onEnemyContact(c, e));
  }

  /** 在标记点下方找到管道的最高一格（标记点自己占的那一格要跳过） */
  findPipeTopBelow(cx, cy) {
    for (let y = cy + 1; y < this.level.height; y++) {
      const ch = this.level.rows[y] ? this.level.rows[y][cx] : ' ';
      if (ch === 'P') return y;
      if (ch !== ' ') return null;
    }
    return null;
  }

  /** 生成一个收集品。floating=true 表示它悬在空中（关卡里直接摆放的） */
  spawnCollectible(x, y, kind, opts = {}) {
    const tex = kind === 'star' ? 'item_star' : kind === 'can' ? 'item_can' : 'item_goldfish';
    const anim = kind === 'star' ? 'star-spin' : kind === 'can' ? 'can-shine' : 'goldfish-swim';
    const s = this.physics.add.sprite(x, y, tex, 0);
    s.setDepth(DEPTH.item);
    s.collectKind = kind;
    s.play(anim);
    this.itemList.push(s);
    this.physics.add.overlap(this.cat, s, (c, it) => this.onItemContact(c, it));

    if (opts.floating) {
      s.body.setAllowGravity(false);
      s.body.setCircle(12, s.width / 2 - 12, s.height / 2 - 12);
      this.tweens.add({
        targets: s, y: y - 6, duration: 1100 + Math.random() * 400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else {
      // 从砖块里顶出来的：先向上弹一段，然后自由落体
      s.body.setAllowGravity(true);
      s.body.setVelocity(0, -320);
      s.body.setSize(24, 24);
      s.body.setOffset((s.width - 24) / 2, (s.height - 24) / 2);
    }
    return s;
  }

  // =========================================================================
  // 主角 & 相机
  // =========================================================================
  buildCat() {
    const sx = this.level.spawn.x * TILE + TILE / 2;
    const sy = (this.level.spawn.y + 1) * TILE;
    this.cat = new Cat(this, sx, sy);
    this.cat.setDepth(DEPTH.cat);
    this.cat.body.setCollideWorldBounds(false);
  }

  buildCamera() {
    const w = this.level.width * TILE;
    const h = this.level.height * TILE;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, w, Math.max(h, GAME_HEIGHT));
    cam.startFollow(this.cat, true, 0.16, 0.14);
    cam.setDeadzone(90, 70);
    cam.setFollowOffset(0, 40);
  }

  // =========================================================================
  // 碰撞
  // =========================================================================
  buildColliders() {
    // 猫 × 地形
    this.physics.add.collider(this.cat, this.solids, (cat, tile) => this.onTileContact(cat, tile));

    // 猫 × 即死地形
    this.physics.add.overlap(this.cat, this.hazards, () => {
      if (!this.cat.isDead && !this.cat.isInvincible) this.cat.die();
    });

    // 猫 × 敌人 / 收集品的判定在实体创建时就已经逐个挂好（见 addEnemy / spawnCollectible）

    // 猫 × 天空掉落物：碰到即死；同时让它砸到地面上会真的"摔碎"
    for (const d of this.skyDroppers) {
      this.physics.add.overlap(this.cat, d.sprite, () => {
        if (d.triggered && !this.cat.isDead) d.onHitCat();
      });
      this.physics.add.collider(d.sprite, this.solids, () => d.onLand());
    }

    // 猫 × 终点旗杆
    for (const g of this.goals) {
      this.physics.add.overlap(this.cat, g.zone, () => g.onTouch(this.cat));
    }
  }

  /** 地形接触：顶砖块 / 踩碎裂地板 / 踩传送带 / 撞隐形砖 */
  onTileContact(cat, tile) {
    const t = tile.tileData;
    if (!t || t.removed) return;
    const body = cat.body;
    const cb = tile.body;

    // —— 从下方顶 ——
    const bumped = body.velocity.y < 0 && body.top >= cb.bottom - 14;
    if (bumped) {
      if (t.hidden) {
        t.handler.reveal();
      } else if (t.type === 'question' || t.type === 'fakeQuestion') {
        this.bumpQuestionBlock(tile);
      } else if (t.type === 'brick' && cat.isBig) {
        this.breakBrick(tile);
      } else {
        audio.play('bump');
        this.tweenBump(tile);
      }
      return;
    }

    // —— 站在上面 ——
    const standing = body.velocity.y >= -20 && Math.abs(body.bottom - cb.top) < 12;
    if (standing) {
      if (t.hidden) t.handler.reveal();
      if (t.crumble && t.handler) t.handler.step();
      if (t.conveyor && t.handler) t.handler.step();
    }
  }

  tweenBump(tile) {
    const y0 = tile.y;
    this.tweens.add({
      targets: tile, y: y0 - 9, duration: 70, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => { tile.y = y0; if (tile.body) tile.body.updateFromGameObject(); },
    });
  }

  bumpQuestionBlock(tile) {
    const t = tile.tileData;
    if (t.hit) {
      audio.play('bump');
      this.tweenBump(tile);
      return;
    }
    t.hit = true;
    this.tweens.killTweensOf(tile);
    tile.setAlpha(1);
    tile.setTexture('question_used');
    audio.play('bump');
    this.tweenBump(tile);

    const item = t.item || 'goldfish';
    if (item === 'trapMushroom') {
      // 假道具真陷阱：顶出来的是会扑咬的蘑菇怪
      this.onTrapTriggered('fakeItem');
      const en = createEnemy(this, tile.x, tile.y - TILE * 0.75, 'mushroom', { emerging: true });
      if (en) {
        this.addEnemy(en);
        en.body.setAllowGravity(false);
        this.time.delayedCall(230, () => {
          if (en.active) {
            en.body.setAllowGravity(true);
            en.body.setVelocityY(-180);
          }
        });
      }
    } else if (item === 'goldfish') {
      // 经典"金币砖"：金鱼弹出来转一圈就消失，只加计数
      this.popCoin(tile.x, tile.y - TILE * 0.6);
    } else {
      this.spawnCollectible(tile.x, tile.y - TILE * 0.9, item, { floating: false });
    }
  }

  popCoin(x, y) {
    const s = this.add.sprite(x, y, 'item_goldfish', 0).setDepth(DEPTH.fx);
    s.play('goldfish-swim');
    audio.play('coin');
    this.addCoins(1);
    this.tweens.add({
      targets: s, y: y - TILE * 1.5, duration: 260, ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: s, y: y + TILE * 0.4, alpha: 0, duration: 220, ease: 'Quad.easeIn',
          onComplete: () => s.destroy(),
        });
      },
    });
  }

  breakBrick(tile) {
    audio.play('brick');
    this.spawnDebris(tile.x, tile.y, 0xd07a5c, 6);
    this.addScore(50);
    this.removeSolid(tile);
  }

  /** 猫 × 敌人 */
  onEnemyContact(cat, enemy) {
    if (cat.isDead || enemy.dying || !enemy.active) return;
    if (!cat.body || !enemy.body) return;

    if (cat.isInvincible) {
      enemy.killByStar();
      this.addScore(200);
      this.popText(enemy.x, enemy.y - 20, '+200', '#ffc842');
      return;
    }

    const body = cat.body;
    const ebody = enemy.body;
    // 经典判定：猫正在下落，并且脚底还在敌人身体中线之上 → 踩头。
    // （注意方向：屏幕坐标 y 向下增长，"在上方"意味着 y 更小。）
    const falling = body.velocity.y > 0;
    const feetAboveCenter = body.bottom <= ebody.center.y + 10;

    if (enemy.stompable && falling && feetAboveCenter) {
      enemy.stomp();
      const held = cat.jumpDown;
      cat.body.setVelocityY(held ? PHYS.STOMP_BOUNCE_HELD : PHYS.STOMP_BOUNCE);
      cat.juiceStretch();
      this.addScore(100);
      this.popText(enemy.x, enemy.y - 20, '+100', '#8ed48c');
    } else {
      cat.hurt();
    }
  }

  /** 猫 × 收集品 */
  onItemContact(cat, item) {
    if (!item.active || cat.isDead) return;
    const kind = item.collectKind;
    this.popText(item.x, item.y - 14, kind === 'goldfish' ? '+1' : '！',
                 kind === 'goldfish' ? '#ffc842' : '#8ed48c');

    if (kind === 'goldfish') {
      audio.play('coin');
      this.addCoins(1);
      this.addScore(10);
      this.sparkle(item.x, item.y, 0xffc842);
      item.destroy();
    } else if (kind === 'can') {
      cat.grow();
      this.addScore(150);
      this.sparkle(item.x, item.y, 0xd88034);
      item.destroy();
    } else if (kind === 'star') {
      audio.play('star');
      cat.makeInvincible(9000);
      this.addScore(150);
      this.sparkle(item.x, item.y, 0xffe28a);
      item.destroy();
    }
  }

  // =========================================================================
  // 特效小工具
  // =========================================================================
  popText(x, y, msg, color = '#fffdfa') {
    const t2 = this.add.text(x, y, msg, {
      fontFamily: FONT, fontSize: '17px', color, fontStyle: 'bold',
      stroke: '#3e2e32', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.fx);
    t2.setScale(0.7);
    this.tweens.add({
      targets: t2, scale: 1, duration: 130, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: t2, y: y - 34, alpha: 0, duration: 620, delay: 90, ease: 'Quad.easeOut',
      onComplete: () => t2.destroy(),
    });
  }

  /** 脚下的尘土（起跳 / 落地时的一小撮，让动作"落地有声"） */
  dust(x, y, n = 4, tint = 0xd9cfc0) {
    for (let i = 0; i < n; i++) {
      const s = this.add.circle(
        x + Phaser.Math.Between(-9, 9), y - Phaser.Math.Between(0, 4),
        Phaser.Math.FloatBetween(2.5, 5), tint, 0.85,
      ).setDepth(DEPTH.fx - 1);
      this.tweens.add({
        targets: s,
        x: s.x + Phaser.Math.FloatBetween(-28, 28),
        y: s.y - Phaser.Math.FloatBetween(4, 20),
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(260, 430),
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  spawnDebris(x, y, color, n = 4) {
    for (let i = 0; i < n; i++) {
      const s = this.add.rectangle(x, y, 10, 10, color).setDepth(DEPTH.fx);
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.Between(90, 220);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * spd * 0.55,
        y: y + Math.sin(ang) * spd * 0.4 - 40,
        angle: Phaser.Math.Between(-260, 260),
        alpha: 0,
        duration: Phaser.Math.Between(380, 620),
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  sparkle(x, y, color) {
    for (let i = 0; i < 7; i++) {
      const s = this.add.circle(x, y, Phaser.Math.Between(2, 4), color, 0.9)
        .setDepth(DEPTH.fx);
      const ang = (i / 7) * Math.PI * 2;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * 34,
        y: y + Math.sin(ang) * 34,
        alpha: 0,
        duration: 380,
        onComplete: () => s.destroy(),
      });
    }
  }

  // =========================================================================
  // HUD & 计分
  // =========================================================================
  buildHud() {
    this.hud = new Hud(this);
  }

  addCoins(n) {
    this.coins += n;
    this.hud.setCoins(this.coins);
  }

  addScore(n) {
    this.score += n;
  }

  // =========================================================================
  // 陷阱事件回调（由 Trap.js 调用；name 是 i18n 键，如 'skyDropper'）
  // =========================================================================
  onTrapTriggered(key) {
    if (!this.trapLog[key]) {
      this.trapLog[key] = 0;
      this.hud.toast(t('toast.blacklist', { name: t(`trap.${key}`) }), 1700, 0xb63c3c);
    }
    this.trapLog[key]++;
  }

  onTrapSprung(key) {
    this.popText(this.cat.x, this.cat.y - 60, t(`trap.${key}`), '#ff9a9a');
  }

  onFakeGoalStart() {
    this.cat.frozen = true;
    this.cat.body.setVelocityX(0);
    this.hud.toast(t('toast.fakeGoalStart'), 900, 0x3e8f5a);
    this.onTrapTriggered('fakeGoal');
  }

  onFakeGoalReveal() {
    this.cat.frozen = false;
    this.hud.toast(t('toast.fakeGoalReveal'), 2200, 0xb63c3c);
  }

  // =========================================================================
  // 主角事件
  // =========================================================================
  onCatJumped() {}
  onCatGrew() {
    this.hud.toast(t('toast.grow'), 1200, 0xd88034);
    this.hud.setForm('big', 0);
  }
  onCatHurt() {
    this.hud.setForm('small', 0);
  }
  onStarStart() {
    this.hud.toast(t('toast.star'), 1200, 0xde9a22);
  }
  onStarEnd() {}

  onCatDied() {
    this.deaths++;
    this.hud.setDeaths(this.deaths);
    Save.addDeaths(this.levelId, 1);
    this.cameras.main.shake(240, 0.009);
    this.dust(this.cat.x, this.cat.y, 8, 0xcfc4b4);
    this.isRestarting = true;
    this.cat.body.setAllowGravity(true);
    this.time.delayedCall(1150, () => this.restartLevel());
  }

  // =========================================================================
  // 重开 / 暂停 / 过关
  // =========================================================================
  restartLevel() {
    if (this.levelDone) return;
    const data = {
      levelId: this.levelId,
      deaths: this.deaths,
      elapsed: this.elapsed,
      score: this.score,
      trapLog: this.trapLog,
    };
    this.scene.restart(data);
  }

  completeLevel(cat) {
    if (this.levelDone) return;
    this.levelDone = true;
    this.cat.frozen = true;
    this.cat.body.setVelocity(0, 0);
    audio.play('goal');

    // 小演出：猫顺着旗杆滑下去
    this.tweens.add({
      targets: this.cat,
      y: cat.y + 96,
      duration: 620,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        const res = Save.recordClear(this.levelId, {
          timeMs: Math.round(this.elapsed),
          deaths: this.deaths,
          fish: this.coins,
        });
        this.cameras.main.fadeOut(340, 43, 32, 36);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('LevelComplete', {
            levelId: this.levelId,
            timeMs: Math.round(this.elapsed),
            deaths: this.deaths,
            coins: this.coins,
            score: this.score,
            trapLog: this.trapLog,
            record: res.record,
            isBestTime: res.isBestTime,
            isFewestDeaths: res.isFewestDeaths,
          });
        });
      },
    });
  }

  togglePause() {
    if (this.levelDone || this.cat.isDead) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause();
      this.scene.launch('Pause', { levelId: this.levelId, deaths: this.deaths, elapsed: this.elapsed, score: this.score, coins: this.coins });
      this.scene.pause();
    }
  }

  resumeFromPause() {
    this.paused = false;
    this.physics.world.resume();
  }

  // =========================================================================
  // 按键
  // =========================================================================
  bindKeys() {
    const kb = this.input.keyboard;
    kb.on('keydown-R', () => {
      if (this.levelDone) return;
      audio.play('select');
      this.restartLevel();
    });
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-M', () => {
      const m = audio.toggleMute();
      Save.setMuted(m);
      this.hud.toast(m ? t('toast.soundOff') : t('toast.soundOn'), 900);
    });
  }

  // =========================================================================
  // 主循环
  // =========================================================================
  update(time, delta) {
    if (!this.started || this.paused) return;

    // 视差
    const cam = this.cameras.main;
    this.bgFar.tilePositionX = cam.scrollX * 0.16;
    this.bgMid.tilePositionX = cam.scrollX * 0.42;

    // 计时（死亡重开也累计，这样"用时"才真实）
    if (!this.levelDone) this.elapsed += delta;
    this.hud.setTime(this.elapsed);
    if (this.cat) {
      this.hud.setForm(this.cat.form,
        this.cat.isInvincible ? Math.max(0, this.cat.starUntil - time) : 0);
    }

    this.cat.update(time, delta);

    // 敌人（Enemy 自己的 preUpdate 会驱动行为，这里不需要重复调用）

    // 瓦片型陷阱
    for (const t of this.trapTiles) t.update(delta);

    // 天空掉落物
    for (const d of this.skyDroppers) {
      if (!d.active) continue;
      d.update();
      if (d.triggered && d.sprite.active && d.sprite.y > this.physics.world.bounds.bottom) {
        d.destroy();
      }
    }

    // 水管伏兵
    for (const p of this.pipeAmbushes) p.update();

    // 掉出世界的敌人直接回收。
    // 敌人默认不碰撞世界边界，一旦掉进坑里就会永远自由落体 ——
    // 既白白占用物理步进，也会让"找一只地面上的敌人"这类逻辑踩到坑。
    const cullY = this.level.height * TILE + 200;
    for (const e of this.enemyList) {
      if (e.active && !e.dying && e.y > cullY) e.vanish();
    }

    // 掉出世界 = 死亡
    if (!this.cat.isDead
        && this.cat.y > this.level.height * TILE + 120) {
      this.cat.die();
    }

    // 主角静止在无敌星状态时也别让他卡住
    if (this.cat.isDead && this.cat.body) {
      this.cat.body.setVelocityX(0);
    }
  }
}
