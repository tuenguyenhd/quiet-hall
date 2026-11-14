// NEAR edition client: Meme Valley (no Leaves currency), Kettle's Living Market, the Market Cup, the Rescue Book with NEAR
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
import { loginWithNear, type LoginNetwork, type LoginUi } from './login';
import { NEAR_MARK } from '../near-mark';
import { degenName } from './names';
import { setupMocks } from './mocks';
import { setupQuest } from './quest';
import { setupDrops } from './campaigns';
import { setupCompanion } from './companion';
import { COMPANION, SKINS } from '../companion';

/** the NEAR mark for login buttons (white on black, unaltered) */
const nearIcon = (size: number) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${NEAR_MARK}"/></svg>`;

export const NEAR = import.meta.env.VITE_EDITION === 'near';

/** NEAR edition pets: only frens you can rescue (no pets are sold in this edition). Indices into PETS. */
export const NEAR_PETS = FRENS.map((f) => ({
  k: f.pet,
  name: SKINS.find((s) => s.pet === f.pet)?.name ?? f.name,
  how: `Rescue ${f.name} in Meme Valley (north-east, past the Tea House) to unlock this face for ${COMPANION.name}.`,
}));

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
  /** pat my pet (the companion answered) */
  patPet(): void;
  /** after a NEAR login: the account becomes this player's name */
  setVerifiedName(name: string): void;
}

interface Econ {
  leaves: number;
  bag: Record<string, number>;
  today: Record<string, number>;
  streak: number;
  frens: { fren: string; serial: number; rescues: number }[];
  drips: { kind: string; serial: number }[];
  /** the NEAR account this player logged in with (null = guest) */
  near?: string | null;
  /** the name they chose (shown instead of the address); null until they pick one */
  nick?: string | null;
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
  document.body.classList.add('edition-near', 'near-guest');
  // PumpHall plays Bitcoin and NEAR in this edition; the Market (south-east) and the valley are places of their own.
  for (const p of PLACES) {
    if (p.id === 'pump') p.hint = 'Guess Bitcoin or NEAR up or down on the big board, or duel someone (points, no money). The Market is down the south-east road.';
    if (p.id === 'court') p.hint = 'North: the Quiet Hall (sit). South: PumpHall (up/down). South-east: the Market. North-east past the Tea House: Meme Valley.';
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
  /** no Leaves in this edition: the Market trades only in the Market Cup's play chips */
  const cupMode = true;
  let cupState: { round: string; end: number; entrants: number; top: { owner: string; score: number }[]; me?: { chips: number; bag: Record<string, number>; score: number; rank: number } } | null =
    null;
  let firstSitDone = econ.frens.length > 0;

  // ---------- HUD ----------
  const bar = document.createElement('div');
  bar.id = 'near-bar';
  bar.innerHTML = `
    <button class="pill" id="near-bag" title="Your bag">🎒</button>
    <button class="pill" id="near-book" title="Rescue Book">📖</button>
    <button class="pill" id="near-market" title="Market and Market Cup">🛒</button>
    <button class="pill" id="near-talk" title="Talk to ${COMPANION.name} (AI companion)">🐶</button>
    <button class="near-login-btn small-btn" id="near-login" title="Log in with NEAR">${nearIcon(16)}<span>Log in</span></button>`;
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
  // the Coming Soon district (south-west): walk-in mock-ups of what is not built yet
  const mocks = setupMocks(h, show, body);
  const isOpen = (kind: string) => !overlay.classList.contains('hidden') && body().dataset.kind === kind;
  // the AI companion: Biscuit talks back and gives Cup tips (companion.ts)
  const companion = setupCompanion({
    send: h.send,
    show: (html, kind) => (show(html), (body().dataset.kind = kind)),
    body,
    isOpen,
    toast: h.toast,
    pat: () => h.patPet(),
    login: () => void startLogin(),
    loggedIn: () => !!econ.near,
  });
  $('near-talk').addEventListener('click', () => companion.open());
  // the pet sheet: one companion, the rescued frens are its faces; talk from there too
  {
    const pat = document.getElementById('btn-pat');
    const talk = document.createElement('button');
    talk.className = 'primary';
    talk.id = 'btn-talk';
    talk.textContent = `💬 Talk to ${COMPANION.name} (AI)`;
    talk.addEventListener('click', () => {
      document.getElementById('petsheet')?.classList.add('hidden');
      companion.open();
    });
    pat?.after(talk);
    const title = document.getElementById('pet-try');
    if (title) title.textContent = `${COMPANION.name} · your companion`;
    const intro = document.querySelector('#petsheet .card > p.small');
    if (intro) intro.textContent = `One companion who follows you everywhere. Rescue frens in Meme Valley to unlock new faces (skins) for ${COMPANION.name}.`;
  }

  function renderBar() {
    const lg = $('near-login');
    const addr = econ.near ? (/^[0-9a-f]{64}$/.test(econ.near) ? short(econ.near) : econ.near.replace(/\.(testnet|near)$/, '')) : '';
    // the hall button shows the name they chose; the welcome card says which account it is
    const who = econ.nick || chosenName || addr;
    lg.querySelector('span')!.textContent = econ.near ? `✓ ${who}` : 'Log in';
    lg.title = econ.near ? `Logged in as ${econ.near}` : 'Log in with NEAR';
    lg.classList.toggle('on', !!econ.near);
    // the welcome card's login button hides once logged in
    const wb = document.getElementById('near-login-welcome-box');
    if (wb) {
      wb.classList.toggle('logged', !!econ.near);
      const done = document.getElementById('near-login-welcome-done');
      if (done) {
        done.innerHTML = econ.near ? `${nearIcon(16)}<span>Logged in as <b>${esc(addr)}</b></span> <button id="near-logout-welcome" type="button">Log out</button>` : '';
        document.getElementById('near-logout-welcome')?.addEventListener('click', logout);
      }
    }
    // guests can explore, rescue and trade; PumpHall up/down needs a NEAR login
    document.body.classList.toggle('near-guest', !econ.near);
    // guests get a small "Quick join" under the login; logged in, the big "Enter the hall" is back
    const enter = document.getElementById('btn-enter');
    if (enter) {
      enter.textContent = econ.near ? 'Enter the hall' : 'Quick join as guest →';
      enter.classList.toggle('near-quick', !econ.near);
      enter.classList.toggle('primary', !!econ.near);
    }
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
  // Kettle's stalls are a place of their own now (the Market square, south-east): built in ./bazaar.ts with the world
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
  /** the quest's "Show me the way" also lights the trail */
  let questTrail = false;
  const syncTrail = () => (trail.visible = questTrail || (firstSitDone && econ.frens.length === 0));

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
    if (d.kind === 'mock') return mocks.open(d.id);
    if (d.kind === 'drop') return drops.tap(d.id);
    approach(d.kind, d.id);
  }
  /** walk up to a valley thing (node, fren, bench, kettle), then act on arrival */
  function approach(kind: string, id: string) {
    const d = { kind, id };
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
      ${helped ? `<p class="small">You rescued ${esc(f.name)} before (#${helped.serial}). Helping again gives them hearts.</p>` : ''}
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
      <div class="near-row"><div><b>${esc(r.name)}</b><ul class="near-needs">${need(r.needs)}</ul></div>
      <button class="primary" id="near-craft">Craft</button></div>`);
    body().dataset.kind = 'bench';
    $('near-craft').addEventListener('click', () => h.send({ t: 'craft', r: r.id }));
  }
  function openBag() {
    const items = Object.entries(econ.bag).filter(([, n]) => n > 0);
    show(`<h2>🎒 Bag</h2>${items.length ? `<ul class="near-needs">${items.map(([k, n]) => `<li class="have">${itemLabel(k)} <b>${n}</b></li>`).join('')}</ul>` : `<p class="small">Empty. Tap rocks, yarn and shrooms in Meme Valley (north-east, past the Tea House). Lost frens there want them, and a rescued fren becomes your pet.</p><button class="ghost" data-quest>🐾 How to get a pet: the Meme Valley quest</button>`}
      <p class="near-foot">What you gather is for lost frens' wishes and the Workbench.</p>`);
    body().dataset.kind = 'bag';
    quest.wire(body());
  }
  /** the hall did not answer in time: say so and offer Retry, never an endless "Loading…" (BUG-0001) */
  const SHEET_TIMEOUT_MS = 6000;
  function sheetError(title: string, retry: () => void) {
    body().innerHTML = `<h2>${title}</h2><p class="small near-err">Can't reach the hall right now. Check your connection and try again.</p><button class="primary" id="near-retry">Retry</button>`;
    $('near-retry').addEventListener('click', retry);
  }
  let bookWait = 0;
  async function openBook() {
    show(`<h2>📖 Rescue Book</h2><p class="small">Loading…</p>`);
    body().dataset.kind = 'book';
    h.send({ t: 'book' });
    clearTimeout(bookWait);
    bookWait = window.setTimeout(() => {
      if (isOpen('book') && !body().querySelector('.near-needs')) sheetError('📖 Rescue Book', openBook);
    }, SHEET_TIMEOUT_MS);
  }
  function renderBook(m: Msg) {
    clearTimeout(bookWait);
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
      return `<li class="${got ? 'have' : 'miss'}">${f.pet === 1 ? '🐕' : '🐸'} <b>${esc(f.name)}</b> ${got ? `#${got.serial} · rescued ${got.rescues}× ${rec(`fren-${f.id}-${got.serial}`)}` : `<span class="small">not yet</span> ${quest.link()}`}</li>`;
    }).join('');
    const dl = drips.map((d) => `<li class="have">${itemLabel(d.kind)} #${d.serial} ${rec(`drip-${d.kind}-${d.serial}`)}</li>`).join('');
    const badges = drops.book(receipts, rec);
    setTimeout(() => document.getElementById('near-book-login')?.addEventListener('click', (e) => (e.preventDefault(), void startLogin())), 0);
    body().innerHTML = `<h2>📖 Rescue Book</h2><ul class="near-needs">${tiles}</ul>${dl ? `<div class="label">Drip</div><ul class="near-needs">${dl}</ul>` : ''}${badges}
      <p class="small">${
        econ.near
          ? `Your frens and drip are recorded on NEAR testnet to your account <b>${esc(econ.near)}</b>.`
          : `Your frens and drip are recorded on NEAR testnet under an account made for you: <code>${esc(short(String(m.owner)))}</code>. You never need a wallet; <a href="#" id="near-book-login">log in</a> to use your own.`
      }</p>
      <p class="near-foot">Receipts are bound to you and cannot be sold.</p>`;
    quest.wire(body());
    drops.wire(body());
  }

  /** null = the hall did not answer (timeout or error) */
  /** Kettle's reasoning per item, its wallet, and the real market board (NEAR Intents solver quotes) */
  let marketWhy: Record<string, string> = {};
  let kettleWallet: string | null = null;
  let realMarket: { source: string; prices: { symbol: string; usd: number }[]; swap: { from: string; to: string; amountIn: string; amountOut: string; seconds: number } | null } | null = null;
  async function loadMarket(): Promise<{ ts: number; item: string; bid: number }[] | null> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), SHEET_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/near/market?pid=${encodeURIComponent(h.pid)}`, { signal: ac.signal });
      if (!res.ok) return null;
      const r = (await res.json()) as { quotes: Quote[]; history: { ts: number; item: string; bid: number }[]; cup: typeof cupState; why?: Record<string, string>; kettle?: { wallet: string | null }; intents?: typeof realMarket };
      quotes = r.quotes;
      marketWhy = r.why ?? {};
      kettleWallet = r.kettle?.wallet ?? null;
      realMarket = r.intents ?? null;
      cupState = r.cup;
      return r.history;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  async function openMarket() {
    show(`<h2>🛒 Market</h2><p class="small">Loading prices…</p>`);
    body().dataset.kind = 'market';
    const hist = await loadMarket();
    if (hist) return renderMarket(hist);
    if (!isOpen('market')) return;
    // the hall did not answer: still show what needs no prices (the Cup, the guest's login), plus Retry
    body().innerHTML = `<h2>🛒 Market</h2>
      ${econ.near ? '' : `<button id="near-market-login" class="near-login-btn near-lock">🔒 <span>Log in with NEAR to play the Market Cup</span></button>`}
      <p class="small">🏆 <b>Market Cup</b>: everyone starts a round with the same free play chips; the best traders when it ends win trophies recorded on NEAR.</p>
      <p class="small near-err">Can't reach the Market right now. Check your connection and try again.</p>
      <button class="primary" id="near-retry">Retry</button>
      <p class="near-foot">Play money. No cash value. Free to enter.</p>`;
    document.getElementById('near-market-login')?.addEventListener('click', () => openLoginPerks('The Market Cup needs a login'));
    $('near-retry').addEventListener('click', () => void openMarket());
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
    const top = (cup?.top ?? []).map((t) => `<li><code>${esc(short(t.owner))}</code> <b>${t.score}</b></li>`).join('');
    const leftTxt = left > 3600000 ? `${Math.floor(left / 3600000)} h ${Math.floor((left % 3600000) / 60000)} min` : mmss(left);
    body().innerHTML = `<h2>🛒 Market</h2>
      ${econ.near ? '' : `<button id="near-market-login" class="near-login-btn near-lock">🔒 <span>Log in with NEAR to play the Market Cup</span></button>`}
      <p class="small">🏆 <b>Market Cup</b>${inCup ? ` · ${cup!.me!.chips} chips` : ''}: everyone starts a round with the same free play chips; the best traders when it ends win trophies recorded on NEAR.</p>
      ${inCup ? `<div class="chips near-qty">${[1, 5, 10].map((n) => `<button data-qty="${n}" class="${tradeQty === n ? 'on' : ''}">×${n}</button>`).join('')}</div>` : ''}
      ${cupMode && !inCup ? `<p class="small">This Market Cup round ends in ${leftTxt} · ${cup?.entrants ?? 0} entrants. Free: ${CUP.chips} play chips, trophies for the top ${CUP.trophies}.</p><button class="primary" id="near-cup-join">Join this round</button>` : rows}
      ${cupMode ? `<div class="label">Live top 10 ${inCup ? `· you: #${cup!.me!.rank}, score ${cup!.me!.score}` : ''}</div>${top ? `<ol class="near-top">${top}</ol>` : '<p class="small">No entrants yet: be the first.</p>'}
        <p class="small">Prices move with every player's trades. Each round is committed on NEAR before it starts and settled after it ends, so anyone can check it.</p>` : ''}
      <details class="near-why"><summary>🫖 Why these prices? Kettle explains</summary>
        <ul>${MARKET.map((m) => `<li><b>${itemLabel(m.item)}</b> ${esc(marketWhy[m.item] ?? '')}</li>`).join('')}</ul>
        ${kettleWallet ? `<p class="small">Kettle is a merchant NPC with a NEAR wallet: <a href="${EXPLORER}/accounts/${esc(kettleWallet)}" target="_blank" rel="noopener"><code>${esc(kettleWallet)}</code></a> posts these prices on chain every hour.</p>` : ''}
      </details>
      ${realMarket ? `<details class="near-why"><summary>🌐 The real market (NEAR Intents)</summary>
        <p class="small">${realMarket.prices.map((p) => `<b>${esc(p.symbol)}</b> $${p.usd.toLocaleString()}`).join(' · ')}</p>
        ${realMarket.swap ? `<p class="small">Solver quote: ${esc(realMarket.swap.amountIn)} ${esc(realMarket.swap.from)} → ${esc(realMarket.swap.amountOut)} ${esc(realMarket.swap.to)} in ~${realMarket.swap.seconds} s.</p>` : ''}
        <p class="small">${realMarket.source === 'near-intents' ? 'Live dry quotes from NEAR Intents solvers.' : 'Sample numbers (NEAR Intents did not answer).'} Information only: the Cup trades play chips. Ask Biscuit about it.</p>
      </details>` : ''}
      <p class="near-foot">Play money. No cash value. Free to enter.</p>`;
    body()
      .querySelectorAll<HTMLButtonElement>('button[data-side]')
      .forEach((b) =>
        b.addEventListener('click', () => (econ.near ? h.send({ t: 'trade', item: b.dataset.item, side: b.dataset.side, n: tradeQty, cup: cupMode }) : openLoginPerks('The Market Cup needs a login'))),
      );
    document.getElementById('near-market-login')?.addEventListener('click', () => openLoginPerks('The Market Cup needs a login'));
    body()
      .querySelectorAll<HTMLButtonElement>('button[data-qty]')
      .forEach((b) => b.addEventListener('click', () => ((tradeQty = Number(b.dataset.qty)), renderMarket(hist))));
    document.getElementById('near-cup-join')?.addEventListener('click', () => (econ.near ? h.send({ t: 'cupJoin' }) : openLoginPerks('The Market Cup needs a login')));
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

  function showLoggedIn() {
    show(`<h2>✓ Logged in</h2><p class="small">You are <b>${esc(econ.near ?? '')}</b>.</p>
      <ul class="near-needs"><li class="have">Your rescues, crafts and Cup trophies are recorded to this account (NEAR testnet receipts).</li><li class="have">Log in on another phone with the same wallet and your bag, frens and badges come with you.</li><li class="have">You show as <b>${esc(econ.nick || econ.near || '')}</b> in the hall and on the boards (type <code>/name</code> in chat to change it).</li></ul>
      <button id="near-logout" class="ghost">Log out</button>
      <p class="near-foot">Logging in signed a message only: no transaction, no fee, nothing moved. Log out and this phone is a guest again; log back in with the same wallet and everything comes back.</p>`);
    body().dataset.kind = 'login';
    $('near-logout').addEventListener('click', logout);
  }
  /** what logging in unlocks: shown when a guest reaches for one of these, and on the welcome card */
  const PERKS = [
    '📈 Play PumpHall: Bitcoin and NEAR up/down, duels, your history',
    '🏆 Enter the Market Cup and win trophies',
    '🎁 Claim sponsor rewards from drops you collect',
    '📱 Keep your bag, frens and badges on any phone',
    '🏷️ Your NEAR name in the hall and on the boards',
  ];
  /** a guest tried something that needs a login: say what it unlocks and offer the button */
  function openLoginPerks(what: string, lead?: string) {
    show(`<h2>🔒 ${esc(what)}</h2><p class="small">${lead ?? 'Quick join is for looking around. Log in with NEAR to play for real:'}</p>
      <ul class="near-needs">${PERKS.map((p) => `<li class="have">${p}</li>`).join('')}</ul>
      <button id="near-perks-login" class="near-login-btn">${nearIcon(20)}<span>Log in with NEAR</span></button>
      <p class="near-foot">One free signature: no transaction, no fee, nothing moved. <a href="#" id="near-perks-testnet">Testnet account?</a></p>`);
    body().dataset.kind = 'perks';
    $('near-perks-login').addEventListener('click', () => (close(), void startLogin()));
    $('near-perks-testnet').addEventListener('click', (e) => (e.preventDefault(), close(), void startLogin('testnet')));
  }

  // a small bar while the wallet is open: NEAR Connect says nothing when an extension window is just closed,
  // so the player always has Cancel, and gets "Try again" once they are back in the game without an answer
  const wait = document.createElement('div');
  wait.id = 'near-login-wait';
  wait.className = 'hidden';
  document.body.appendChild(wait);
  let cancelLogin: (() => void) | null = null;
  const loginUi = (network: LoginNetwork): LoginUi => ({
    waiting(name, cancel) {
      cancelLogin = cancel;
      wait.innerHTML = `<span class="near-spin"></span><span>Approve the signature in <b>${esc(name)}</b></span><button data-a="cancel">Cancel</button>`;
      wait.classList.remove('hidden');
      wait.querySelector('[data-a="cancel"]')!.addEventListener('click', () => cancelLogin?.());
    },
    stalled(name) {
      wait.innerHTML = `<span>No answer from <b>${esc(name)}</b>. Closed it?</span><button data-a="retry">Try again</button><button data-a="cancel">Cancel</button>`;
      wait.querySelector('[data-a="cancel"]')!.addEventListener('click', () => cancelLogin?.());
      wait.querySelector('[data-a="retry"]')!.addEventListener('click', () => {
        cancelLogin?.();
        setTimeout(() => void startLogin(network), 0);
      });
    },
    done() {
      cancelLogin = null;
      wait.classList.add('hidden');
    },
  });

  /**
   * Log out: this phone becomes a new guest (a fresh visitor id) and the welcome card shows the login again.
   * The account keeps its progress: logging in with the same wallet brings this visitor id back.
   */
  function logout() {
    try {
      for (const k of ['qh.pid', 'qh.name', 'qh.near.autoname2', 'qh.pets', 'qh.pet', 'qh.seed', 'qh.pump.told']) localStorage.removeItem(k);
      sessionStorage.removeItem('qh.justLoggedIn');
    } catch {
      /* storage blocked: nothing kept to forget */
    }
    location.reload();
  }
  // duels need a login: a guest tapping ⚔ gets the login card straight away (before picking a side)
  document.addEventListener(
    'click',
    (e) => {
      if (econ.near || !(e.target as Element).closest?.('#duel-bubble')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      openLoginPerks('Duels need a login');
    },
    true,
  );
  let justLoggedIn = false;
  /** the name picked on the welcome card (sent again once the hall connects, in case it raced the hello) */
  let chosenName = '';
  /** "Log in with NEAR": NEAR Connect's standard wallet picker, one free signature (mainnet accounts by default) */
  let loggingIn = false;
  async function startLogin(network: LoginNetwork = 'mainnet') {
    if (econ.near) return showLoggedIn();
    if (loggingIn) return;
    loggingIn = true;
    try {
      const r = await loginWithNear(h.pid, network, loginUi(network));
      if (r.ok) h.toast(`Logged in as ${r.name} ✓`, 3000);
      else if (r.cancelled) h.toast('Login cancelled.', 2000);
      else h.toast(`Not logged in: ${r.why}`, 6000);
    } catch (e) {
      h.toast(`Not logged in: ${String((e as Error)?.message ?? e).slice(0, 120)}`, 6000);
    } finally {
      loggingIn = false;
    }
  }
  // back from a login (the page reloaded): welcome, and the first-login bonus
  try {
    const j = JSON.parse(sessionStorage.getItem('qh.justLoggedIn') ?? 'null') as { name: string; bonus: number } | null;
    sessionStorage.removeItem('qh.justLoggedIn');
    if (j) {
      // they logged in from the welcome card or in the hall: go straight (back) into the hall
      justLoggedIn = true;
      // after the hall's own "You are now …" greeting, so it is not overwritten
      setTimeout(() => h.toast(`Logged in as ${j.name} ✓`, 5000), 4000);
    }
  } catch {
    /* storage blocked */
  }
  $('near-login').addEventListener('click', () => void startLogin());
  {
    // welcome card: right under the title, before picking a fren
    const lead = document.querySelector('#welcome .card .lead');
    if (lead) {
      const box = document.createElement('div');
      box.id = 'near-login-welcome-box';
      box.innerHTML = `<button id="near-login-welcome" class="near-login-btn">${nearIcon(20)}<span>Log in with NEAR</span></button>
        <p id="near-login-welcome-done" class="near-login-done"></p>
        <p class="small near-login-note">Play PumpHall and the Market Cup · claim sponsor drops · keep progress on any phone · <a href="#" id="near-login-testnet">testnet account?</a></p>`;
      lead.after(box);

      // logged in: one short step, a name (an auto degen name you can keep) and Enter
      // the fren they picked (its label, e.g. "Froggo"): the suggested name's meme matches it
      const fren = () => (document.querySelector('#species .on')?.textContent ?? '').replace(/[^A-Za-z]/g, '');
      let auto = '';
      try {
        auto = localStorage.getItem('qh.near.autoname2') || '';
        if (!auto) localStorage.setItem('qh.near.autoname2', (auto = degenName(Math.random, fren())));
      } catch {
        auto = degenName(Math.random, fren());
      }
      const nameRow = document.createElement('div');
      nameRow.id = 'near-name-row';
      nameRow.innerHTML = `<label for="near-name">Your name</label>
        <div class="near-name-field"><input id="near-name" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(auto)}" /><button id="near-name-dice" type="button" aria-label="Another name">🎲</button></div>
        <p class="small">Shown instead of your address. Keep it, or type your own.</p>`;
      const enterBtn = $('btn-enter');
      enterBtn.before(nameRow);
      $('near-name-dice').addEventListener('click', () => (($('near-name') as HTMLInputElement).value = degenName(Math.random, fren())));
      // a suggested name follows the fren they pick, until they type their own (or have one saved)
      let typed = false;
      ($('near-name') as HTMLInputElement).addEventListener('input', () => (typed = true));
      document.getElementById('species')?.addEventListener('click', () =>
        setTimeout(() => {
          if (!typed && !econ.nick) ($('near-name') as HTMLInputElement).value = degenName(Math.random, fren());
        }, 0),
      );
      ($('near-name') as HTMLInputElement).addEventListener('keydown', (e) => e.key === 'Enter' && enterBtn.click());

      // the look (fren, light, pet) is a small optional thing: folded into one line, "auto" unless opened
      const card = enterBtn.parentElement!;
      const look = document.createElement('details');
      look.id = 'near-look';
      look.innerHTML = `<summary>Look: <b>auto</b> · <span class="near-look-change">change</span></summary>`;
      const lookFrom = card.querySelector('.label');
      if (lookFrom) {
        const moving: Element[] = [];
        for (let el: Element | null = lookFrom; el && el !== nameRow && el !== enterBtn; el = el.nextElementSibling) moving.push(el);
        lookFrom.before(look);
        look.append(...moving);
      }
      enterBtn.before(look);
      look.addEventListener('toggle', () => {
        look.querySelector('summary b')!.textContent = look.open ? 'pick below' : 'yours';
        look.querySelector('.near-look-change')!.textContent = look.open ? 'hide' : 'change';
      });

      // Enter = submit: save the name first (capture phase, before the game connects with it)
      $('welcome').addEventListener(
        'click',
        (e) => {
          if (!econ.near || !(e.target as Element).closest?.('#btn-enter')) return;
          const nm = ($('near-name') as HTMLInputElement).value.replace(/\s+/g, ' ').trim() || auto;
          chosenName = nm;
          h.setVerifiedName(nm);
          void fetch('/api/near/name', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: h.pid, name: nm }) })
            .then((r) => r.json())
            .then((r: { ok: boolean; name?: string; why?: string }) => {
              if (r.ok && r.name) econ.nick = chosenName = r.name;
              else if (r.why) h.toast(r.why, 3500);
            })
            .catch(() => undefined);
        },
        true,
      );
      // no "No sign-up" line in this edition: logging in is the way to play
      document.querySelector('#welcome .card > p.small')?.remove();
      $('near-login-welcome').addEventListener('click', () => void startLogin());
      $('near-login-testnet').addEventListener('click', (e) => (e.preventDefault(), void startLogin('testnet')));
    }
    // PumpHall: up/down needs a NEAR login (the server refuses guests' picks too)
    const pick = document.querySelector('#pumpsheet .pump-pick');
    if (pick) {
      const cta = document.createElement('button');
      cta.id = 'pump-login-cta';
      cta.className = 'near-login-btn';
      cta.innerHTML = `${nearIcon(20)}<span>Log in with NEAR to play</span>`;
      pick.before(cta);
      cta.addEventListener('click', () => void startLogin());
    }
    const histView = document.getElementById('pump-view-history');
    if (histView) {
      const hc = document.createElement('div');
      hc.id = 'pump-history-cta';
      hc.innerHTML = `<p class="small">Your picks and results are kept for your NEAR account.</p><button class="near-login-btn">${nearIcon(20)}<span>Log in with NEAR to see your history</span></button>`;
      histView.prepend(hc);
      hc.querySelector('button')!.addEventListener('click', () => void startLogin());
    }
  }

  // sponsored drops: an advertiser's airdrop in the world (campaigns.ts); its section lives in the quest sheet
  const drops = setupDrops({
    scene: h.scene,
    heightAt: h.heightAt,
    tap,
    untap: (o) => {
      const i = h.clickables.indexOf(o);
      if (i >= 0) h.clickables.splice(i, 1);
    },
    me: () => h.me().position,
    walkTo: (p) => h.walkTo(new THREE.Vector3(p.x, 0, p.z)),
    send: h.send,
    toast: h.toast,
    pid: h.pid,
    loggedIn: () => !!econ.near,
    loginPerks: openLoginPerks,
    guide: (to) => quest.guideTo(to),
    close,
  });

  // the pet quest: HUD chip + sheet, and its pointers from the welcome card, pet sheet, bag and book (quest.ts)
  const quest = setupQuest({
    econ: () => econ,
    me: () => h.me().position,
    walkTo: (p) => h.walkTo(new THREE.Vector3(p.x, 0, p.z)),
    approach,
    trail: () => trail.children.map((c) => ({ x: c.position.x, z: c.position.z })),
    showTrail: (on) => ((questTrail = on), syncTrail()),
    wishFren: () => wish?.fren ?? null,
    setPet: h.setPet,
    show: (html, kind) => (show(html), (body().dataset.kind = kind)),
    body,
    isOpen,
    close,
    toast: h.toast,
    entered: () => $('welcome').classList.contains('hidden'),
    login: () => void startLogin(),
    drops,
  });
  drops.onChange = () => quest.refresh();

  renderBar();
  // the hall connection only starts on Enter, so ask now whether this visitor is logged in: the welcome card
  // then shows the account instead of the login button (and after a login, we go straight into the hall)
  void fetch(`/api/near/whoami?pid=${encodeURIComponent(h.pid)}`)
    .then((r) => r.json())
    .then((w: { account: string | null; nick: string | null }) => {
      if (!w.account) return;
      econ.near = econ.near ?? w.account;
      econ.nick = econ.nick ?? w.nick;
      const input = document.getElementById('near-name') as HTMLInputElement | null;
      if (input && w.nick) input.value = w.nick;
      renderBar();
      // just logged in: the welcome card is now the short name step; focus the name so Enter goes straight in
      if (justLoggedIn && !$('welcome').classList.contains('hidden')) ($('near-name') as HTMLInputElement).focus({ preventScroll: true });
    })
    .catch((e) => console.warn('[near] whoami', e));

  $('near-bag').addEventListener('click', openBag);
  $('near-book').addEventListener('click', openBook);
  $('near-market').addEventListener('click', () => {
    if (dist(h.me().position, TRADE_ZONE) <= TRADE_ZONE.r) return openMarket();
    h.toast('The Market is down the south-east road from the courtyard. Walking there…', 3500);
    pending = { kind: 'kettle', id: 'kettle', at: new THREE.Vector3(KETTLE.x, 0, KETTLE.z), reach: TRADE_ZONE.r - 2 };
    h.walkTo(new THREE.Vector3(KETTLE.x, 0, KETTLE.z - 3));
  });

  // phones: hidden time does not count toward a sit
  document.addEventListener('visibilitychange', () => h.send({ t: 'vis', h: document.visibilityState === 'hidden' }));

  // ---------- messages ----------
  function onMessage(m: Msg) {
    if (drops.onMessage(m)) return;
    if (companion.onMessage(m)) return;
    switch (m.t) {
      case 'econ':
        econ = { ...econ, ...(m as unknown as Econ) };
        if (econ.near) {
          // the name picked on the welcome card wins if the server had not saved it yet when we said hello
          if (chosenName && chosenName !== econ.nick) {
            h.send({ t: 'name', name: chosenName });
            econ.nick = chosenName;
          }
          h.setVerifiedName(econ.nick || (/^[0-9a-f]{64}$/.test(econ.near) ? short(econ.near) : econ.near.slice(0, 32)));
        }
        if (econ.near) drops.loggedIn();
        firstSitDone = econ.frens.length > 0 || (econ.today.sit ?? 0) > 0;
        syncTrail();
        renderBar();
        return;
      case 'leaves': {
        if (!firstSitDone && econ.frens.length === 0) {
          firstSitDone = true;
          syncTrail();
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
        if (m.first) {
          econ.frens.push({ fren: f.id, serial: Number(m.serial), rescues: 1 });
          syncTrail();
          h.setPet(f.pet);
          h.toast(`${f.name} #${m.serial} ${m.co ? 'was rescued with you' : 'follows you home'} ✨ · recorded on NEAR`, 6000);
        } else h.toast(`${f.name} is happy to see you again ❤️`, 4000);
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
        if (!m.ok && m.login) return openLoginPerks('The Market Cup needs a login');
        if (!m.ok) return h.toast(String(m.why), 3000);
        if (m.quotes) quotes = m.quotes as Quote[];
        const k = String(m.item);
        const n = Number(m.n);
        if (m.cup && cupState?.me) {
          cupState.me.chips = Number(m.chips);
          cupState.me.bag[k] = (cupState.me.bag[k] ?? 0) + (m.side === 'buy' ? n : -n);
        }
        h.toast(`${m.side === 'buy' ? 'Bought' : 'Sold'} ${n} ${itemLabel(k)} for ${m.total} chips`, 2200);
        void loadMarket().then((x) => x && renderMarket(x));
        return;
      }
      case 'quotes':
        quotes = m.q as Quote[];
        if (isOpen('market')) renderMarket();
        return;
      case 'duel_no':
        // a guest tapped ⚔: say what logging in unlocks (duel.ts shows the plain message too)
        if (m.login) openLoginPerks('Duels need a login');
        return;
      case 'cupJoined':
        if (!m.ok && m.login) return openLoginPerks('The Market Cup needs a login');
        if (!m.ok) return h.toast(String(m.why), 4500);
        h.toast(`You're in the Market Cup with ${CUP.chips} chips. Trade before ${new Date(Number(m.end)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, 5000);
        void loadMarket().then((x) => x && renderMarket(x));
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
    mocks.update(dt);
    drops.update(dt);
    for (const fp of frenPets) {
      fp.pet.update(dt, true, true);
      fp.ring.rotation.z += dt * 0.5;
      (fp.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(t * 2);
    }
    glow.rotation.y += dt;
    quest.update(dt);
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

  /** open a sheet directly (screenshots and tests): wish:<fren>, bench, bag, book, market, previews, quest */
  function open(kind: string) {
    if (kind.startsWith('wish:')) return openWish(kind.slice(5));
    if (kind === 'bench') return openBench();
    if (kind === 'bag') return openBag();
    if (kind === 'book') return void openBook();
    if (kind === 'market') return void openMarket();
    if (kind === 'previews') return openPreviews();
    if (kind.startsWith('mock:')) return mocks.open(kind.slice(5));
    if (kind === 'login') return void startLogin();
    if (kind === 'quest' || kind === 'drops') return quest.open();
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
