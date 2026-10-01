/**
 * 极简 CDP（Chrome DevTools Protocol）客户端
 * ---------------------------------------------------------------
 * 只做两件事：起一个无头 Chrome、连上页面求值。
 * 被 tools/run-smoke.mjs（冒烟测试）和 tools/shot.mjs（截图）共用。
 *
 * 之所以不用 `--dump-dom --virtual-time-budget`，见 run-smoke.mjs 顶部的说明。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 找一个可用的 Chrome / Chromium */
export function findChrome() {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

export async function getJson(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch { /* Chrome 还没起来 */ }
  return null;
}

/** 极简 CDP 客户端 */
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, timeoutMs = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP 超时: ' + method));
        }
      }, timeoutMs);
    });
  }

  /** 在页面里求值，返回 JS 值 */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: false,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || '页面内异常');
    return r.result && r.result.value;
  }

  /** 轮询直到表达式返回真值（或超时） */
  async waitFor(expression, timeoutMs = 30000, pollMs = 300) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.eval(expression).catch(() => false)) return true;
      await sleep(pollMs);
    }
    return false;
  }
}

/**
 * 启动无头 Chrome 并连上指定 URL 的页面。
 * @returns {{cdp: Cdp, child: import('child_process').ChildProcess, kill: () => void}}
 */
export async function launch({ url, port = 9333, windowSize = '1280,900', extraArgs = [] }) {
  const chrome = findChrome();
  if (!chrome) throw new Error('找不到 Chrome / Chromium。请设置环境变量 CHROME=/path/to/Chrome');

  const profile = path.join(os.tmpdir(), 'catmario-cdp-profile-' + port);
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--mute-audio',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${windowSize}`,
    ...extraArgs,
    url,
  ], { stdio: 'ignore' });

  const kill = () => { try { child.kill('SIGKILL'); } catch { /* ignore */ } };

  // 等调试端口就绪，并找到目标页面
  let target = null;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !target) {
    const list = await getJson(`http://127.0.0.1:${port}/json/list`);
    if (Array.isArray(list)) target = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
    if (!target) await sleep(200);
  }
  if (!target) { kill(); throw new Error('等不到调试目标（Chrome 可能没起来）'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true });
  });

  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable').catch(() => {});

  return {
    cdp,
    child,
    kill: () => { try { ws.close(); } catch { /* ignore */ } kill(); },
  };
}
