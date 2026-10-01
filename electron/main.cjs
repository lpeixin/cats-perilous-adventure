/**
 * 《猫咪历险记》Electron 主进程
 * ---------------------------------------------------------------
 * 为什么要在 Electron 里再起一个本地 HTTP 服务？
 *
 * 因为游戏用的是 ES Module（<script type="module">），而浏览器/Electron 出于
 * 安全策略，**不允许 file:// 协议加载 ES Module**（会被当成跨域请求直接拒绝）。
 * 直接把 index.html 用 loadFile() 打开，会白屏并在控制台报 CORS 错误。
 *
 * 所以这里在进程内起一个只监听 127.0.0.1 的静态服务器，再用 loadURL() 打开。
 * 好处：
 *   · 不需要任何外部依赖（不装 express，也不依赖 npx serve）
 *   · 端口用 0 让系统自动分配，避免和用户其它程序撞端口
 *   · 完全离线可用 —— 打包成 .app 之后断网也能玩
 *
 * 用法：
 *   npm run electron            正常启动
 *   npm run electron -- --dev   启动并自动打开 DevTools
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEV = process.argv.includes('--dev');

/** 静态服务用到的 MIME 表（够用就好，不引第三方库） */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * 起一个只服务项目根目录的静态服务器。
 * @returns {Promise<{server: import('http').Server, port: number}>}
 */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      } catch {
        res.writeHead(400).end('Bad Request');
        return;
      }
      if (pathname === '/' || pathname === '') pathname = '/index.html';

      // 目录穿越防护：解析后必须仍在 ROOT 之内
      const filePath = path.join(ROOT, pathname);
      const rel = path.relative(ROOT, filePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found: ' + pathname);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.on('error', reject);
    // 端口传 0 = 让系统随便给一个空闲端口，绝不撞车
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

let mainWindow = null;
let httpServer = null;

async function createWindow() {
  const { server, port } = await startStaticServer();
  httpServer = server;

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 640,
    minWidth: 720,
    minHeight: 460,
    backgroundColor: '#a8dcf0',
    title: "猫咪历险记 · Cat's Perilous Adventure",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // 游戏本体不需要任何 Node 能力，关掉更安全
      nodeIntegration: false,
      contextIsolation: true,
      // 帧率稳定：后台时不要节流（切窗口回来手感不会断）
      backgroundThrottling: false,
    },
  });

  // 窗口准备好再显示，避免看到白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // 外链一律丢给系统浏览器，不在游戏窗口里开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
}

/** macOS 上保留一个最小应用菜单（没有它 Cmd+Q / Cmd+W 会失效） */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '游戏',
      submenu: [
        { label: '重新载入', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: '全屏', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    ...(DEV ? [{
      label: '调试',
      submenu: [
        { role: 'toggleDevTools' },
        { role: 'forceReload' },
      ],
    }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前把内嵌服务器关掉，避免端口悬挂
app.on('before-quit', () => {
  if (httpServer) httpServer.close();
});
