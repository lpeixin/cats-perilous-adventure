/**
 * LevelScene —— 关卡核心场景（工作室级视效与氛围增强版）
 * ---------------------------------------------------------------
 * 职责：把「ASCII 关卡数据」变成可玩的世界，并承载所有玩法规则。
 *
 * 场景对外暴露了一组给陷阱组件调用的方法（isSolidAt / removeSolid /
 * collapseAround / popText / spawnDebris / onTrapTriggered …），
 * 这样陷阱组件本身不需要知道场景内部是怎么实现的。
 */
import {
  TILE, GAME_WIDTH, GAME_HEIGHT, LEVELS, PHYS,
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
const DEPTH = {
  bg: -20,
  propBack: 6,
  tile: 10,
  propFront: 11,
  item: 12,
  enemy: 15,
  cat: 20,
  fx: 40,
  ambient: 150,
};

/** 三大关卡的视觉氛围主题配置 */
const LEVEL_THEMES = {
  1: {
    skyKey: 'bg_sky_1',
    farTint: 0xffffff,
    midTint: 0xffffff,
    beamTint: 0xfff6d6,
    beamAlpha: 0.78,
    pitTop: 0x2c201a,
    pitDeep: 0x19120f,
    moteColor: 0xfff8d6,
    moteRise: false,
  },
  2: {
    skyKey: 'bg_sky_2',
    farTint: 0xffd2b8,
    midTint: 0xebb89c,
    beamTint: 0xffbe76,
    beamAlpha: 0.85,
    pitTop: 0x281b22,
    pitDeep: 0x160e14,
    moteColor: 0xffdf8e,
    moteRise: false,
  },
  3: {
    skyKey: 'bg_sky_3',
    farTint: 0xf2a694,
    midTint: 0xd68878,
    beamTint: 0xff9462,
    beamAlpha: 0.72,
    pitTop: 0x2b161a,
    pitDeep: 0x160a0d,
    moteColor: 0xff9c54,
    moteRise: true,
  },
};

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
    this.theme = LEVEL_THEMES[this.levelId] || LEVEL_THEMES[1];

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
    this.buildDecorations();
    // 主角必须先于实体创建：实体在生成时就要和主角挂上接触判定
    this.buildCat();
    this.buildEntities();
    this.buildAmbientParticles();
    this.buildCamera();
    this.buildColliders();
    this.buildHud();
    this.bindKeys();

    this.coins = 0;
    this.isRestarting = false;
    this.paused = false;
    this.levelDone = false;

    this.hud.setLevelName(t(cfg.nameKey), t(cfg.subtitleKey), this.levelId);
    this.hud.setDeaths(this.deaths);
    this.hud.setCoins(0);
    this.hud.setForm('small', 0);
    this.hud.setTime(this.elapsed);

    this.cameras.main.fadeIn(300, 36, 26, 30);

    // 暗角氛围层：在 HUD 之下、游戏画面之上，四周轻轻压暗
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
      .setScrollFactor(0).setDepth(DEPTH.ambient).setAlpha(0.76);

    this.started = true;
  }

  // =========================================================================
  // 背景（三层视差 + 主题天空 + 体积光束 + 深渊层次）
  // =========================================================================
  buildBackground() {
    const th = this.theme;
    const skyKey = this.textures.exists(th.skyKey) ? th.skyKey : 'bg_sky';

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, skyKey)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0).setDepth(DEPTH.bg);

    this.add.image(GAME_WIDTH / 2, 0, 'skyGrad')
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH.bg + 1);

    this.bgFar = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg_far')
      .setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0).setDepth(DEPTH.bg + 2).setAlpha(0.96)
      .setTint(th.farTint);

    // 丁达尔斜射阳光（夹在远山与中景林木之间，极具空间纵深感）
    if (this.textures.exists('sunbeams')) {
      this.sunbeams = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'sunbeams')
        .setScrollFactor(0).setDepth(DEPTH.bg + 2.5)
        .setTint(th.beamTint).setAlpha(th.beamAlpha);
    }

    this.bgMid = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg_mid')
      .setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setScrollFactor(0).setDepth(DEPTH.bg + 3)
      .setTint(th.midTint);

    // 地下"深渊岩层底衬"：让坑洞呈现真实的地下洞穴层次感
    const groundTiles = this.level.tiles.filter((t) => t.type === 'ground' || t.type === 'dirt');
    if (groundTiles.length) {
      const surfaceRow = Math.min(...groundTiles.map((t) => t.cy));
      const top = surfaceRow * TILE;
      const bottom = this.level.height * TILE;
      const worldW = this.level.width * TILE;

      const pitG = this.add.graphics().setDepth(DEPTH.bg + 5);
      pitG.fillGradientStyle(th.pitTop, th.pitTop, th.pitDeep, th.pitDeep, 1);
      pitG.fillRect(0, top, worldW, bottom - top + 240);

      // 地表分界暗影带与地下岩层横纹
      pitG.fillStyle(0x000000, 0.28);
      pitG.fillRect(0, top, worldW, 18);
      pitG.fillStyle(0x000000, 0.18);
      pitG.fillRect(0, top + TILE * 1.5, worldW, 10);
      pitG.fillRect(0, top + TILE * 3.0, worldW, 16);
    }

    this.bgFar.tilePositionX = 0;
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
        // 让问号砖呈现呼吸光泽动画
        obj.setTexture('question', 0);
        this.tweens.add({
          targets: obj,
          alpha: { from: 1, to: 0.88 },
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

  // =========================================================================
  // 场景生态装饰物（纯视觉，不参与任何物理碰撞，绝不影响机关与手感）
  // =========================================================================
  buildDecorations() {
    const occupiedAbove = new Set();
    for (const d of this.level.deadly) occupiedAbove.add(`${d.cx},${d.cy}`);
    for (const e of this.level.entities) {
      occupiedAbove.add(`${e.cx},${e.cy}`);
      occupiedAbove.add(`${e.cx - 1},${e.cy}`);
      occupiedAbove.add(`${e.cx + 1},${e.cy}`);
    }

    const isSafeGround = (cx, cy) => {
      const obj = this.solidMap.get(`${cx},${cy}`);
      if (!obj || !obj.tileData) return false;
      const td = obj.tileData;
      if (td.texture !== 'ground_top' || td.crumble || td.hidden || td.conveyor) return false;
      if (this.solidMap.has(`${cx},${cy - 1}`)) return false;
      if (occupiedAbove.has(`${cx},${cy - 1}`)) return false;
      return true;
    };

    // 1) 出生点旁的指路木牌（营造温暖的冒险启程感）
    const signCx = this.level.spawn.x + 2;
    const signCy = this.level.spawn.y + 1;
    if (this.solidMap.has(`${signCx},${signCy}`) && this.textures.exists('prop_sign')) {
      this.add.image(signCx * TILE + TILE / 2, signCy * TILE + 2, 'prop_sign')
        .setOrigin(0.5, 1).setDepth(DEPTH.propBack);
    }

    // 3) 沿途安全草地上的花草、木栅栏、灌木与庭院灯
    const rows = this.level.height;
    const cols = this.level.width;
    let skipUntilCx = -1;

    for (let cy = 1; cy < rows; cy++) {
      for (let cx = 2; cx < cols - 3; cx++) {
        if (cx < skipUntilCx) continue;
        if (Math.abs(cx - this.level.spawn.x) <= 3) continue;
        if (!isSafeGround(cx, cy)) continue;

        const hash = (cx * 73 + cy * 37 + this.levelId * 53) % 100;
        const surfaceY = cy * TILE + 2;
        const centerX = cx * TILE + TILE / 2;

        // 连续两格平坦安全地面：可摆放木栅栏或灌木丛
        if (hash < 13 && isSafeGround(cx + 1, cy) && this.textures.exists('prop_fence')) {
          this.add.image(centerX + TILE / 2, surfaceY, 'prop_fence')
            .setOrigin(0.5, 1).setDepth(DEPTH.propBack).setAlpha(0.95);
          skipUntilCx = cx + 3;
        } else if (hash >= 13 && hash < 24 && isSafeGround(cx + 1, cy) && this.textures.exists('prop_bush')) {
          this.add.image(centerX + TILE * 0.35, surfaceY + 2, 'prop_bush')
            .setOrigin(0.5, 1).setDepth(DEPTH.propBack);
          skipUntilCx = cx + 2;
        } else if (hash >= 24 && hash < 31 && this.levelId >= 2 && this.textures.exists('prop_lantern')) {
          const lamp = this.add.image(centerX, surfaceY + 2, 'prop_lantern')
            .setOrigin(0.5, 1).setDepth(DEPTH.propBack);
          this.tweens.add({
            targets: lamp, alpha: { from: 0.9, to: 1 }, duration: 1200 + (cx % 5) * 200,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
          skipUntilCx = cx + 3;
        } else if (hash >= 31 && hash < 50) {
          const fKey = (cx + cy) % 2 === 0 ? 'prop_flowers_1' : 'prop_flowers_2';
          if (this.textures.exists(fKey)) {
            const fl = this.add.image(centerX, surfaceY + 1, fKey)
              .setOrigin(0.5, 1).setDepth(DEPTH.propFront);
            this.tweens.add({
              targets: fl,
              angle: { from: -3.5, to: 3.5 },
              duration: 1600 + (cx % 7) * 180,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
        } else if (hash >= 50 && hash < 68 && this.textures.exists('prop_grass')) {
          this.add.image(centerX, surfaceY + 1, 'prop_grass')
            .setOrigin(0.5, 1).setDepth(DEPTH.propFront);
        }
      }
    }
  }

  // =========================================================================
  // 空气悬浮微粒（晨光花粉 / 暮色萤火 / 烈日火星）
  // =========================================================================
  buildAmbientParticles() {
    this.ambientMotes = [];
    const th = this.theme;
    const count = 22;
    for (let i = 0; i < count; i++) {
      const mx = Phaser.Math.Between(0, GAME_WIDTH);
      const my = Phaser.Math.Between(40, GAME_HEIGHT - 80);
      const r = Phaser.Math.FloatBetween(1.5, 3.2);
      const mote = this.add.circle(mx, my, r, th.moteColor, Phaser.Math.FloatBetween(0.22, 0.55))
        .setScrollFactor(0)
        .setDepth(DEPTH.bg + 4);
      mote.vx = Phaser.Math.FloatBetween(-12, 18);
      mote.vy = th.moteRise
        ? Phaser.Math.FloatBetween(-26, -10)
        : Phaser.Math.FloatBetween(-8, 12);
      mote.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.ambientMotes.push(mote);
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
    this.sparkle(tile.x, tile.y - 18, 0xffd25a);

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
    this.popText(x, y - 20, '+1', '#ffd252');
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
    this.spawnDebris(tile.x, tile.y, 0xd07a5c, 7);
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
      this.sparkle(enemy.x, enemy.y, 0xffd252);
      this.popText(enemy.x, enemy.y - 20, '+200', '#ffc842');
      return;
    }

    const body = cat.body;
    const ebody = enemy.body;
    const falling = body.velocity.y > 0;
    const feetAboveCenter = body.bottom <= ebody.center.y + 10;

    if (enemy.stompable && falling && feetAboveCenter) {
      enemy.stomp();
      const held = cat.jumpDown;
      cat.body.setVelocityY(held ? PHYS.STOMP_BOUNCE_HELD : PHYS.STOMP_BOUNCE);
      cat.juiceStretch();
      this.dust(enemy.x, enemy.y + 10, 5, 0xfff5e4);
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
    this.popText(item.x, item.y - 14, kind === 'goldfish' ? '+1' : '★ UP!',
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
      this.sparkle(item.x, item.y, 0xff9a44);
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
  // 工作室级粒子与视觉特效工具
  // =========================================================================
  popText(x, y, msg, color = '#fffdfa') {
    const t2 = this.add.text(x, y, msg, {
      fontFamily: FONT, fontSize: '18px', color, fontStyle: 'bold',
      stroke: '#2b1e22', strokeThickness: 4.5,
    }).setOrigin(0.5).setDepth(DEPTH.fx);
    t2.setScale(0.6);
    this.tweens.add({
      targets: t2, scale: 1.05, duration: 140, ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: t2, y: y - 38, alpha: 0, duration: 640, delay: 90, ease: 'Quad.easeOut',
      onComplete: () => t2.destroy(),
    });
  }

  /** 脚下的柔和烟尘云（起跳 / 落地 / 踩敌） */
  dust(x, y, n = 4, tint = 0xe8ded0) {
    const hasPuff = this.textures.exists('fx_puff');
    for (let i = 0; i < n; i++) {
      const ox = Phaser.Math.Between(-10, 10);
      const oy = Phaser.Math.Between(-4, 2);
      const s = hasPuff
        ? this.add.image(x + ox, y + oy, 'fx_puff')
          .setScale(Phaser.Math.FloatBetween(0.32, 0.56))
          .setTint(tint).setAlpha(0.88).setDepth(DEPTH.fx - 1)
        : this.add.circle(
          x + ox, y + oy, Phaser.Math.FloatBetween(3, 5.5), tint, 0.85,
        ).setDepth(DEPTH.fx - 1);

      this.tweens.add({
        targets: s,
        x: s.x + Phaser.Math.FloatBetween(-32, 32),
        y: s.y - Phaser.Math.FloatBetween(6, 22),
        alpha: 0,
        scale: hasPuff ? 0.14 : 0.35,
        angle: Phaser.Math.Between(-60, 60),
        duration: Phaser.Math.Between(280, 450),
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  spawnDebris(x, y, color, n = 5) {
    for (let i = 0; i < n; i++) {
      const sz = Phaser.Math.Between(8, 13);
      const s = this.add.rectangle(x, y, sz, sz, color)
        .setStrokeStyle(1.5, 0x2d2024, 0.85)
        .setDepth(DEPTH.fx);
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.Between(100, 230);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * spd * 0.58,
        y: y + Math.sin(ang) * spd * 0.42 - 36,
        angle: Phaser.Math.Between(-280, 280),
        scale: 0.4,
        alpha: 0,
        duration: Phaser.Math.Between(380, 620),
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  sparkle(x, y, color) {
    // 扩散冲击光环
    if (this.textures.exists('fx_ring')) {
      const ring = this.add.image(x, y, 'fx_ring')
        .setTint(color).setScale(0.25).setAlpha(0.85).setDepth(DEPTH.fx - 1);
      this.tweens.add({
        targets: ring,
        scale: 1.35,
        alpha: 0,
        duration: 340,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }

    const hasSpark = this.textures.exists('fx_spark');
    const count = 8;
    for (let i = 0; i < count; i++) {
      const s = hasSpark
        ? this.add.image(x, y, 'fx_spark')
          .setTint(i % 2 === 0 ? color : 0xffffff)
          .setScale(Phaser.Math.FloatBetween(0.45, 0.82))
          .setDepth(DEPTH.fx)
        : this.add.circle(x, y, Phaser.Math.Between(2, 4), color, 0.9)
          .setDepth(DEPTH.fx);
      const ang = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = Phaser.Math.Between(28, 44);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        angle: 120,
        scale: 0.1,
        alpha: 0,
        duration: Phaser.Math.Between(320, 440),
        ease: 'Quad.easeOut',
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
    this.sparkle(this.cat.x, this.cat.y - 24, 0xffd252);

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
        this.cameras.main.fadeOut(340, 36, 26, 30);
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

    // 水平 + 阻尼垂直视差
    const cam = this.cameras.main;
    this.bgFar.tilePositionX = cam.scrollX * 0.16;
    this.bgMid.tilePositionX = cam.scrollX * 0.42;

    // 空气悬浮微粒更新
    if (this.ambientMotes) {
      const dt = delta / 1000;
      for (const m of this.ambientMotes) {
        m.x += (m.vx + Math.sin(time * 0.002 + m.phase) * 8) * dt;
        m.y += m.vy * dt;
        if (m.x < -10) m.x = GAME_WIDTH + 10;
        if (m.x > GAME_WIDTH + 10) m.x = -10;
        if (m.y < -10) m.y = GAME_HEIGHT - 60;
        if (m.y > GAME_HEIGHT + 10) m.y = 20;
      }
    }

    // 计时（死亡重开也累计，这样"用时"才真实）
    if (!this.levelDone) this.elapsed += delta;
    this.hud.setTime(this.elapsed);
    if (this.cat) {
      this.hud.setForm(this.cat.form,
        this.cat.isInvincible ? Math.max(0, this.cat.starUntil - time) : 0);
    }

    this.cat.update(time, delta);

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

    // 掉出世界的敌人直接回收
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
