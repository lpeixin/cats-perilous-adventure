#!/usr/bin/env node
/**
 * 零依赖静态服务器 —— 用于本地运行《猫咪历险记》。
 * 之所以不用 `npx serve`：npx 首次运行需要联网下载，本项目要求完全离线可用。
 *
 * 用法:  npm run dev   [-- --port 5173]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const portArgIndex = argv.findIndex((a) => a === '--port' || a === '-p');
const PORT = Number(
  portArgIndex >= 0 ? argv[portArgIndex + 1] : process.env.PORT || 5173
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch (e) {
    return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad Request');
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // 防目录穿越：解析后必须仍在 ROOT 之内。
  //
  // 这里**不能**写成 filePath.startsWith(ROOT)：那是个经典的前缀比较漏洞。
  // 假设 ROOT 是 .../projects/cat-mario，那么 .../projects/cat-mario-secret/x
  // 同样满足 startsWith(ROOT)，请求 /../cat-mario-secret/secret.txt 就能读到
  // 隔壁目录的文件。必须用 path.relative 判断"相对路径是否往上跑"，
  // 它天然带路径分隔符边界，不会把 cat-mario-secret 误判成 cat-mario 的子目录。
  const filePath = path.resolve(ROOT, '.' + pathname);
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return send(res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 Not Found: ' + pathname);
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    };
    if (req.method === 'HEAD') return send(res, 200, headers, '');
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, headers);
    stream.pipe(res);
    stream.on('error', () => res.destroy());
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const line = '─'.repeat(46);
  console.log('');
  console.log('  🐱  《猫咪历险记》Cat\'s Perilous Adventure');
  console.log('  ' + line);
  console.log('  本地服务器已启动：');
  console.log(`  ➜  http://localhost:${PORT}/`);
  console.log('  ' + line);
  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ✖ 端口 ${PORT} 已被占用。换一个端口：npm run dev -- --port 5200\n`);
    process.exit(1);
  }
  throw e;
});
