// Quest e2e in a phone-size headless Chrome: welcome → locked pet → quest after enter → walk to the valley →
// gather → grant → sit → rescued; book and bag pointers; logged-in variant.
import { open, wait } from './cdp.mjs';
const [BASE, OUT, WORKER] = process.argv.slice(2);
const b = await open(OUT);
const pos = async () => JSON.parse(await b.ev(`JSON.stringify((({x,z})=>({x:Math.round(x),z:Math.round(z)}))(__qh.me().root.position))`));
const chip = () => b.ev(`document.getElementById('near-quest-chip')?.innerText`);
const shut = async () => { await b.ev(`document.getElementById('near-body').closest('.card').scrollTop = 0; 1`); await wait(100); await b.tap('.near-x'); };
const sheet = () => b.ev(`document.getElementById('near-body')?.innerText.slice(0,500)`);

// 1. welcome card: the note under the pet strip, a locked pet
await b.nav(`${BASE}/?x`, 6000);
await b.ev(`document.getElementById('near-look').open = true; 1`); await wait(400);
await b.ev(`document.querySelector('.q-welcome-note').scrollIntoView({block:'center'}); 1`); await wait(300);
await b.shot('01-welcome-pets-note.jpg');
await b.tap('#pets .pet-tile.locked'); await wait(1200);
console.log('pet sheet visible:', await b.ev(`!document.getElementById('petsheet').classList.contains('hidden')`), '| note:', await b.ev(`document.getElementById('pet-note').innerText`));
await b.shot('02-locked-pet-sheet.jpg');
await b.tap('#near-pet-quest'); await wait(600);
console.log('toast:', await b.ev(`document.getElementById('toast').innerText`));
await b.tap('#btn-enter'); await wait(3000);
console.log('quest opened after enter:', await b.ev(`document.getElementById('near-body').dataset.kind`), '| chip:', await chip());
await b.shot('03-quest-sheet-start.jpg');
await b.ev(`document.querySelector('#near-body .q-s2').scrollIntoView(); 1`); await wait(300);
await b.shot('04-quest-sheet-season2.jpg');
// first-time hint is on screen right after enter? (shown 7 s)
await shut(); await wait(400);
console.log('hint:', await b.ev(`document.getElementById('hint').innerText`), '| hidden?', await b.ev(`document.getElementById('hint').classList.contains('hidden')`));
await b.shot('05-hud-chip-hint.jpg');

// 2. empty bag + book pointers
await b.tap('#near-bag'); await wait(500);
await b.shot('06-bag-empty.jpg');
await b.tap('#near-body [data-quest]'); await wait(500);
console.log('bag link → quest:', await b.ev(`document.getElementById('near-body').dataset.kind`));
await shut(); await wait(300);
await b.tap('#near-book'); await wait(1500);
await b.shot('07-book-not-yet.jpg');
await b.tap('#near-body .q-link'); await wait(500);
console.log('book link → quest:', await b.ev(`document.getElementById('near-body').dataset.kind`));

// 3. Show me the way: from the courtyard along the lanterns to the Gate
console.log('start at', await pos());
await b.tap('#q-go'); await wait(500);
console.log('trail visible:', await b.ev(`__qh.scene.getObjectByName('meme-valley').children.find(c=>c.type==='Group' && c.children.length===14)?.visible`));
await wait(3000); await b.shot('08-walking-lanterns.jpg');
let p;
// headless Chrome runs at a few fps (the walk is slow here): watch it follow the lanterns for a while, then skip ahead
for (let i = 0; i < 25; i++) { await wait(1000); p = await pos(); }
console.log('after 25 s of guided walking:', p, '| waypoints left:', await b.ev(`__quest.route().length`));
await b.nav(`${BASE}/?autoenter&at=valley`, 8000);
console.log('at the valley:', await pos(), '| chip:', await chip());
await b.shot('09-arrived-valley.jpg');

// 4. gather with the quest's own button (walks to the nearest rock/shroom; arriving picks), then grant + sit, twice
for (let round = 1; round <= 2; round++) {
  for (let i = 0; i < 8; i++) {
    await b.tap('#near-quest-chip'); await wait(500);
    const go = await b.ev(`document.getElementById('q-go')?.innerText ?? ''`);
    console.log(`  round ${round}: next = ${go.replace(/\s+/g, ' ')} | chip = ${(await chip()).replace(/\n/g, ' ')}`);
    if (round === 1 && i === 0) await b.shot('10-quest-in-valley.jpg');
    if (round === 2 && i === 0) await b.shot('14-quest-one-done.jpg');
    if (!go) break;
    await b.tap('#q-go');
    if (/Shibby|Froggo/.test(go)) { for (let k = 0; k < 30 && !(await b.ev(`document.getElementById('near-body').dataset.kind === 'wish' && !document.getElementById('near-sheet').classList.contains('hidden')`)); k++) await wait(1000); break; }
    for (let k = 0; k < 40; k++) { await wait(1000); if ((await b.ev(`document.getElementById('toast').innerText`)).includes('+1')) break; }
    await wait(1200);
  }
  if (round === 1) await b.shot('11-wish-sheet.jpg');
  if (await b.tap('#near-grant')) {
    await wait(700); console.log('  sitting, chip:', (await chip()).replace(/\n/g, ' '));
    if (round === 1) await b.shot('12-sitting-wish.jpg');
    for (let k = 0; k < 20 && !(await b.ev(`document.getElementById('toast').innerText`)).match(/follows you|rescued/); k++) await wait(500);
    console.log('  toast:', await b.ev(`document.getElementById('toast').innerText`));
    if (round === 1) await b.shot('13-rescued.jpg');
    await wait(1500);
    await b.tap('#btn-end'); await wait(1500);
  }
  console.log(`after round ${round}: chip =`, (await chip()).replace(/\n/g, ' '));
}
await b.shot('15-hud-all-done.jpg');
await b.tap('#near-quest-chip'); await wait(500);
console.log('sheet:', (await sheet()).replace(/\n+/g, ' | ').slice(0, 300));
await b.shot('16-quest-all-done.jpg');
await shut(); await wait(300);
await b.tap('#near-book'); await wait(1500);
await b.shot('17-book-after.jpg');
await shut(); await wait(300);
await b.tap('#btn-pet'); await wait(1000);
await b.shot('18-pet-sheet-owned.jpg');

// 5. logged-in player: link a test account to this visitor, reload
const pid = await b.ev(`localStorage.getItem('qh.pid')`);
console.log('link:', JSON.stringify(await (await fetch(`${WORKER}/api/near/test-link?k=localkey&pid=${pid}&account=quest${Date.now().toString(36)}.testnet`)).json()).slice(0, 120));
await b.nav(`${BASE}/?autoenter&at=court`, 8000);
await b.ev(`__qh.near.open('quest'); 1`); await wait(800);
await b.ev(`document.querySelector('#near-body .q-chain').scrollIntoView({block:'center'}); 1`); await wait(300);
console.log('logged-in line:', await b.ev(`document.querySelector('#near-body .q-chain').innerText`));
await b.shot('19-quest-logged-in.jpg');
b.done(); process.exit(0);
