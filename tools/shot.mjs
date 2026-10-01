/**
 * 游戏截图工具（无头 Chrome + CDP）
 * ---------------------------------------------------------------
 * 冒烟测试只能证明"逻辑对不对"，证明不了"看起来对不对"。
 * 这个脚本把游戏真的跑起来、真的渲染，然后按预设的几个机位截图，
 * 用来肉眼检查美术、UI、关卡观感。
 *
 * 用法：
 *   node tools/shot.mjs                    （需要先 npm run dev 起服务）
 *   node tools/shot.mjs --only menu       只截菜单
 *   node tools/shot.mjs --out assets/preview
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const BASE = getArg('--url', 'http://127.0.0.1:5173/index.html');
const OUT_DIR = path.resolve(ROOT, getArg('--out', 'assets/preview'));
const ONLY = getArg('--only', '');

/** 预设机位：col 是希望猫所在的格号，wait 是留多少时间让相机跟上 */
const SHOTS = [
  { name: 'menu', scene: 'menu', wait: 1600, desc: '主菜单（视差背景 + 现代圆角 UI）' },
  { name: 'level1-start', level: 1, col: 14, wait: 1800, desc: '第一关开局：草地、金鱼、毛线球怪' },
  { name: 'level1-crumble', level: 1, col: 54, wait: 1800, desc: '第一关：伪装成草地的碎裂地板（跨坑的"桥"）' },
  { name: 'level1-pipe', level: 1, col: 63, wait: 1800, desc: '第一关：水管区（管口埋伏着一只毛线球）' },
  { name: 'level1-conveyor', level: 1, col: 114, wait: 1800, desc: '第一关：看起来是石块平台的隐藏传送带' },
  { name: 'level1-fakegoal', level: 1, col: 158, wait: 1800, desc: '第一关：假通关旗杆（右边才是真的）' },
  { name: 'level2-start', level: 2, col: 8, wait: 1800, desc: '第二关：屋顶与水管' },
  { name: 'level3-start', level: 3, col: 12, wait: 1800, desc: '第三关：太阳的恶意' },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let session = null;
  const cleanup = () => { if (session) session.kill(); };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  const picked = SHOTS.filter((s) => !ONLY || s.name.includes(ONLY));
  const written = [];

  try {
    session = await launch({ url: BASE, port: 9344, windowSize: '1000,620' });
    const { cdp } = session;

    const ready = await cdp.waitFor(
      "!!window.__CAT_MARIO__ && window.__CAT_MARIO__.scene.getScene('Menu') && window.__CAT_MARIO__.scene.getScene('Menu').scene.isActive()",
      40000);
    if (!ready) throw new Error('游戏没能在 40 秒内进入主菜单');

    // 用真实渲染：不要 sleep 主循环，让 Phaser 自己跑 rAF
    await sleep(1200);

    for (const shot of picked) {
      if (shot.scene === 'menu') {
        await cdp.eval("(function(){var G=window.__CAT_MARIO__;"
          + "if(G.scene.getScene('Level').scene.isActive()) G.scene.stop('Level');"
          + "if(!G.scene.getScene('Menu').scene.isActive()) G.scene.start('Menu');return 1})()");
        await sleep(shot.wait);
      } else {
        await cdp.eval(`(function(){var G=window.__CAT_MARIO__;`
          + `G.scene.stop('Menu');G.scene.stop('LevelComplete');G.scene.stop('Pause');`
          + `G.scene.start('Level',{levelId:${shot.level}});return 1})()`);
        await cdp.waitFor("window.__CAT_MARIO__.scene.getScene('Level').scene.isActive()"
          + " && !!window.__CAT_MARIO__.scene.getScene('Level').cat", 15000);
        await sleep(700);
        if (shot.col) {
          await cdp.eval(`(function(){var L=window.__CAT_MARIO__.scene.getScene('Level');`
            + `L.cat.body.reset(${shot.col} * 48 + 24, 11 * 48);`
            + `L.cat.body.setVelocity(0,0);`
            + `L.cameras.main.centerOn(${shot.col} * 48 + 24, L.cat.y);`
            + `return 1})()`);
        }
        await sleep(shot.wait);
      }

      const res = await cdp.send('Page.captureScreenshot', { format: 'png' }, 30000);
      const file = path.join(OUT_DIR, `${shot.name}.png`);
      fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
      written.push({ file, desc: shot.desc });
      console.log('📸 ' + path.relative(ROOT, file) + '  —— ' + shot.desc);
    }

    console.log(`\n共 ${written.length} 张，输出目录：${path.relative(ROOT, OUT_DIR)}`);
  } catch (err) {
    console.error('❌ ' + (err && err.message));
    process.exitCode = 2;
  } finally {
    cleanup();
  }
}

main();
