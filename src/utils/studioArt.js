/**
 * studioArt.js —— 工作室级运行时 Canvas 程序化美术与光影纹理生成器
 * -----------------------------------------------------------------------
 * 完全零外部依赖、100% 离线运行，在 PreloadScene 完成时一次性生成：
 *   1. 三大关卡专属天空与大气光效纹理（晨光后院 / 暮色金霞 / 烈日幻境）
 *   2. 丁达尔体积光束（sunbeams）、电影级暗角（vignette）、天顶渐变（skyGrad）
 *   3. 场景生态装饰物纹理（木栅栏、浆果灌木、野花丛、草簇、指路木牌、路灯、悬崖草檐）
 *   4. 高品质粒子纹理（十字星芒、柔和烟尘云、冲击波光环）
 */
import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';

function makeCanvas(textures, key, w, h, drawFn) {
  if (textures.exists(key)) return;
  const cv = textures.createCanvas(key, w, h);
  const ctx = cv.getContext();
  ctx.clearRect(0, 0, w, h);
  drawFn(ctx, w, h);
  cv.refresh();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function buildStudioTextures(scene) {
  const tex = scene.textures;

  // =========================================================================
  // 1. 电影级暗角 & 天顶空气渐变 & 丁达尔体积光束
  // =========================================================================
  makeCanvas(tex, 'vignette', GAME_WIDTH, GAME_HEIGHT, (ctx, w, h) => {
    const g = ctx.createRadialGradient(
      w / 2, h * 0.48, Math.min(w, h) * 0.46,
      w / 2, h * 0.50, Math.max(w, h) * 0.74,
    );
    g.addColorStop(0, 'rgba(28, 18, 22, 0)');
    g.addColorStop(0.7, 'rgba(28, 18, 22, 0.08)');
    g.addColorStop(1, 'rgba(22, 14, 18, 0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  makeCanvas(tex, 'skyGrad', GAME_WIDTH, GAME_HEIGHT, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.48);
    g.addColorStop(0, 'rgba(28, 54, 108, 0.22)');
    g.addColorStop(0.6, 'rgba(38, 66, 120, 0.06)');
    g.addColorStop(1, 'rgba(38, 66, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.48);
  });

  // 丁达尔斜射阳光束
  makeCanvas(tex, 'sunbeams', GAME_WIDTH, GAME_HEIGHT, (ctx, w, h) => {
    const beams = [
      { x: 110, topW: 70, botW: 190, a: 0.12 },
      { x: 320, topW: 95, botW: 240, a: 0.15 },
      { x: 590, topW: 60, botW: 170, a: 0.10 },
      { x: 780, topW: 85, botW: 210, a: 0.13 },
    ];
    for (const b of beams) {
      const g = ctx.createLinearGradient(b.x, 0, b.x + 140, h * 0.85);
      g.addColorStop(0, `rgba(255, 248, 214, ${b.a})`);
      g.addColorStop(0.55, `rgba(255, 244, 200, ${b.a * 0.5})`);
      g.addColorStop(1, 'rgba(255, 244, 200, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.x, 0);
      ctx.lineTo(b.x + b.topW, 0);
      ctx.lineTo(b.x + 180 + b.botW, h * 0.88);
      ctx.lineTo(b.x + 180, h * 0.88);
      ctx.closePath();
      ctx.fill();
    }
  });

  // =========================================================================
  // 2. 三大关卡主题天空（Lv1 晴空后院 / Lv2 暮色流金 / Lv3 烈日赤霞）
  // =========================================================================
  const skyThemes = {
    bg_sky_1: [
      [0.0, '#62b2ec'],
      [0.42, '#9cd4f8'],
      [0.76, '#dff2fc'],
      [1.0, '#fff2cf'],
    ],
    bg_sky_2: [
      [0.0, '#3a3568'],
      [0.36, '#7e4e7c'],
      [0.68, '#df7a62'],
      [1.0, '#ffd285'],
    ],
    bg_sky_3: [
      [0.0, '#2e1a29'],
      [0.35, '#6e283b'],
      [0.68, '#c95238'],
      [1.0, '#f8af56'],
    ],
  };

  for (const [key, stops] of Object.entries(skyThemes)) {
    makeCanvas(tex, key, GAME_WIDTH, GAME_HEIGHT, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      for (const [pos, col] of stops) g.addColorStop(pos, col);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 远空柔光光晕
      const rg = ctx.createRadialGradient(w * 0.76, h * 0.24, 10, w * 0.76, h * 0.24, 280);
      rg.addColorStop(0, 'rgba(255, 246, 210, 0.28)');
      rg.addColorStop(0.5, 'rgba(255, 232, 175, 0.10)');
      rg.addColorStop(1, 'rgba(255, 232, 175, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });
  }

  // =========================================================================
  // 3. 场景生态装饰物（非碰撞前景/中景道具）
  // =========================================================================

  // 3.1 精致木栅栏 (96×44)
  makeCanvas(tex, 'prop_fence', 96, 44, (ctx) => {
    ctx.strokeStyle = '#36262a';
    ctx.lineWidth = 2;

    // 横档
    for (const ry of [16, 30]) {
      roundRectPath(ctx, 3, ry, 90, 7, 3);
      ctx.fillStyle = '#c98a58';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e0a676';
      ctx.fillRect(5, ry + 1, 86, 2);
    }

    // 4 根竖桩
    for (const px of [8, 32, 56, 80]) {
      ctx.beginPath();
      ctx.moveTo(px, 10);
      ctx.lineTo(px + 6, 3);
      ctx.lineTo(px + 12, 10);
      ctx.lineTo(px + 12, 42);
      ctx.lineTo(px, 42);
      ctx.closePath();
      ctx.fillStyle = '#e4ad7c';
      ctx.fill();
      // 右侧暗部
      ctx.fillStyle = '#c48654';
      ctx.fillRect(px + 7, 10, 4, 31);
      // 左侧高光
      ctx.fillStyle = '#f5cba2';
      ctx.fillRect(px + 2, 10, 3, 30);
      ctx.stroke();

      // 铆钉
      ctx.fillStyle = '#4e383c';
      ctx.beginPath();
      ctx.arc(px + 6, 19.5, 1.5, 0, Math.PI * 2);
      ctx.arc(px + 6, 33.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 3.2 丰茂浆果灌木丛 (84×46)
  makeCanvas(tex, 'prop_bush', 84, 46, (ctx) => {
    const blobs = [
      [20, 31, 17, 13, '#387e4c'],
      [64, 31, 17, 13, '#387e4c'],
      [42, 24, 22, 18, '#387e4c'],
      [24, 28, 15, 12, '#52a660'],
      [58, 28, 15, 12, '#52a660'],
      [42, 21, 19, 15, '#52a660'],
      [35, 16, 12, 9, '#7cd174'],
      [52, 20, 10, 7, '#7cd174'],
    ];
    // 轮廓底层
    ctx.fillStyle = '#2d2024';
    for (const [x, y, rx, ry] of blobs.slice(0, 3)) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx + 2.2, ry + 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [x, y, rx, ry, col] of blobs) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 小浆果点缀
    for (const [bx, by, c] of [
      [26, 26, '#ff686b'],
      [46, 18, '#ffd25a'],
      [57, 28, '#ff686b'],
      [35, 31, '#ffd25a'],
    ]) {
      ctx.fillStyle = '#2d2024';
      ctx.beginPath();
      ctx.arc(bx, by, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx - 0.7, by - 0.7, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 3.3 野花丛 A（暖白雏菊与金蕊 48×32）& 野花丛 B（珊瑚粉与晴空蓝 48×32）
  const drawFlowerPatch = (ctx, palette) => {
    const stems = [
      [13, 30, 10, 14],
      [24, 30, 24, 9],
      [35, 30, 38, 15],
    ];
    ctx.lineCap = 'round';
    for (const [x0, y0, x1, y1] of stems) {
      ctx.strokeStyle = '#2f6a3e';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 8, x1, y1);
      ctx.stroke();
    }
    // 底部小草叶
    for (const [gx, dir] of [[12, -1], [24, 1], [35, -1], [28, -1]]) {
      ctx.strokeStyle = '#58b462';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(gx, 30);
      ctx.quadraticCurveTo(gx + dir * 5, 22, gx + dir * 9, 20);
      ctx.stroke();
    }
    // 花朵
    stems.forEach(([_, __, fx, fy], idx) => {
      const petalCol = palette[idx % palette.length];
      ctx.fillStyle = '#2d2024';
      ctx.beginPath();
      ctx.arc(fx, fy, 6.8, 0, Math.PI * 2);
      ctx.fill();
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2;
        const px = fx + Math.cos(ang) * 3.6;
        const py = fy + Math.sin(ang) * 3.6;
        ctx.fillStyle = petalCol;
        ctx.beginPath();
        ctx.arc(px, py, 2.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffcf48';
      ctx.beginPath();
      ctx.arc(fx, fy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  makeCanvas(tex, 'prop_flowers_1', 48, 32, (ctx) => {
    drawFlowerPatch(ctx, ['#fff9f0', '#ffe082', '#fff9f0']);
  });
  makeCanvas(tex, 'prop_flowers_2', 48, 32, (ctx) => {
    drawFlowerPatch(ctx, ['#ff858d', '#8fd8ff', '#ffb26b']);
  });

  // 3.4 灵动草簇 (48×24)
  makeCanvas(tex, 'prop_grass', 48, 24, (ctx) => {
    const blades = [
      [10, 23, 5, 10, '#3f8d4e', 3.0],
      [16, 23, 13, 6, '#58b462', 3.2],
      [23, 23, 24, 4, '#82d878', 3.0],
      [30, 23, 35, 7, '#58b462', 3.2],
      [37, 23, 42, 12, '#3f8d4e', 2.8],
    ];
    ctx.lineCap = 'round';
    for (const [x0, y0, x1, y1, col, w] of blades) {
      ctx.strokeStyle = '#2d2024';
      ctx.lineWidth = w + 1.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 4, x1, y1);
      ctx.stroke();

      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 4, x1, y1);
      ctx.stroke();
    }
  });

  // 3.5 冒险指路木牌 (56×60)
  makeCanvas(tex, 'prop_sign', 56, 60, (ctx) => {
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#2d2024';

    // 竖木桩
    roundRectPath(ctx, 23, 10, 10, 48, 3);
    ctx.fillStyle = '#9c623e';
    ctx.fill();
    ctx.stroke();

    // 箭头木牌
    ctx.beginPath();
    ctx.moveTo(8, 16);
    ctx.lineTo(38, 16);
    ctx.lineTo(50, 26);
    ctx.lineTo(38, 36);
    ctx.lineTo(8, 36);
    ctx.closePath();
    ctx.fillStyle = '#d89b64';
    ctx.fill();
    ctx.stroke();

    // 木牌顶部受光面与木纹
    ctx.fillStyle = '#ecc08e';
    ctx.fillRect(10, 18, 27, 4);
    ctx.fillStyle = '#b47848';
    ctx.fillRect(10, 31, 27, 3);

    // 牌面白色箭头纹
    ctx.fillStyle = '#fff5e4';
    ctx.beginPath();
    ctx.moveTo(20, 22);
    ctx.lineTo(28, 22);
    ctx.lineTo(33, 26);
    ctx.lineTo(28, 30);
    ctx.lineTo(20, 30);
    ctx.lineTo(25, 26);
    ctx.closePath();
    ctx.fill();
  });

  // 3.6 暖光庭院路灯 (44×76)
  makeCanvas(tex, 'prop_lantern', 44, 76, (ctx) => {
    // 暖色光晕
    const rg = ctx.createRadialGradient(22, 20, 2, 22, 20, 21);
    rg.addColorStop(0, 'rgba(255, 230, 140, 0.85)');
    rg.addColorStop(0.5, 'rgba(255, 198, 92, 0.32)');
    rg.addColorStop(1, 'rgba(255, 198, 92, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(22, 20, 21, 0, Math.PI * 2);
    ctx.fill();

    // 灯柱底座与杆
    ctx.fillStyle = '#38323c';
    ctx.strokeStyle = '#221c22';
    ctx.lineWidth = 2;
    roundRectPath(ctx, 15, 68, 14, 7, 3);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, 19.5, 28, 5, 42, 2);
    ctx.fill();
    ctx.stroke();

    // 灯笼体
    roundRectPath(ctx, 13, 12, 18, 16, 4);
    ctx.fillStyle = '#ffe484';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff8d6';
    ctx.fillRect(16, 15, 6, 10);

    // 灯帽
    ctx.beginPath();
    ctx.moveTo(10, 13);
    ctx.lineTo(22, 5);
    ctx.lineTo(34, 13);
    ctx.closePath();
    ctx.fillStyle = '#48404e';
    ctx.fill();
    ctx.stroke();
  });

  // 3.7 悬崖边缘垂草装饰 (24×48)
  makeCanvas(tex, 'cliff_lip_l', 24, 48, (ctx) => {
    ctx.fillStyle = '#4aa356';
    ctx.strokeStyle = '#2d2024';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(20, 8, 8, Math.PI * 0.5, Math.PI * 1.5);
    ctx.lineTo(24, 0);
    ctx.lineTo(24, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7cd174';
    ctx.beginPath();
    ctx.arc(20, 6, 5, Math.PI * 0.6, Math.PI * 1.4);
    ctx.fill();
  });

  makeCanvas(tex, 'cliff_lip_r', 24, 48, (ctx) => {
    ctx.fillStyle = '#4aa356';
    ctx.strokeStyle = '#2d2024';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(4, 8, 8, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.lineTo(0, 18);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7cd174';
    ctx.beginPath();
    ctx.arc(4, 6, 5, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.fill();
  });

  // =========================================================================
  // 4. 高品质粒子与特效纹理
  // =========================================================================
  makeCanvas(tex, 'fx_spark', 24, 24, (ctx) => {
    const cx = 12;
    const cy = 12;
    const rg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 11);
    rg.addColorStop(0, 'rgba(255, 255, 255, 1)');
    rg.addColorStop(0.5, 'rgba(255, 244, 200, 0.45)');
    rg.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, 1);
    ctx.quadraticCurveTo(cx + 2, cy - 2, 23, cy);
    ctx.quadraticCurveTo(cx + 2, cy + 2, cx, 23);
    ctx.quadraticCurveTo(cx - 2, cy + 2, 1, cy);
    ctx.quadraticCurveTo(cx - 2, cy - 2, cx, 1);
    ctx.closePath();
    ctx.fill();
  });

  makeCanvas(tex, 'fx_puff', 32, 32, (ctx) => {
    const rg = ctx.createRadialGradient(14, 13, 2, 16, 16, 14);
    rg.addColorStop(0, 'rgba(255, 253, 248, 0.95)');
    rg.addColorStop(0.65, 'rgba(238, 228, 214, 0.75)');
    rg.addColorStop(1, 'rgba(220, 208, 194, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fill();
  });

  makeCanvas(tex, 'fx_ring', 48, 48, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(24, 24, 18, 0, Math.PI * 2);
    ctx.stroke();
  });
}
