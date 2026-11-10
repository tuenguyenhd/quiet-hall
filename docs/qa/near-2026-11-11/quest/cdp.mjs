// tiny CDP helper: headless Chrome, phone size
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function open(OUT) {
  const port = 9300 + Math.floor(Math.random() * 90);
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'qq-'))}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 40 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch { await wait(250); } }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('  console.error', m.params.args.map(a=>a.value??a.description).join(' ').slice(0,200)); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]); };
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (name) => { const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); console.log('  shot', name); };
  const tap = async (sel) => {
    const r = JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect() ?? null)`));
    if (!r || !r.width) { console.log(`  no ${sel}`); return false; }
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    return true;
  };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
  const nav = async (url, ms = 6000) => { await cmd('Page.navigate', { url }); await wait(ms); };
  const done = () => { console.log(errs.length ? 'page errors: ' + [...new Set(errs)].join(' | ') : 'no page errors'); chrome.kill(); };
  return { cmd, ev, shot, tap, nav, done, errs };
}
