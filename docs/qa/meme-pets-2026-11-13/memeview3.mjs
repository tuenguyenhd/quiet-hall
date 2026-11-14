// node memeview.mjs BASE OUTDIR [prefix]   -> current vs meme pets screenshots, console errors, meme GLB transfer sizes
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [BASE, OUT, PREFIX = ''] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 90);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sc-'))}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let t; for (let i = 0; i < 40 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch { await wait(250); } }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); let errs = []; const glb = new Map(); const reqs = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown') errs.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === 'Network.responseReceived' && /\/models\/.*\.glb/.test(m.params.response.url)) reqs.set(m.params.requestId, m.params.response.url.replace(/^.*\/models\//, ''));
  if (m.method === 'Network.loadingFinished' && reqs.has(m.params.requestId)) glb.set(reqs.get(m.params.requestId), m.params.encodedDataLength);
  if (m.method === 'Network.loadingFailed' && reqs.has(m.params.requestId)) errs.push('glb failed: ' + reqs.get(m.params.requestId));
};
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Network.enable'); await cmd('Network.setCacheDisabled', { cacheDisabled: true });
await cmd('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
const shot = async (n) => { const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); writeFileSync(join(OUT, n), Buffer.from(r.result.data, 'base64')); };

// close-up: the wandering animals + a pet line up in front of the player, camera zoomed in
const lineup = (petIdx) => `(async () => {
  const q = window.__qh; const me = q.me(); const p = me.root.position; const c = q.camera.position;
  q.controls.zoom = 4.5;
  const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz); const fx = dx / d, fz = dz / d; // towards camera
  const sx = -fz, sz = fx; // sideways
  const n = q.animals.debug().length;
  const slots = [-1.3, 1.0, 1.9, -1.9, -0.9, 1.3];
  for (let i = 0; i < n; i++) { const f = -(1.4 + (i >= 3 ? 1.0 : 0)); q.animals.put(i, p.x + fx * f + sx * slots[i], p.z + fz * f + sz * slots[i]); }
  me.setPet(${petIdx});
  await new Promise((r) => setTimeout(r, 4000));
  return JSON.stringify(q.animals.debug().map((a) => [a[0], a[7]]));
})()`;

const fren = (fx, fz, side) => `(async () => {
  const q = window.__qh; const me = q.me();
  const vx = ${fx} + ${side} * 2, vz = ${fz} + 3.4;
  me.root.position.set(vx, q.world.heightAt(vx, vz), vz);
  q.controls.yaw = Math.atan2(vx - (${fx} + 0.9), vz - ${fz}); me.root.rotation.y = q.controls.yaw + Math.PI;
  q.controls.zoom = 4.5;
  await new Promise((r) => setTimeout(r, 3500));
  return 'ok';
})()`;
const orbit = (dyaw, zoom) => `(async () => { const q = window.__qh; q.controls.yaw += ${dyaw}; q.controls.zoom = ${zoom}; await new Promise((r) => setTimeout(r, 2500)); return q.controls.yaw; })()`;
const fren2 = (fx, fz) => `(async () => {
  const q = window.__qh; const me = q.me();
  const vx = ${fx} - 2.2, vz = ${fz} - 2.8;
  me.root.position.set(vx, q.world.heightAt(vx, vz), vz);
  q.controls.yaw = Math.atan2(vx - ${fx}, vz - ${fz}) + 0.35; me.root.rotation.y = q.controls.yaw + Math.PI;
  q.controls.zoom = 4.5;
  await new Promise((r) => setTimeout(r, 3500));
  return 'ok';
})()`;
const report = {};
// (a) Biscuit as the player's pet, idle sitting beside the owner: normal camera, then orbit to its front-3/4
errs = [];
await cmd('Page.navigate', { url: `${BASE}/?autoenter&at=court` });
await wait(9000);
await ev('window.__qh.me().setPet(1)'); await wait(4000);
await ev(orbit(0, 4.5)); await shot(`${PREFIX}pet-behind.jpg`);
await ev(orbit(0.9, 4)); await shot(`${PREFIX}pet-side.jpg`);
await ev(orbit(0.8, 4)); await shot(`${PREFIX}pet-front34.jpg`);
report.a = errs.filter((e) => !/Lit is in dev|PCFSoft/.test(e));
// (b) next to v1: wandering dogs are v1 (?pets=v1), the pet is the new Biscuit
errs = [];
await cmd('Page.navigate', { url: `${BASE}/?autoenter&at=court&pets=v1` });
await wait(9000);
report.b = await ev(lineup(1));
await shot(`${PREFIX}vs-v1-behind.jpg`);
await ev(orbit(1.4, 5)); await shot(`${PREFIX}vs-v1-front.jpg`);
report.berr = errs.filter((e) => !/Lit is in dev|PCFSoft/.test(e));
// (c) Meme Valley: Shibby (NEAR default)
errs = [];
await cmd('Page.navigate', { url: `${BASE}/?autoenter&at=valley` });
await wait(9000);
await ev(fren(90, -80, 1.3)); await shot(`${PREFIX}shibby-behind.jpg`);
await ev(fren2(90, -80)); await shot(`${PREFIX}shibby-front34.jpg`);
report.c = errs.filter((e) => !/Lit is in dev|PCFSoft/.test(e));
report.glb = Object.fromEntries([...glb].filter(([k]) => /meme/.test(k)));
console.log(JSON.stringify(report, null, 1));
chrome.kill(); process.exit(0);
