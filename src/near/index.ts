// NEAR edition client: Meme Valley, Leaves, Kettle's Living Market, the Market Cup, the Rescue Book with NEAR
// receipts, and the labelled preview screens. Design: design/gdd/edition-near.md, meme-valley.md.
// Only loaded when built with VITE_EDITION=near. Everything here talks to the server over the hall socket
// (pick, grant, wishDone, craft, book, trade, cupJoin) and reads /api/near/* for boards.
import * as THREE from 'three';
import './near.css';
import { Pet } from '../pets';
import { CAVES, FRENS, GATE, ITEMS, NODES, POND, RECIPES, VALLEY, WORKBENCH, GATHER, dist, type Item } from '../valley';
import { CUP, KETTLE, MARKET, TRADE_ZONE } from '../market';
import { LOOKOUT, COURT, PLACES, TEASERS } from '../layout';
import { BADGES } from '../badges';
import { PREVIEWS } from './previews';

export const NEAR = import.meta.env.VITE_EDITION === 'near';

/** NEAR edition pets: only frens you can rescue (no pets are sold in this edition). Indices into PETS. */
export const NEAR_PETS = FRENS.map((f) => ({ k: f.pet, name: f.name, how: `Rescue ${f.name} in Meme Valley (north-east, past the Tea House) and ${f.name} follows you.` }));

type Msg = Record<string, unknown> & { t: string };
export interface NearHost {
  scene: THREE.Scene;
  heightAt(x: number, z: number): number;
  clickables: THREE.Object3D[];
  send(m: Record<string, unknown>): void;
  toast(text: string, ms?: number): void;
  pid: string;
  /** my avatar's root (position) */
  me(): THREE.Object3D;
  walkTo(p: THREE.Vector3): void;
  /** start an open-ended sit right here (the wish sit) */
  sitHere(): void;
  /** stop sitting (used when a wish is cancelled by the server) */
  sitting(): boolean;
  /** wear a rescued fren as your pet */
  setPet(k: number): void;
  /** the big board in the Trading Hall */
}

interface Econ {
  leaves: number;
  bag: Record<string, number>;
  today: Record<string, number>;
  streak: number;
  frens: { fren: string; serial: number; rescues: number }[];
  drips: { kind: string; serial: number }[];
}
interface Quote {
  item: Item;
  bid: number;
  ask: number;
  mid: number;
}

const EXPLORER = 'https://explorer.testnet.near.org';
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const short = (owner: string) => (owner.length > 12 ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : owner);
const itemLabel = (k: string) => `${ITEMS[k as Item]?.emoji ?? '•'} ${ITEMS[k as Item]?.name ?? k}`;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function setupNear(h: NearHost) {
  document.body.classList.add('edition-near');
  // PumpHall plays Bitcoin and NEAR in this edition, and holds the Market stall; the valley is a place.
  for (const p of PLACES) {
    if (p.id === 'pump') p.hint = 'Guess Bitcoin or NEAR up or down on the big board (points, no money). The Market stall is inside.';
    if (p.id === 'court') p.hint = 'North: the Quiet Hall (sit). South: PumpHall and the Market. North-east past the Tea House: Meme Valley.';
  }
  // PumpHall buttons are written for SOL / SKR in index.html: relabel them for Bitcoin / NEAR
  const relabel = (sel: string, attr: 'm' | 'dm') =>
    document.querySelectorAll<HTMLButtonElement>(sel).forEach((b, i) => {
      const k = (['BTC', 'NEAR'] as const)[i];
      if (!k) return;
      b.dataset[attr] = k;
      b.textContent = attr === 'm' ? `${k === 'BTC' ? 'Bitcoin' : 'NEAR'} · ${k === 'BTC' ? 5 : 15} min` : k === 'BTC' ? 'Bitcoin' : 'NEAR';
    });
  relabel('button[data-m]', 'm');
  relabel('button[data-dm]', 'dm');
  const duelOpen = document.querySelector('label.duel-open');
  if (duelOpen?.lastChild) duelOpen.lastChild.textContent = ' Open to duels: bump into someone here and tap ⚔ to call Bitcoin or NEAR against them. Points only.';
  // the Patron banner avenue is a paid (SOL) rental: nothing is sold in this edition, so the stands are hidden
  h.scene.traverse((o) => {
    if (o.userData.action === 'spot' && o.userData.kind === 'banner' && o.parent) {
      o.parent.visible = false;
      const i = h.clickables.indexOf(o);
      if (i >= 0) h.clickables.splice(i, 1);
    }
  });
  // no Seeker-only badge and no Solana wording in this edition
  const seekerBadge = BADGES.findIndex((b) => b.id === 'seeker-lotus');
  if (seekerBadge >= 0) BADGES.splice(seekerBadge, 1);
  const market = (TEASERS as unknown as { id: string; text: string }[]).find((t) => t.id === 'market');
  if (market) market.text = 'The Night Market is being set up: a Sitting Bazaar where people sit on mats and offer what they made. Peek through the telescope at the Lookout.';
  if (!PLACES.some((p) => p.id === 'valley')) {
    PLACES.push({ id: 'valley', name: 'Meme Valley', x: VALLEY.x, z: VALLEY.z, r: VALLEY.r, hint: 'Gather rocks and shrooms, and sit with a lost fren to bring them home.', view: [GATE.x - 6, GATE.z + 10], look: [VALLEY.x, VALLEY.z] });
  }
  let econ: Econ = { leaves: 0, bag: {}, today: {}, streak: 0, frens: [], drips: [] };
  let quotes: Quote[] = [];
  let pending: { kind: 'node' | 'fren' | 'bench' | 'kettle'; id: string; at: THREE.Vector3; reach: number } | null = null;
  let wish: { fren: string; until: number; sent: boolean } | null = null;
  let tradeQty = 1;
  let cupMode = false;
  let cupState: { round: string; end: number; entrants: number; top: { owner: string; score: number }[]; me?: { chips: number; bag: Record<string, number>; score: number; rank: number } } | null =
    null;
  let firstSitDone = econ.frens.length > 0;

  // ---------- HUD ----------
  const bar = document.createElement('div');
  bar.id = 'near-bar';
  bar.innerHTML = `
    <button class="pill" id="near-leaves" title="Leaves: earned by sitting. Play money, no cash value.">🍃 <b>0</b></button>
    <button class="pill" id="near-bag" title="Your bag">🎒</button>
    <button class="pill" id="near-book" title="Rescue Book">📖</button>
    <button class="pill" id="near-market" title="Market and Market Cup">🛒</button>`;
  $('hud').appendChild(bar);

  const overlay = document.createElement('section');
  overlay.id = 'near-sheet';
  overlay.className = 'overlay hidden';
  overlay.innerHTML = `<div class="card near-card"><button class="near-x" aria-label="Close">✕</button><div id="near-body"></div></div>`;
  document.body.appendChild(overlay);
  const body = () => $('near-body');
  const close = () => overlay.classList.add('hidden');
  overlay.querySelector('.near-x')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => e.target === overlay && close());
  const show = (html: string) => {
    body().innerHTML = html;
    overlay.classList.remove('hidden');
  };
  const isOpen = (kind: string) => !overlay.classList.contains('hidden') && body().dataset.kind === kind;

  function renderBar() {
    $('near-leaves').querySelector('b')!.textContent = String(econ.leaves);
  }

  // ---------- 3D: the valley ----------
  const root = new THREE.Group();
  root.name = 'meme-valley';
  h.scene.add(root);
  const y = (x: number, z: number) => h.heightAt(x, z);
  const mat = (color: number, emissive = 0, ei = 0) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.85, flatShading: true });
  const tap = (o: THREE.Object3D, kind: string, id: string) => {
    o.userData.action = 'near';
    o.userData.near = { kind, id };
    h.clickables.push(o);
  };
  // misty purple-green ground patch
  const patch = new THREE.Mesh(new THREE.CircleGeometry(VALLEY.r, 40), new THREE.MeshStandardMaterial({ color: 0x8a7fb0, transparent: true, opacity: 0.22, depthWrite: false }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(VALLEY.x, y(VALLEY.x, VALLEY.z) + 0.05, VALLEY.z);
  root.add(patch);
  // Wen Moon Lake (a pond) and the Copium Caves (a rock arch)
  const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 32), new THREE.MeshStandardMaterial({ color: 0x6fa8c8, roughness: 0.2, metalness: 0.1 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND.x, y(POND.x, POND.z) + 0.07, POND.z);
  root.add(pond);
  const cave = new THREE.Mesh(new THREE.TorusGeometry(3.2, 1.1, 6, 12, Math.PI), mat(0x5b5470));
  cave.position.set(CAVES.x, y(CAVES.x, CAVES.z), CAVES.z - 3);
  root.add(cave);
  // signpost at the Gate
  const sign = makeSign(['🌙 Meme Valley', 'lost frens · rocks · shrooms']);
  sign.position.set(GATE.x - 2, y(GATE.x - 2, GATE.z + 2), GATE.z + 2);
  sign.rotation.y = -0.6;
  root.add(sign);
  // workbench
  const bench = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1), mat(0x9c7a52));
  top.position.y = 0.95;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 0.8), mat(0x7a5c3c));
  legs.position.y = 0.45;
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 16), mat(0xb48cff, 0xb48cff, 0.9));
  glow.position.set(0, 1.25, 0);
  bench.add(top, legs, glow, makeSign(['🔨 Workbench'], 2.1, 1.6));
  bench.position.set(WORKBENCH.x, y(WORKBENCH.x, WORKBENCH.z), WORKBENCH.z);
  tap(bench, 'bench', 'bench');
  root.add(bench);
  // Kettle's stall in the Trading Hall
  const stall = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.2), mat(0x8a6a48));
  counter.position.y = 0.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 4), mat(0x2bd4a0, 0x2bd4a0, 0.25));
  roof.position.y = 2.6;
  roof.rotation.y = Math.PI / 4;
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat(0x444a52, 0x9945ff, 0.15));
  kettle.position.set(0, 1.4, 0);
  stall.add(counter, roof, kettle, makeSign(['🛒 Market', 'buy · sell · Cup'], 3.6, 2.4));
  stall.position.set(KETTLE.x, y(KETTLE.x, KETTLE.z), KETTLE.z);
  // face the entrance (north edge of the hall), so the sign reads the right way round as you walk in
  stall.rotation.y = Math.atan2(TRADE_ZONE.x - KETTLE.x, TRADE_ZONE.z - TRADE_ZONE.r - KETTLE.z);
  tap(stall, 'kettle', 'kettle');
  root.add(stall);
  // the telescope at the Lookout: the "Coming next" door to the preview screens
  const scope = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 10), mat(0xc9a35a, 0xc9a35a, 0.2));
  tube.rotation.z = Math.PI / 3;
  tube.position.y = 1.4;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 6), mat(0x555555));
  stand.position.y = 0.6;
  scope.add(tube, stand, makeSign(['🔭 Coming next', 'preview'], 2.6, 1.8));
  const sx = LOOKOUT.x + 4;
  const sz = LOOKOUT.z + 6;
  scope.position.set(sx, y(sx, sz), sz);
  tap(scope, 'scope', 'scope');
  root.add(scope);

  // gathering nodes
  const nodeMeshes = new Map<string, THREE.Object3D>();
  for (const n of NODES) {
    const g = new THREE.Group();
    if (n.item === 'moon_rock') {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mat(0xc9c4d6, 0x9fa6ff, 0.25));
      r.position.y = 0.45;
      g.add(r);
    } else if (n.item === 'rug_yarn') {
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), mat(0xe58fb5, 0xe58fb5, 0.15));
        b.position.set((i - 1) * 0.45, 0.42, (i % 2) * 0.3);
        g.add(b);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6), mat(0xf2ead8));
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 8), mat(0x9b5de5, 0x9b5de5, 0.5));
        stem.position.set((i - 1) * 0.4, 0.2, (i % 2) * 0.25);
        cap.position.set((i - 1) * 0.4, 0.5, (i % 2) * 0.25);
        g.add(stem, cap);
      }
    }
    g.position.set(n.x, y(n.x, n.z), n.z);
    tap(g, 'node', n.id);
    nodeMeshes.set(n.id, g);
    root.add(g);
  }

  // lost frens: the CC0 Shiba and Frog models standing still at their spots, glowing softly
  const frenPets: { fren: (typeof FRENS)[number]; pet: Pet; ring: THREE.Mesh }[] = [];
  for (const f of FRENS) {
    const anchor = new THREE.Object3D();
    anchor.position.set(f.x, y(f.x, f.z), f.z);
    const pet = new Pet(f.pet, anchor, h.heightAt);
    pet.root.position.set(f.x, y(f.x, f.z), f.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 24), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.x, y(f.x, f.z) + 0.06, f.z);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(f.x, y(f.x, f.z) + 0.8, f.z);
    tap(hit, 'fren', f.id);
    const label = makeSign([`${f.name}`, 'lost fren'], 2.4, 1.6);
    label.position.x += 1.2;
    label.position.set(f.x, y(f.x, f.z), f.z);
    root.add(pet.root, ring, hit, label);
    frenPets.push({ fren: f, pet, ring });
  }

  // lantern trail from the courtyard to the Gate (shown after the first sit until the first rescue)
  const trail = new THREE.Group();
  const lanternM = mat(0xffd27a, 0xffb347, 1.2);
  for (let i = 1; i <= 14; i++) {
    const t = i / 15;
    const x = COURT.x + (GATE.x - COURT.x) * t + Math.sin(t * 6) * 3;
    const z = COURT.z + (GATE.z - COURT.z) * t;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lanternM);
    l.position.set(x, y(x, z) + 1.2, z);
    trail.add(l);
  }
  trail.visible = false;
  root.add(trail);

  // ---------- taps ----------
  function act(kind: string, id: string) {
    if (kind === 'node') h.send({ t: 'pick', node: id });
    else if (kind === 'fren') openWish(id);
    else if (kind === 'bench') openBench();
    else if (kind === 'kettle') openMarket();
  }
  function tapObj(o: THREE.Object3D) {
    const d = o.userData.near as { kind: string; id: string };
    if (d.kind === 'scope') return openPreviews();
    const target =
      d.kind === 'node' ? NODES.find((n) => n.id === d.id)! : d.kind === 'fren' ? FRENS.find((f) => f.id === d.id)! : d.kind === 'bench' ? WORKBENCH : KETTLE;
    const reach = d.kind === 'kettle' ? TRADE_ZONE.r - 2 : d.kind === 'bench' ? GATHER.reach + 1.5 : GATHER.reach;
    const me = h.me().position;
    if (dist(me, target) <= reach) return act(d.kind, d.id);
    // walk up to it first, then act on arrival
    const at = new THREE.Vector3(target.x, 0, target.z);
    const dir = new THREE.Vector3(me.x - target.x, 0, me.z - target.z).normalize().multiplyScalar(Math.min(reach - 0.6, 1.6));
    pending = { kind: d.kind as 'node', id: d.id, at, reach };
    h.walkTo(at.clone().add(dir));
  }

  // ---------- sheets ----------
  function need(needs: Partial<Record<string, number>>) {
    return Object.entries(needs)
      .map(([k, n]) => `<li class="${(econ.bag[k] ?? 0) >= (n ?? 0) ? 'have' : 'miss'}">${itemLabel(k)} <b>${econ.bag[k] ?? 0}/${n}</b></li>`)
      .join('');
  }
  function openWish(id: string) {
    const f = FRENS.find((x) => x.id === id)!;
    const helped = econ.frens.find((x) => x.fren === id);
    show(`<div data-kind="wish"></div><h2>${esc(f.name)}</h2><p class="small">“${esc(f.line)}”</p>
      <ul class="near-needs">${need(f.wish)}<li>🧘 sit beside ${esc(f.name)} for ${f.sitMin} min</li></ul>
      ${helped ? `<p class="small">You rescued ${esc(f.name)} before (#${helped.serial}). Helping again gives hearts and Leaves.</p>` : ''}
      <p class="small">Anyone sitting beside ${esc(f.name)} when the wish is granted is rescued too.</p>
      <button class="primary" id="near-grant">Grant the wish</button>
      <button class="ghost" id="near-sitby">Just sit beside (co-rescue)</button>`);
    body().dataset.kind = 'wish';
    $('near-grant').addEventListener('click', () => {
      h.send({ t: 'grant', fren: id });
      close();
    });
    $('near-sitby').addEventListener('click', () => {
      close();
      h.sitHere();
      h.toast(`Sitting beside ${f.name}. When someone grants the wish, you are rescued too.`, 5000);
    });
  }
  function openBench() {
    const r = RECIPES[0];
    show(`<h2>🔨 Workbench</h2><p class="small">Craft drip for your frens. Every craft gets a receipt on NEAR.</p>
      <div class="near-row"><div><b>${esc(r.name)}</b><ul class="near-needs">${need(r.needs)}<li>🍃 ${r.fee} Leaves</li></ul></div>
      <button class="primary" id="near-craft">Craft</button></div>`);
    body().dataset.kind = 'bench';
    $('near-craft').addEventListener('click', () => h.send({ t: 'craft', r: r.id }));
  }
  function openBag() {
    const items = Object.entries(econ.bag).filter(([, n]) => n > 0);
    show(`<h2>🎒 Bag</h2>${items.length ? `<ul class="near-needs">${items.map(([k, n]) => `<li class="have">${itemLabel(k)} <b>${n}</b></li>`).join('')}</ul>` : '<p class="small">Empty. Tap rocks, yarn and shrooms in Meme Valley (north-east, past the Tea House).</p>'}
      <p class="small">🍃 ${econ.leaves} Leaves · today: ${econ.today.sit ?? 0} from sitting, ${econ.today.market_sell ?? 0} from the Market, ${econ.today.wish ?? 0} from wishes</p>
      <p class="near-foot">Leaves are play money. No cash value.</p>`);
    body().dataset.kind = 'bag';
  }
  async function openBook() {
    show(`<h2>📖 Rescue Book</h2><p class="small">Loading…</p>`);
    body().dataset.kind = 'book';
    h.send({ t: 'book' });
  }
  function renderBook(m: Msg) {
    const receipts = (m.receipts as { job: string; method: string; status: string; tx: string | null }[]) ?? [];
    const rec = (job: string) => {
      const r = receipts.find((x) => x.job === job);
      if (!r) return '';
      if (r.status === 'done' && r.tx) return `<a class="near-receipt" href="${EXPLORER}/transactions/${esc(r.tx)}" target="_blank" rel="noopener">receipt ↗</a>`;
      if (r.status === 'mock') return '<span class="near-dot">mock</span>';
      return '<span class="near-dot" title="queued for NEAR">syncing</span>';
    };
    const frens = (m.frens as Econ['frens']) ?? [];
    const drips = (m.drips as Econ['drips']) ?? [];
    const tiles = FRENS.map((f) => {
      const got = frens.find((x) => x.fren === f.id);
      return `<li class="${got ? 'have' : 'miss'}">${f.pet === 1 ? '🐕' : '🐸'} <b>${esc(f.name)}</b> ${got ? `#${got.serial} · rescued ${got.rescues}× ${rec(`fren-${f.id}-${got.serial}`)}` : '<span class="small">not yet</span>'}</li>`;
    }).join('');
    const dl = drips.map((d) => `<li class="have">${itemLabel(d.kind)} #${d.serial} ${rec(`drip-${d.kind}-${d.serial}`)}</li>`).join('');
    body().innerHTML = `<h2>📖 Rescue Book</h2><ul class="near-needs">${tiles}</ul>${dl ? `<div class="label">Drip</div><ul class="near-needs">${dl}</ul>` : ''}
      <p class="small">Your frens and drip are recorded on NEAR testnet under an account made for you: <code>${esc(short(String(m.owner)))}</code>. You never need a wallet.</p>
      <p class="near-foot">Receipts are bound to you and cannot be sold.</p>`;
  }

  async function loadMarket() {
    try {
      const r = (await (await fetch(`/api/near/market?pid=${encodeURIComponent(h.pid)}`)).json()) as { quotes: Quote[]; history: { ts: number; item: string; bid: number }[]; cup: typeof cupState };
      quotes = r.quotes;
      cupState = r.cup;
      return r.history;
    } catch {
      return [];
    }
  }
  async function openMarket() {
    show(`<h2>🛒 Market</h2><p class="small">Loading prices…</p>`);
    body().dataset.kind = 'market';
    const hist = await loadMarket();
    renderMarket(hist);
  }
  function spark(hist: { ts: number; item: string; bid: number }[], item: string) {
    const pts = hist.filter((p) => p.item === item).slice(-40);
    if (pts.length < 2) return '';
    const min = Math.min(...pts.map((p) => p.bid));
    const max = Math.max(...pts.map((p) => p.bid), min + 1);
    const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 80},${18 - ((p.bid - min) / (max - min)) * 16}`).join(' ');
    return `<svg class="near-spark" viewBox="0 0 80 20" aria-hidden="true"><polyline points="${d}"/></svg>`;
  }
  function renderMarket(hist: { ts: number; item: string; bid: number }[] = []) {
    if (!isOpen('market')) return;
    const cup = cupState;
    const inCup = !!cup?.me;
    const rows = MARKET.map((m) => {
      const q = quotes.find((x) => x.item === m.item);
      const held = cupMode ? (cup?.me?.bag[m.item] ?? 0) : (econ.bag[m.item] ?? 0);
      return `<div class="near-row"><div>${itemLabel(m.item)} ${spark(hist, m.item)}<div class="small">sell ${q?.bid ?? '–'} · buy ${q?.ask ?? '–'} · you hold ${held}</div></div>
        <div class="near-btns"><button data-side="sell" data-item="${m.item}">Sell</button><button data-side="buy" data-item="${m.item}">Buy</button></div></div>`;
    }).join('');
    const left = cup ? cup.end - Date.now() : 0;
    const top = (cup?.top ?? []).map((t, i) => `<li>${i + 1}. <code>${esc(short(t.owner))}</code> <b>${t.score}</b></li>`).join('');
    body().innerHTML = `<h2>🛒 Market</h2>
      <div class="chips near-mode"><button data-mode="leaves" class="${cupMode ? '' : 'on'}">🍃 Leaves (${econ.leaves})</button><button data-mode="cup" class="${cupMode ? 'on' : ''}">🏆 Cup${inCup ? ` (${cup!.me!.chips} chips)` : ''}</button></div>
      <div class="chips near-qty">${[1, 5, 10].map((n) => `<button data-qty="${n}" class="${tradeQty === n ? 'on' : ''}">×${n}</button>`).join('')}</div>
      ${cupMode && !inCup ? `<p class="small">Market Cup round ${esc(cup?.round ?? '')}: ${mmss(left)} left · ${cup?.entrants ?? 0} entrants. Free: 200 play chips, prizes in Leaves.</p><button class="primary" id="near-cup-join">Join this round</button>` : rows}
      ${cupMode ? `<div class="label">Live top 10 ${inCup ? `· you: #${cup!.me!.rank}, score ${cup!.me!.score}` : ''}</div><ol class="near-top">${top || '<li class="small">No entrants yet</li>'}</ol>
        <p class="small">Each round is committed on NEAR before it starts and settled after it ends, so anyone can check it.</p>` : `<p class="small">Prices move with every player's trades. The Market buys up to 60 Leaves' worth from you a day (today: ${econ.today.market_sell ?? 0}).</p>`}
      <p class="near-foot">Play money. No cash value. Free to enter.</p>`;
    body()
      .querySelectorAll<HTMLButtonElement>('button[data-side]')
      .forEach((b) => b.addEventListener('click', () => h.send({ t: 'trade', item: b.dataset.item, side: b.dataset.side, n: tradeQty, cup: cupMode })));
    body()
      .querySelectorAll<HTMLButtonElement>('button[data-qty]')
      .forEach((b) => b.addEventListener('click', () => ((tradeQty = Number(b.dataset.qty)), renderMarket(hist))));
    body()
      .querySelectorAll<HTMLButtonElement>('button[data-mode]')
      .forEach((b) => b.addEventListener('click', () => ((cupMode = b.dataset.mode === 'cup'), renderMarket(hist))));
    document.getElementById('near-cup-join')?.addEventListener('click', () => h.send({ t: 'cupJoin' }));
  }
  function openPreviews() {
    show(`<h2>🔭 Coming next</h2><p class="near-banner">Preview: sample data</p>
      <div class="near-previews">${PREVIEWS.map((p, i) => `<button class="near-prev" data-i="${i}"><span>${p.emoji}</span><b>${esc(p.title)}</b><small>${esc(p.tag)}</small></button>`).join('')}</div>
      <p class="small">These screens show what is being built next. Nothing here is live yet.</p>`);
    body().dataset.kind = 'previews';
    body()
      .querySelectorAll<HTMLButtonElement>('.near-prev')
      .forEach((b) =>
        b.addEventListener('click', () => {
          const p = PREVIEWS[Number(b.dataset.i)];
          body().innerHTML = `<p class="near-banner">Preview: sample data</p><h2>${p.emoji} ${esc(p.title)}</h2>${p.html}<button class="ghost" id="near-prev-back">Back</button>`;
          $('near-prev-back').addEventListener('click', openPreviews);
        }),
      );
  }

  $('near-bag').addEventListener('click', openBag);
  $('near-book').addEventListener('click', openBook);
  $('near-market').addEventListener('click', () => {
    if (dist(h.me().position, TRADE_ZONE) <= TRADE_ZONE.r) return openMarket();
    h.toast('The Market stall is in PumpHall (south road). Walking there…', 3500);
    pending = { kind: 'kettle', id: 'kettle', at: new THREE.Vector3(KETTLE.x, 0, KETTLE.z), reach: TRADE_ZONE.r - 2 };
    h.walkTo(new THREE.Vector3(KETTLE.x, 0, KETTLE.z + 3));
  });
  $('near-leaves').addEventListener('click', openBag);

  // phones: hidden time does not count toward a sit
  document.addEventListener('visibilitychange', () => h.send({ t: 'vis', h: document.visibilityState === 'hidden' }));

  // ---------- messages ----------
  function onMessage(m: Msg) {
    switch (m.t) {
      case 'econ':
        econ = { ...econ, ...(m as unknown as Econ) };
        firstSitDone = econ.frens.length > 0 || (econ.today.sit ?? 0) > 0;
        trail.visible = firstSitDone && econ.frens.length === 0;
        renderBar();
        return;
      case 'leaves': {
        econ.leaves = Number(m.balance) || econ.leaves;
        renderBar();
        if (Number(m.paid) > 0) h.toast(`+${m.paid} 🍃 Leaves for sitting`, 3000);
        if (!firstSitDone && econ.frens.length === 0) {
          firstSitDone = true;
          trail.visible = true;
          setTimeout(() => h.toast('Someone is lost in the valley. Follow the lanterns past the Tea House 🏮', 7000), 3200);
        }
        return;
      }
      case 'picked': {
        if (m.ok) {
          const k = String(m.item);
          econ.bag[k] = (econ.bag[k] ?? 0) + 1;
          h.toast(`${itemLabel(k)} +1 (${m.stock} left here for you)`, 1600);
          const g = nodeMeshes.get(String(m.node));
          if (g) g.scale.setScalar(Number(m.stock) > 0 ? 1 : 0.6);
        } else if (m.why === 'empty') {
          const next = Number(m.next) - Date.now();
          h.toast(`Picked clean. Grows back in ${mmss(next)}.`, 2500);
        } else if (m.why !== 'too fast') h.toast(String(m.why), 2500);
        return;
      }
      case 'wish': {
        if (!m.ok) {
          const f = FRENS.find((x) => x.id === m.fren);
          h.toast(m.why === 'missing' && f ? `${f.name} needs: ${Object.entries(f.wish).map(([k, n]) => `${n} ${ITEMS[k as Item].name}`).join(', ')}` : String(m.why), 4000);
          return;
        }
        for (const [k, n] of Object.entries(FRENS.find((x) => x.id === m.fren)?.wish ?? {})) econ.bag[k] = Math.max(0, (econ.bag[k] ?? 0) - (n ?? 0));
        wish = { fren: String(m.fren), until: Number(m.until), sent: false };
        h.sitHere();
        h.toast('Sit quietly beside them for a minute…', 4000);
        return;
      }
      case 'wishWait':
        if (wish) wish = { ...wish, until: Date.now() + Number(m.left) + 300, sent: false };
        return;
      case 'wishCancelled':
        wish = null;
        h.toast(`You ${m.why}. The materials are back in your bag.`, 4000);
        for (const [k, n] of Object.entries(FRENS.find((x) => x.id === m.fren)?.wish ?? {})) econ.bag[k] = (econ.bag[k] ?? 0) + (n ?? 0);
        return;
      case 'rescued': {
        wish = null;
        const f = FRENS.find((x) => x.id === m.fren)!;
        econ.leaves += Number(m.paid) || 0;
        renderBar();
        if (m.first) {
          econ.frens.push({ fren: f.id, serial: Number(m.serial), rescues: 1 });
          trail.visible = false;
          h.setPet(f.pet);
          h.toast(`${f.name} #${m.serial} ${m.co ? 'was rescued with you' : 'follows you home'} ✨ +${m.paid} 🍃 · recorded on NEAR`, 6000);
        } else h.toast(`${f.name} is happy to see you again ❤️ +${m.paid} 🍃`, 4000);
        if (m.helped) h.toast(`You helped ${m.helped} other${Number(m.helped) === 1 ? '' : 's'} rescue ${f.name} 🤝`, 4500);
        return;
      }
      case 'rescue': {
        const fp = frenPets.find((x) => x.fren.id === m.fren);
        fp?.pet.pat();
        return;
      }
      case 'crafted': {
        if (!m.ok) return h.toast(m.why === 'missing' ? 'Missing materials for that recipe.' : String(m.why), 3500);
        econ.leaves = Number(m.balance);
        const r = RECIPES.find((x) => x.id === m.kind)!;
        for (const [k, n] of Object.entries(r.needs)) econ.bag[k] = Math.max(0, (econ.bag[k] ?? 0) - (n ?? 0));
        econ.bag[r.id] = (econ.bag[r.id] ?? 0) + 1;
        econ.drips.push({ kind: r.id, serial: Number(m.serial) });
        renderBar();
        h.toast(`${itemLabel(r.id)} #${m.serial} crafted ✨ · recorded on NEAR`, 4500);
        if (isOpen('bench')) openBench();
        return;
      }
      case 'book':
        if (isOpen('book')) renderBook(m);
        return;
      case 'traded': {
        if (!m.ok) return h.toast(String(m.why), 3000);
        if (m.quotes) quotes = m.quotes as Quote[];
        const k = String(m.item);
        const n = Number(m.n);
        if (m.cup && cupState?.me) {
          cupState.me.chips = Number(m.chips);
          cupState.me.bag[k] = (cupState.me.bag[k] ?? 0) + (m.side === 'buy' ? n : -n);
        } else {
          econ.leaves = Number(m.balance);
          econ.bag[k] = (econ.bag[k] ?? 0) + (m.side === 'buy' ? n : -n);
          if (m.side === 'sell') econ.today.market_sell = (econ.today.market_sell ?? 0) + Number(m.total);
        }
        renderBar();
        h.toast(`${m.side === 'buy' ? 'Bought' : 'Sold'} ${n} ${itemLabel(k)} for ${m.total} ${m.cup ? 'chips' : '🍃'}`, 2200);
        void loadMarket().then(renderMarket);
        return;
      }
      case 'quotes':
        quotes = m.q as Quote[];
        if (isOpen('market')) renderMarket();
        return;
      case 'cupJoined':
        if (!m.ok) return h.toast(String(m.why), 4500);
        h.toast(`You're in the Market Cup with ${CUP.chips} chips. Trade before ${new Date(Number(m.end)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, 5000);
        cupMode = true;
        void loadMarket().then(renderMarket);
        return;
      case 'sitEnded':
        h.toast('Your sit ended while the app was in the background.', 4000);
        return;
    }
  }

  // ---------- per frame ----------
  let t = 0;
  function update(dt: number) {
    t += dt;
    for (const fp of frenPets) {
      fp.pet.update(dt, true, true);
      fp.ring.rotation.z += dt * 0.5;
      (fp.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 2);
    }
    glow.rotation.y += dt;
    if (trail.visible) trail.children.forEach((c, i) => ((c as THREE.Mesh).position.y += Math.sin(t * 2 + i) * 0.002));
    if (pending) {
      const me = h.me().position;
      if (dist(me, pending.at) <= pending.reach) {
        const p = pending;
        pending = null;
        act(p.kind, p.id);
      }
    }
    if (wish && !wish.sent && Date.now() >= wish.until + 150) {
      wish.sent = true;
      h.send({ t: 'wishDone' });
    }
  }

  /** open a sheet directly (screenshots and tests): wish:<fren>, bench, bag, book, market, previews */
  function open(kind: string) {
    if (kind.startsWith('wish:')) return openWish(kind.slice(5));
    if (kind === 'bench') return openBench();
    if (kind === 'bag') return openBag();
    if (kind === 'book') return void openBook();
    if (kind === 'market') return void openMarket();
    if (kind === 'previews') return openPreviews();
  }

  return { onMessage, tap: tapObj, update, open, isNear: true };
}

/** a small wooden sign with text (canvas texture) */
function makeSign(lines: string[], height = 1.5, w = 1.8): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3b3346';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#b48cff';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 246);
  ctx.fillStyle = '#f4efe6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    let size = i === 0 ? 72 : 46;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    while (ctx.measureText(line).width > 470 && size > 20) {
      size -= 4;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(line, 256, lines.length === 1 ? 128 : 80 + i * 96);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = height;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, height, 6), new THREE.MeshStandardMaterial({ color: 0x6b5238 }));
  post.position.y = height / 2;
  g.add(board, post);
  return g;
}
