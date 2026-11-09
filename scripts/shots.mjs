// Screenshot review loop (spec 005 T104): one phone-size shot per place, plus console errors and a rough FPS.
// Usage: node scripts/shots.mjs [outDir] [baseUrl] [extraQuery]
//   needs Google Chrome; base defaults to the Vite dev server (?autoenter only works in dev builds).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'shots';
const BASE = process.argv[3] ?? 'http://localhost:5173';
const EXTRA = process.argv[4] ?? '';
const PLACES = (process.env.PLACES ?? 'spawn,hall,lake,garden,grove,tea,lookout').split(',');
const W = Number(process.env.W ?? 412);
const H = Number(process.env.H ?? 915);
mkdirSync(OUT, { recursive: true });

const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), 'qh-shots-'));
const chrome = spawn(CH, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1200,1000', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    break;
  } catch {
    await wait(250);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
};
const cmd = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cmd('Runtime.enable');
await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: Number(process.env.DPR ?? 1.5), mobile: true });

// special names: "welcome" (first screen), "sheet-<id>" (open a sheet, e.g. sheet-lanternsheet), "fren-<n>" (look at resident n)
for (const place of PLACES) {
  const sheet = place.startsWith('sheet-') ? place.slice(6) : '';
  const q = place === 'welcome' ? (EXTRA || 'x') : `autoenter${place === 'spawn' || sheet ? '' : `&at=${place}`}${EXTRA ? `&${EXTRA}` : ''}`;
  await cmd('Page.navigate', { url: `${BASE}/?${q}` });
  await wait(4500);
  if (sheet) {
    const b = sheet.replace('sheet', '');
    await ev(`((document.getElementById('btn-${b}') ?? document.getElementById('btn-${b}s'))?.click(), document.getElementById('${sheet}')?.classList.remove('hidden'))`);
    await wait(600);
  }
  // optional: EVAL="js" runs in the page after load (e.g. move the player), then waits a little
  if (process.env.EVAL) {
    const out = await ev(process.env.EVAL);
    if (out !== undefined) console.log(`${place} EVAL →`, typeof out === 'string' ? out : JSON.stringify(out));
    await wait(Number(process.env.EVAL_WAIT ?? 2500));
    if (process.env.EVAL_AFTER) console.log(`${place} AFTER →`, JSON.stringify(await ev(process.env.EVAL_AFTER)));
  }
  // hide the HUD toasts so the world is visible
  await ev(`document.querySelectorAll('.toast,.hint').forEach(e=>e.style.display='none')`);
  const fps = await ev(`new Promise(r=>{let n=0;const t0=performance.now();function f(){n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(Math.round(n/((performance.now()-t0)/1000)))} requestAnimationFrame(f)})`);
  const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(join(OUT, `${place}.jpg`), Buffer.from(r.result.data, 'base64'));
  const info = await ev(`(()=>{const r=window.__qh?.renderer; return r? JSON.stringify({calls:r.info.render.calls,tris:r.info.render.triangles}) : ''})()`);
  console.log(`${place.padEnd(8)} fps≈${fps} (swiftshader) ${info}`);
}
console.log(errors.length ? `console errors:\n- ${[...new Set(errors)].join('\n- ')}` : 'no console errors');
chrome.kill();
process.exit(0);
