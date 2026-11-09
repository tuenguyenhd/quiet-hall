// Renders store art with headless Chrome: store/art/*.html → PNG at exact sizes (icons, banner).
// Usage: node scripts/store-assets.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const JOBS = [
  ['store/art/icon.html', 512, 512, 1, 'store/icon-512.png'],
  ['store/art/icon.html', 512, 512, 1, 'public/icon-512.png'],
  ['store/art/icon.html', 512, 512, 1, 'public/icon-maskable-512.png'],
  ['store/art/icon.html', 512, 512, 192 / 512, 'public/icon-192.png'],
  ['store/art/icon.html', 512, 512, 180 / 512, 'public/apple-touch-icon.png'],
  ['store/art/banner.html', 1200, 600, 1, 'store/banner-1200x600.png'],
];
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'qh-art-'))}`, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await wait(250); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
for (const [html, w, h, scale, out] of JOBS) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: 'file://' + resolve(html) });
  await wait(900);
  await cmd('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  const r = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale } });
  writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log('✔', out, `${Math.round(w * scale)}×${Math.round(h * scale)}`);
}
chrome.kill();
process.exit(0);
