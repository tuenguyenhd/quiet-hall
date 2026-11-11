// Real taps (CDP mouse events, like a finger), not element.click(): welcome, in-game Log in → NEAR Connect picker, PumpHall guest.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [BASE, OUT] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 90);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'taps-'))}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let t; for (let i = 0; i < 40 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch { await wait(250); } }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.consoleAPICalled') console.log('  console.'+m.params.type, m.params.args.map(a=>a.value??a.description).join(' ').slice(0,200)); if (m.method === 'Network.loadingFailed') console.log('  netfail', m.params.errorText); if (m.method === 'Network.requestWillBeSent' && /near|connect|manifest|nonce/i.test(m.params.request.url)) console.log('  req', m.params.request.url.slice(0,120)); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => { const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 75 }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); };
const tap = async (sel) => {
  const r = JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect() ?? null)`));
  if (!r || !r.width) return `no ${sel}`;
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  return `tapped ${sel} at ${Math.round(x)},${Math.round(y)}`;
};

await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url: `${BASE}/?autoenter&at=valley` }); await wait(8000);
await ev(`__drops.reset(); 1`);
console.log('inject:', await ev(`__drops.inject(__drops.sample())`)); await wait(1500);
await shot('01-drops-from-gate.jpg');
// step inside the valley (closer view), facing its centre
await ev(`(()=>{const m=__qh.me().root; m.position.x=93; m.position.z=-80; return 1})()`); await wait(2500);
await shot('01b-drops-in-valley.jpg');
// project a drop to the screen and tap it like a finger
const proj = async () => JSON.parse(await ev(`(()=>{const q=__qh, cam=q.camera, me=q.me().root.position; const V=cam.position.constructor;
  const out=__drops.spots('cmp-devbonk01').map(s=>{const v=new V(s.x,s.y,s.z).project(cam); const x=(v.x+1)/2*innerWidth, y=(1-v.y)/2*innerHeight; const e=document.elementFromPoint(x,y);
  return {i:s.i, x, y, z:v.z, d:Math.hypot(s.x-me.x,s.z-me.z), hit:e&&e.tagName}}).filter(p=>p.z<1&&p.x>30&&p.x<innerWidth-30&&p.y>190&&p.y<innerHeight-160&&p.hit==='CANVAS'&&p.d>3).sort((a,b)=>a.d-b.d);
  return JSON.stringify(out)})()`));
const fingerTap = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
let ps = await proj();
console.log('tappable drops on screen:', ps.length, ps.slice(0,3));
const target = ps[0];
await fingerTap(target.x, target.y); console.log('tapped drop', target.i, 'at', Math.round(target.x), Math.round(target.y), 'dist', target.d.toFixed(1));
await wait(400); await shot('02-walking-to-drop.jpg');
for (let i = 0; i < 30; i++) { if (JSON.parse(await ev(`JSON.stringify(__drops.sent)`)).length) break; await wait(500); }
const sent = JSON.parse(await ev(`JSON.stringify(__drops.sent)`));
console.log('sent:', JSON.stringify(sent), 'me→drop dist now', await ev(`(()=>{const p=__drops.spots('cmp-devbonk01').find(s=>s.i===${target.i}), m=__qh.me().root.position; return p?Math.hypot(p.x-m.x,p.z-m.z).toFixed(2):'gone'})()`));
// the server's reply (simulated): 1/3
await ev(`__drops.reply({t:'cpicked',c:'cmp-devbonk01',d:${target.i},ok:true,got:1,goal:3}); 1`); await wait(300);
await shot('03-progress-toast.jpg');
await wait(800);
console.log('picked sprite gone:', await ev(`!__drops.spots('cmp-devbonk01').some(s=>s.i===${target.i})`));
// a second real tap → walk → cpick
ps = await proj(); const t2 = ps[0];
if (t2) { await fingerTap(t2.x, t2.y); for (let i = 0; i < 30; i++) { if (JSON.parse(await ev(`JSON.stringify(__drops.sent)`)).length > 1) break; await wait(500); } console.log('sent 2:', await ev(`JSON.stringify(__drops.sent.slice(-1))`)); await ev(`__drops.reply({t:'cpicked',c:'cmp-devbonk01',d:${t2.i},ok:true,got:2,goal:3}); 1`); }
await wait(2200);
// the quest sheet via the chip (real tap)
console.log('chip:', await ev(`document.getElementById('near-quest-chip').innerText`));
await shot('04-hud-chip.jpg');
console.log(await tap('#near-quest-chip')); await wait(800);
await shot('05-quest-sheet.jpg');
// Show me the way (real tap) from the sheet
console.log(await tap('[data-dgo]')); await wait(600);
console.log('route:', await ev(`JSON.stringify(__quest.route())`));
await wait(1500);
// a guest reaching the goal: the login card
await ev(`__drops.reply({t:'cpicked',c:'cmp-devbonk01',d:5,ok:true,got:3,goal:3,login:true}); 1`); await wait(600);
await shot('06-guest-login-to-claim.jpg');
console.log(await tap('.near-x')); await wait(400);
// completion (as if after login + cclaim)
await ev(`__drops.reply({t:'cpicked',c:'cmp-devbonk01',d:-1,ok:true,got:3,goal:3,done:true,serial:7,claim:{url:'https://bonk.example/claim?c=abc',code:'BONK-7X2Q'}}); 1`); await wait(900);
await shot('07-badge-card.jpg');
await fingerTap(206, 60); await wait(400);
console.log('card closed:', await ev(`!document.getElementById('near-drop-win')`));
console.log(await tap('#near-quest-chip')); await wait(800);
await shot('08-quest-sheet-claimed.jpg');
console.log(await tap('.near-x')); await wait(300);
console.log(await tap('#near-book')); await wait(2500);
await shot('09-book-badges.jpg');
console.log('book badges:', await ev(`document.getElementById('near-body').innerText.split('Badges')[1]?.slice(0,120)`));
await ev(`document.querySelector('.near-x').click(); 1`);
// reload: picked spots stay hidden
await cmd('Page.navigate', { url: `${BASE}/?autoenter&at=valley` }); await wait(8000);
await ev(`__drops.inject(__drops.sample()); 1`); await wait(800);
console.log('after reload: sprites', await ev(`__drops.spots('cmp-devbonk01').length`), '(done → 0 expected)');
await ev(`__drops.remove('cmp-devbonk01'); 1`);
// "Show me the way" from the courtyard: to the valley (lantern trail) and to the Market (via the hub)
for (const [zone, id] of [['valley', 'cmp-devvalley1'], ['bazaar', 'cmp-devmarket1']]) {
  await cmd('Page.navigate', { url: `${BASE}/?autoenter` }); await wait(8000);
  await ev(`__drops.inject(__drops.sample({id:'${id}',zone:'${zone}',sponsor:{name:'Shitzu',emoji:'🐶',color:'#7c5cff'},drop:{name:'SHITZU bones',emoji:'🦴',count:12},title:'Bone run'})); 1`);
  const p0 = await ev(`JSON.stringify(__qh.me().root.position)`);
  await tap('#near-quest-chip'); await wait(700);
  if (zone === 'bazaar') await shot('10-two-zones-sheet.jpg');
  console.log(zone, await tap('[data-dgo]')); await wait(500);
  console.log(' route', await ev(`JSON.stringify(__quest.route())`));
  await wait(12000);
  console.log(' moved from', p0, 'to', await ev(`JSON.stringify(__qh.me().root.position)`));
  await shot(`11-walking-to-${zone}.jpg`);
}
console.log(errs.length ? 'page errors: ' + [...new Set(errs)].join(' | ') : 'no page errors');
chrome.kill(); process.exit(0);
