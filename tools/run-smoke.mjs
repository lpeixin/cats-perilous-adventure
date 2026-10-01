/**
 * 无头浏览器冒烟测试驱动器
 * ---------------------------------------------------------------
 * 为什么不直接用 `chrome --headless --dump-dom --virtual-time-budget=N`？
 *
 * 因为 --virtual-time-budget 会让 Chrome 一直跑到"虚拟时间预算耗尽"才 dump，
 * 而这个页面里有 Phaser 的 rAF 循环在持续占用任务队列，虚拟时间只能一小步一小步
 * 往前挪，结果就是 Chrome 老老实实按真实时间跑满整个预算 —— 一个 300 秒的预算
 * 要跑五分钟，迭代一次等到天荒地老。
 *
 * 所以这里改成用 CDP 驱动：
 *   1. 起一个无头 Chrome，打开测试页
 *   2. 连上页面的 WebSocket，轮询 document.title
 *   3. 测试脚本跑完会把自己标成 SMOKE-DONE，这时把报告读回来
 *   4. 无论成功失败都杀掉 Chrome
 *
 * 用法：
 *   node tools/run-smoke.mjs                       （需要先 npm run dev 起服务）
 *   node tools/run-smoke.mjs --url http://127.0.0.1:5173/tools/smoke-test.html
 *   CHROME="/path/to/Chrome" node tools/run-smoke.mjs
 */
import { launch, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const URL_UNDER_TEST = getArg('--url', 'http://127.0.0.1:5173/tools/smoke-test.html');
const TIMEOUT_MS = Number(getArg('--timeout', '180000'));
const PORT = Number(getArg('--port', '9333'));

async function main() {
  // 先确认开发服务器活着，否则后面报的错会很难懂
  try {
    const res = await fetch(URL_UNDER_TEST);
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (e) {
    console.error(`❌ 打不开测试页 ${URL_UNDER_TEST}\n   请先在另一个终端跑：npm run dev\n   （${e.message}）`);
    process.exit(2);
  }

  let session = null;
  const cleanup = () => { if (session) session.kill(); };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  try {
    session = await launch({ url: URL_UNDER_TEST, port: PORT });
    const { cdp } = session;

    const started = Date.now();
    const done = await cdp.waitFor("document.title === 'SMOKE-DONE'", TIMEOUT_MS, 400);

    const report = await cdp.eval(
      "document.getElementById('report') ? document.getElementById('report').textContent : '(no report)'"
    );

    if (!done) {
      console.error(`⚠️  测试在 ${Math.round((Date.now() - started) / 1000)}s 内没有跑完，下面是当前进度：\n`);
    }
    console.log(report);

    if (!done) { cleanup(); process.exit(3); }
    process.exitCode = /RESULT: ALL-GREEN/.test(report || '') ? 0 : 1;
  } catch (err) {
    console.error('❌ ' + (err && err.message));
    process.exitCode = 2;
  } finally {
    cleanup();
  }
}

main();
