#!/usr/bin/env node
/**
 * 把 node_modules/phaser/dist/phaser.min.js 复制到 vendor/，
 * 让游戏在**完全离线**的情况下也能运行（不依赖任何 CDN）。
 *
 * 由 npm postinstall 自动调用，也可手动 `npm run sync:phaser`。
 * 若 vendor/phaser.min.js 已存在且比 node_modules 里的新，则跳过。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
  'node_modules/phaser/dist/phaser.min.js',
  'node_modules/phaser/dist/phaser.js',
];
const DEST = path.join(ROOT, 'vendor', 'phaser.min.js');

function main() {
  const src = CANDIDATES.map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(p));
  if (!src) {
    console.warn('[sync-phaser] 未找到 node_modules/phaser，跳过。请先执行 npm install。');
    return;
  }
  fs.mkdirSync(path.dirname(DEST), { recursive: true });

  const srcStat = fs.statSync(src);
  if (fs.existsSync(DEST)) {
    const dstStat = fs.statSync(DEST);
    if (dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs) {
      console.log('[sync-phaser] vendor/phaser.min.js 已是最新，跳过。');
      return;
    }
  }
  fs.copyFileSync(src, DEST);
  const kb = (srcStat.size / 1024).toFixed(0);
  console.log(`[sync-phaser] 已复制 Phaser 到 vendor/phaser.min.js (${kb} KB)`);
}

main();
