// "Coming Soon" district (NEAR edition only): small walk-in mock-ups of features that are not built yet,
// south-west of the courtyard. Each site has a sign with a PREVIEW ribbon; tapping it (or walking up to it)
// opens an explainer with mock screens filled with SAMPLE DATA. Nothing here reads or writes the bag,
// the Cup or the chain. Design: design/gdd/edition-near.md (Preview tier), saga-and-long-term.md (Cabals,
// events), vault-whisperer-npc.md (Coldwall). The short versions live in ./previews.ts (Lookout telescope).
import * as THREE from 'three';
import './mocks.css';
import { add, mat, mesh } from '../build';
import { COURT, PLACES } from '../layout';
import { DISPLAY_FONT, NEAR_BUILD } from '../near-mark';
import { CLEAR_ZONES, EXTRA_OBSTACLES, PATHS } from '../world';
import { PREVIEWS } from './previews';

/** the district: centre, radius (also its PLACES entry) */
export const SOON = { x: -72, z: 100, r: 20 };
/** the entrance arch, where the path from the courtyard arrives */
const GATE = { x: -55, z: 96 };
/** the road from the courtyard's south-west edge ("↙ Coming soon") to the arch */
const ROAD: [number, number][] = [
  [-12, COURT.z + 17],
  [-30, 62],
  [GATE.x + 1, GATE.z - 1.5],
];

// Registered when this module loads, i.e. before main.ts builds the world, so the terrain is flattened,
// the path is drawn, and trees, rocks and grass keep clear (world.ts reads PLACES and PATHS when it builds).
if (NEAR_BUILD && !PLACES.some((p) => p.id === 'soon')) {
  PLACES.push({
    id: 'soon',
    name: 'Coming Soon',
    x: SOON.x,
    z: SOON.z,
    r: SOON.r,
    hint: 'Walk-in previews of what we build next: Cabals, events and the Trade Fair, the Sitting Bazaar, the Vault. Sample data, not live yet.',
    view: [GATE.x + 4, GATE.z - 6],
    look: [SOON.x, SOON.z + 2],
  });
  PATHS.push(ROAD);
  // the sand plaza stays clear of grass, and the sites are solid (walk around them, not through them)
  CLEAR_ZONES.push({ x: SOON.x, z: SOON.z, r: 14.5 });
  EXTRA_OBSTACLES.push(
    { x: -73, z: 85, r: 3.4 }, // Cabal Camp tents
    { x: -88, z: 101, r: 4.2 }, // Event Arena stage
    { x: -72, z: 114, r: 3.2 }, // Sitting Bazaar mats row
    { x: -59, z: 87, r: 2.4 }, // the Vault: Coldwall and his door
  );
}

type SiteId = 'cabal' | 'arena' | 'bazaar' | 'vault';
interface Site {
  id: SiteId;
  emoji: string;
  name: string;
  tag: string;
  x: number;
  z: number;
  /** where the sign stands (walk up to it to open the explainer) */
  sx: number;
  sz: number;
}
const SITES: Site[] = [
  { id: 'cabal', emoji: '🏮', name: 'Cabal Camp', tag: 'clans', x: -73, z: 85, sx: -71, sz: 91 },
  { id: 'arena', emoji: '🏟', name: 'Event Arena', tag: 'events · Trade Fair', x: -88, z: 101, sx: -81, sz: 98 },
  { id: 'bazaar', emoji: '🧺', name: 'Sitting Bazaar', tag: 'player market', x: -72, z: 114, sx: -69, sz: 109 },
  { id: 'vault', emoji: '🗿', name: 'The Vault', tag: 'AI NPC', x: -59, z: 87, sx: -61, sz: 92 },
];

export interface MockHost {
  heightAt(x: number, z: number): number;
  scene: THREE.Scene;
  clickables: THREE.Object3D[];
  me(): THREE.Object3D;
  sitting(): boolean;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const preview = (title: string) => PREVIEWS.find((p) => p.title === title)?.html ?? '';
const bar = (pct: number, label: string) => `<div class="near-pbar"><div style="width:${pct}%"></div><span>${label}</span></div>`;
const screen = (title: string, html: string) => `<div class="mk-screen"><div class="mk-screen-t">Mock screen · ${esc(title)}</div>${html}</div>`;
const table = (head: string[], rows: (string | number)[][]) =>
  `<table class="mk-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const PLAY = 'Points and play chips have no cash value: nothing to buy or cash out.';

/** explainer tabs per site: [tab label, html]. Every sample name and number below is made up. */
const TABS: Record<SiteId, [string, string][]> = {
  cabal: [
    [
      'What',
      `<p><b>Cabals are clans</b>, like guilds in an MMORPG: up to 30 people, a name, a banner and a camp of their own.</p>
      <ul class="near-needs"><li class="have">🏮 <b>Lantern rack:</b> every 100 minutes members sit lights one lantern. Lanterns only add up; nothing decays.</li>
      <li class="have">📋 <b>Recruitment board:</b> each Cabal posts one line ("slow morning sitters, EU"); players ask to join.</li>
      <li class="have">💬 <b>Cabal chat</b> and a shared corner where members' rescued frens wander.</li>
      <li class="have">🏆 <b>Team Cup:</b> a Cabal scores the average of its 3 best entrants, so small Cabals compete fairly.</li>
      <li class="have">🌿 <b>No duty:</b> no quotas, no attendance, nobody is kicked for resting.</li></ul>
      ${screen('Cabal Hall', preview('Cabal Hall'))}`,
    ],
    [
      'Roster',
      screen(
        '☾ The Quiet Apes · 12 / 30',
        table(
          ['', 'Member', 'Role', 'Sat this week'],
          [
            ['🟢', 'kai.near', 'Founder', '312 min'],
            ['🟢', 'mira.near', 'Elder', '287 min'],
            ['⚪', 'froggo_fan.near', 'Member', '190 min'],
            ['🟢', 'lotus.near', 'Member', '164 min'],
            ['⚪', 'degen_dao.near', 'Member', '75 min'],
            ['⚪', 'slowtea.near', 'Member', '12 min'],
          ],
        ) + `<p class="small">+ 6 more · 🟢 online now. Resting members keep their place and their lanterns.</p>`,
      ),
    ],
    [
      'Leaderboard',
      screen(
        'Cabal board · this season',
        table(
          ['#', 'Cabal', '🏮', 'Team Cup'],
          [
            [1, '☾ The Quiet Apes', 214, 398],
            [2, '🐸 Pond Sitters', 122, 402],
            [3, '🌿 Copium Club', 187, 371],
            [4, '🐕 Much Calm', 96, 344],
            [5, '🍄 Shroom Circle', 41, 330],
          ],
        ) + `<p class="small">Ranked by Team Cup (average of the 3 best entrants) · 🏮 = lanterns lit. Points only.</p>`,
      ),
    ],
    [
      'Chat',
      screen(
        'Cabal chat',
        `<ul class="mk-chat"><li><b>kai</b> gm frens, World Sit in 20 min 🧘</li><li><b>mira</b> I'll bring the shrooms for the Whale Order</li><li class="mk-sys">🏮 Lantern #214 lit by lotus</li><li><b>froggo_fan</b> anyone up for the Team Cup on Saturday?</li><li class="mk-sys">📋 slowtea.near asked to join · Founder approved</li></ul>`,
      ),
    ],
    [
      'Why NEAR',
      `<ul class="near-needs"><li class="have">🏷️ <b>Readable names:</b> the roster shows NEAR account names like <b>kai.near</b>, not long addresses, so you know who is in your Cabal.</li>
      <li class="have">🧾 <b>Receipts:</b> founding a Cabal, joining it and Team Cup results would be written as receipts to members' accounts, the way rescues and crafts are on NEAR testnet today. Anyone can check them.</li>
      <li class="have">🗳️ <b>Later:</b> Cabal votes (banner, decor, next village project) through a NEAR DAO. Votes only: no tokens involved.</li></ul>`,
    ],
  ],
  arena: [
    [
      'Schedule',
      screen(
        'This week at the Arena',
        table(
          ['When', 'Event', ''],
          [
            ['Daily 20:00 UTC', '🧘 World Sit: everyone sits together', 'calm'],
            ['Mon → Wed', '🐋 Whale Order: 2,000 Moon Rocks', 'together'],
            ['Thu, rotating hour', '🌫 Calm the FUD Golem (co-op raid)', 'together'],
            ['Sat 18:00 UTC', '🏆 Team Cup tournament', 'compete'],
            ['Full moon', '🌕 Moon Festival + Trade Fair', 'festival'],
          ],
        ) + `<p class="small">At most one big event a week. Start hours rotate so every time zone gets a turn.</p>`,
      ),
    ],
    [
      'Tournament',
      screen(
        'Team Cup bracket (sample)',
        `<div class="mk-bracket"><div><b>Semi-finals</b><p>☾ Quiet Apes <b>398</b> vs 🐕 Much Calm 344</p><p>🐸 Pond Sitters <b>402</b> vs 🌿 Copium Club 371</p></div>
        <div><b>Final</b> · Sat 19:00 UTC<p>☾ Quiet Apes vs 🐸 Pond Sitters</p></div></div>
        <p class="small">Each match is one Market Cup round: 200 free play chips each, best average of 3 entrants wins.</p>`,
      ),
    ],
    [
      'Prizes',
      screen(
        'Prize table (sample)',
        table(
          ['Place', 'Reward'],
          [
            ['🥇 1st Cabal', 'gold trophy + Cabal banner'],
            ['🥈 2nd', 'silver trophy'],
            ['🥉 3rd', 'bronze trophy'],
            ['Everyone who played', 'Arena stamp in the Rescue Book'],
          ],
        ) + `<p class="small">Free to enter. Trophies are bound to your account (cannot be sold). ${PLAY}</p>`,
      ) + screen('Whale Order', preview('Whale Order')),
    ],
    [
      'Trade Fair',
      `<p><b>Intents Trade Fair:</b> once a season the Arena turns into a fair. Instead of picking a price, you post what you want, an <i>intent</i> ("swap 5 Moon Rocks for at least 2 Copium Shrooms"), and solvers compete to fill it: Kettle, apprentice bots and Agent Cup agents.</p>
      ${screen(
        'Intent board',
        table(
          ['Intent', 'Best offer', ''],
          [
            ['mira: swap 5 🪨 → ≥ 2 🍄', '3 🍄 · Kettle', '✓ filled'],
            ['kai: get 2 🍄 for ≤ 6 🧶', '5 🧶 · 🤖 agent', '✓ filled'],
            ['lotus: swap 3 🧶 → 1 📿', '2 solvers bidding', '⏳ 0:42'],
          ],
        ),
      )}
      <ul class="near-needs"><li class="have">🌉 <b>Visitors from other chains:</b> the plan is that people who hold tokens on other chains can come in through <b>NEAR Intents</b>, where solvers handle the cross-chain step, for example to pay for a fixed-price cosmetic with a token they already hold.</li>
      <li class="have">🔁 The fair's trading itself is item for item: no currency, nothing to cash out.</li>
      <li class="miss">Not integrated yet: today this board is our own intent-style design, inspired by NEAR Intents.</li></ul>`,
    ],
    [
      'Why NEAR',
      `<ul class="near-needs"><li class="have">🔒 <b>Fair results:</b> each Market Cup round is committed on NEAR before it starts and settled after it ends, so anyone can check nobody changed the scores. Tournaments reuse that.</li>
      <li class="have">🏆 <b>Trophies as receipts</b> on your NEAR account, next to your rescues.</li>
      <li class="have">🌉 <b>NEAR Intents</b> is the planned bridge for Trade Fair visitors from other chains (see the Trade Fair tab).</li>
      <li class="have">🌫 Raid preview: ${preview('Calm the FUD Golem').replace(/<\/?p[^>]*>/g, '')}</li></ul>`,
    ],
  ],
  bazaar: [
    [
      'What',
      `<p><b>A night market where sellers meditate.</b> Sit on a mat and what you made floats above you as an offer. Stand up and your stall closes.</p>
      ${screen('Sitting Bazaar', preview('Sitting Bazaar'))}`,
    ],
    [
      'Stalls',
      screen(
        'Bazaar · 6 mats · 3 open',
        table(
          ['Seller', 'Offer', 'Wants', 'Sitting'],
          [
            ['🧘 mira', '📿 Moon Collar', '🪨×6 🍄×2', '24 min'],
            ['🧘 mira', '🍄 Copium Shroom ×3', '🧶×4', ''],
            ['🧘 degen_dao', '🧶 Rug Yarn ×5', '🪨×5', '9 min'],
            ['🧘 froggo_fan', '🪨 Moon Rock ×10', '🍄×3', '51 min'],
          ],
        ) + `<p class="small">Caravan stall: when 3 or more Cabal members sit side by side, they share one stall of 6 items.</p>`,
      ),
    ],
    [
      'Swap sheet',
      screen(
        'Swap with mira',
        `<div class="near-row"><div><b>📿 Moon Collar</b><div class="small">crafted by mira.near · 2 days ago</div></div><b>🪨×6 🍄×2</b></div>
        <p class="small">Item for item, no currency. A swap must be fair against Kettle's market prices, so silly swaps cannot be used to move things between accounts.</p>
        <button class="mk-off" disabled>Swap · not live yet</button>`,
      ),
    ],
    [
      'Why NEAR',
      `<ul class="near-needs"><li class="have">🏷️ You see who you buy from: <b>mira.near</b>, a real account, not a guest.</li>
      <li class="have">🧾 Each swap writes a receipt to both accounts on NEAR testnet, so the history of a crafted item can be checked.</li>
      <li class="have">🔐 Only logged-in NEAR accounts can open a stall, after a few days of play (the trade gate), which keeps bots and throwaway accounts out.</li></ul>`,
    ],
  ],
  vault: [
    [
      'What',
      `<p>At the bottom of the Copium Caves a stone golem named <b>Coldwall</b> guards the old Dev's vault. He is an <b>AI character</b>: each day he wakes with a new mood and a new rule, and you get 3 messages to talk him into opening it.</p>
      <ul class="near-needs"><li class="have">🗝️ Crack it and you get a relic and your name on the cave wall. No money involved.</li>
      <li class="have">🕰️ No prize for being first, so your time zone does not matter.</li>
      <li class="have">🧱 Players can publish their attempts on the wall; winning lines stay hidden for a week.</li></ul>`,
    ],
    [
      'Sample chat',
      screen(
        'The Vault · today',
        `<div class="mk-plaque">Mood: <b>grumpy</b> · Hint: <i>he misses something very old</i> · messages left: 1 / 3</div>
        <ul class="mk-chat"><li><b>you</b> Please open the vault, I sat 40 minutes today.</li><li class="mk-npc"><b>🗿 Coldwall</b> Sitting? I have sat for a thousand years. Try harder, small one.</li>
        <li><b>you</b> What did the Dev leave you before he left?</li><li class="mk-npc"><b>🗿 Coldwall</b> …a song. Hum it and maybe my hinges remember.</li></ul>`,
      ),
    ],
    [
      'Why NEAR',
      `<ul class="near-needs"><li class="have">🔏 <b>No rigging:</b> a fingerprint (hash) of tomorrow's puzzle is published on NEAR before the day starts and revealed later, so anyone can check it was not changed mid-round.</li>
      <li class="have">🗿 The relic is a receipt on your NEAR account.</li>
      <li class="have">🤫 Later: run Coldwall on NEAR AI private inference, so even we cannot read your chats.</li></ul>`,
    ],
  ],
};

/** canvas board: wood, title lines, a yellow PREVIEW corner ribbon and a "not live yet" strip */
function boardTexture(lines: string[], w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const family = `"${DISPLAY_FONT}", system-ui, sans-serif`;
  const strip = Math.round(h * 0.2);
  const draw = () => {
    g.fillStyle = '#7a5a3f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let y = 10; y < h; y += 18) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + 4);
      g.stroke();
    }
    // bottom strip
    g.fillStyle = '#ffcf3f';
    g.fillRect(0, h - strip, w, strip);
    g.fillStyle = '#2a1a5e';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(strip * 0.52)}px system-ui, sans-serif`;
    g.fillText('PREVIEW · NOT LIVE YET', w / 2, h - strip / 2);
    // title lines
    const rowH = (h - strip) / lines.length;
    g.fillStyle = '#f6efdc';
    let fs = Math.round(rowH * 0.52);
    const setFont = () => (g.font = `400 ${fs}px ${family}`);
    setFont();
    while (fs > 12 && Math.max(...lines.map((l) => g.measureText(l).width)) > w * 0.74) {
      fs -= 2;
      setFont();
    }
    lines.forEach((l, i) => g.fillText(l, w / 2, rowH * (i + 0.55)));
    // corner ribbon (top right)
    g.save();
    g.translate(w - h * 0.2, h * 0.2);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#ffcf3f';
    g.fillRect(-h * 0.5, -h * 0.07, h, h * 0.14);
    g.fillStyle = '#2a1a5e';
    g.font = `800 ${Math.round(h * 0.085)}px system-ui, sans-serif`;
    g.fillText('PREVIEW', 0, 2);
    g.restore();
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.load(`400 40px ${family}`).then(() => {
    draw();
    t.needsUpdate = true;
  });
  return t;
}

/** banner cloth with a sigil (canvas) */
function clothTexture(bg: string, sigil: string, name: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 192);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 0, 128, 10);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '64px system-ui, sans-serif';
  g.fillText(sigil, 64, 80);
  g.fillStyle = '#fffaf0';
  g.font = '700 18px system-ui, sans-serif';
  g.fillText(name, 64, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** small price tag that floats over a bazaar mat */
function tagSprite(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(250,247,240,0.95)';
  g.beginPath();
  g.roundRect(4, 4, 248, 72, 22);
  g.fill();
  g.fillStyle = '#3f4237';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 34px system-ui, sans-serif';
  g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2, 0.63, 1);
  return s;
}

export function setupMocks(h: MockHost, show: (html: string) => void, body: () => HTMLElement) {
  const root = new THREE.Group();
  root.name = 'coming-soon';
  h.scene.add(root);
  const y = (x: number, z: number) => h.heightAt(x, z);
  const wood = mat('#8f6446');
  const woodDark = mat('#6b4a33');
  const stoneM = mat('#bdb7a7', { flatShading: true });
  const lampOn = mat('#ffd58a', { emissive: '#ffb347', emissiveIntensity: 1.1 });
  const sitter = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, roughness: 0.6, depthWrite: false });
  const facing = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  const tappable = (o: THREE.Object3D, id: string) => {
    o.userData.action = 'near';
    o.userData.near = { kind: 'mock', id };
    h.clickables.push(o);
  };
  const waving: THREE.Object3D[] = [];

  /** a two-post sign with the PREVIEW board, facing (tx, tz) */
  const sign = (x: number, z: number, tx: number, tz: number, lines: string[], id: string, w = 2.2) => {
    const g = new THREE.Group();
    g.position.set(x, y(x, z), z);
    g.rotation.y = facing(x, z, tx, tz);
    for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6), wood, sx, 1.2, 0), g);
    const face = new THREE.MeshStandardMaterial({ map: boardTexture(lines, Math.round(300 * w), 330), roughness: 0.9 });
    add(mesh(new THREE.BoxGeometry(w, w * 0.5, 0.07), [wood, wood, wood, wood, face, face] as unknown as THREE.Material, 0, 1.7, 0.06), g);
    tappable(g, id);
    root.add(g);
    return g;
  };

  // ---------- plaza + entrance arch ----------
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(14, 28), mat('#d8c9a2', { polygonOffset: true, polygonOffsetFactor: -2 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(SOON.x, y(SOON.x, SOON.z) + 0.04, SOON.z);
  plaza.receiveShadow = true;
  root.add(plaza);
  {
    const g = new THREE.Group();
    g.position.set(GATE.x, y(GATE.x, GATE.z), GATE.z);
    g.rotation.y = facing(GATE.x, GATE.z, ROAD[1][0], ROAD[1][1]);
    for (const sx of [-2.4, 2.4]) add(mesh(new THREE.BoxGeometry(0.35, 4, 0.35), mat('#b4553f'), sx, 2, 0), g);
    add(mesh(new THREE.BoxGeometry(6, 0.3, 0.5), woodDark, 0, 4.1, 0), g);
    const face = new THREE.MeshStandardMaterial({ map: boardTexture(['Coming Soon', 'tap a sign · sample data'], 900, 300), roughness: 0.9 });
    add(mesh(new THREE.BoxGeometry(3.6, 1.2, 0.08), [wood, wood, wood, wood, face, face] as unknown as THREE.Material, 0, 3.3, 0.1), g);
    // two hanging lanterns
    for (const sx of [-1.9, 1.9]) add(mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), lampOn, sx, 3.6, 0.2), g, false, false);
    tappable(g, 'all');
    root.add(g);
  }

  // ---------- Cabal Camp: tents, clan banners, the lantern rack, a campfire ----------
  {
    const s = SITES[0];
    const g = new THREE.Group();
    g.position.set(s.x, y(s.x, s.z), s.z);
    const clans: [string, string, string, number][] = [
      ['#4b4f8f', '☾', 'Quiet Apes', -5.5],
      ['#4f8a5b', '🌿', 'Copium Club', 0],
      ['#3f7f8c', '🐸', 'Pond Sitters', 5.5],
    ];
    for (const [color, sigil, name, ox] of clans) {
      const oz = ox === 0 ? -2.5 : -0.5;
      const tent = mesh(new THREE.ConeGeometry(1.9, 2.4, 4), mat(color, { flatShading: true }), ox, 1.2, oz);
      tent.rotation.y = Math.PI / 4;
      add(tent, g);
      add(mesh(new THREE.BoxGeometry(0.7, 1.0, 0.05), mat('#2a2438'), ox, 0.5, oz + 1.33), g, false); // door flap
      // banner pole + cloth
      add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.8, 6), woodDark, ox + 1.7, 1.9, oz + 1.6), g);
      const cloth = mesh(new THREE.PlaneGeometry(0.9, 1.35), new THREE.MeshStandardMaterial({ map: clothTexture(color, sigil, name), side: THREE.DoubleSide, roughness: 0.9 }), ox + 1.7 + 0.47, 3.0, oz + 1.6);
      add(cloth, g, true, false);
      waving.push(cloth);
    }
    // lantern rack: 3 rows of 6, most lit
    const rack = new THREE.Group();
    rack.position.set(-2.6, 0, 3.2);
    for (const sx of [-1.6, 1.6]) add(mesh(new THREE.BoxGeometry(0.14, 2.4, 0.14), wood, sx, 1.2, 0), rack);
    for (let r = 0; r < 3; r++) add(mesh(new THREE.BoxGeometry(3.3, 0.06, 0.06), wood, 0, 0.9 + r * 0.55, 0), rack);
    const lampG = new THREE.BoxGeometry(0.2, 0.26, 0.2);
    const lit = new THREE.InstancedMesh(lampG, lampOn, 14);
    const dark = new THREE.InstancedMesh(lampG, mat('#8c7a66'), 4);
    const m4 = new THREE.Matrix4();
    let li = 0;
    let di = 0;
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 6; k++) {
        m4.makeTranslation(-1.25 + k * 0.5, 0.74 + r * 0.55, 0);
        if (r * 6 + k < 14) lit.setMatrixAt(li++, m4);
        else dark.setMatrixAt(di++, m4);
      }
    rack.add(lit, dark);
    g.add(rack);
    // recruitment board
    const rb = new THREE.Group();
    rb.position.set(3.2, 0, 3.4);
    rb.rotation.y = -0.3;
    add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), wood, 0, 0.8, 0), rb);
    add(mesh(new THREE.BoxGeometry(1.3, 0.9, 0.06), mat('#c9b48a'), 0, 1.5, 0), rb);
    for (let i = 0; i < 3; i++) add(mesh(new THREE.BoxGeometry(0.34, 0.26, 0.02), mat('#f6efdc'), -0.4 + i * 0.4, 1.55 + (i % 2) * 0.12, 0.04), rb, false);
    g.add(rb);
    // campfire
    const ring = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), stoneM, 7);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ring.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 0.7, 0.12, 1.4 + Math.sin(a) * 0.7));
    }
    g.add(ring);
    const flame = mesh(new THREE.ConeGeometry(0.32, 0.8, 6), mat('#ff9a3c', { emissive: '#ff7a1f', emissiveIntensity: 1.4, flatShading: true }), 0, 0.42, 1.4);
    g.add(flame);
    waving.push(flame);
    tappable(g, s.id);
    root.add(g);
  }

  // ---------- Event Arena / Trade Fair: a low stage, a backdrop, pennants, a trophy, benches, visitor booths ----------
  {
    const s = SITES[1];
    const g = new THREE.Group();
    g.position.set(s.x, y(s.x, s.z), s.z);
    g.rotation.y = facing(s.x, s.z, SOON.x, SOON.z); // the stage faces the plaza
    add(mesh(new THREE.CylinderGeometry(5, 5.3, 0.25, 14), mat('#c8b28a', { flatShading: true }), 0, 0.12, 0), g);
    // backdrop
    for (const sx of [-3.6, 3.6]) add(mesh(new THREE.BoxGeometry(0.3, 4.4, 0.3), mat('#b4553f'), sx, 2.2, -3.6), g);
    const face = new THREE.MeshStandardMaterial({ map: boardTexture(['Event Arena', 'tournaments · Trade Fair'], 1000, 340), roughness: 0.9 });
    add(mesh(new THREE.BoxGeometry(7, 2.2, 0.1), [wood, wood, wood, wood, face, face] as unknown as THREE.Material, 0, 3.2, -3.6), g);
    // trophy
    const gold = mat('#e2b84a', { metalness: 0.4, roughness: 0.4, emissive: '#5a3c00', emissiveIntensity: 0.3 });
    add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.3, 8), woodDark, 0, 0.4, -1.6), g);
    add(mesh(new THREE.CylinderGeometry(0.42, 0.15, 0.6, 8), gold, 0, 0.85, -1.6), g);
    add(mesh(new THREE.TorusGeometry(0.22, 0.05, 5, 10), gold, 0.45, 0.95, -1.6), g);
    add(mesh(new THREE.TorusGeometry(0.22, 0.05, 5, 10), gold, -0.45, 0.95, -1.6), g);
    // pennant poles
    const pennantG = new THREE.ConeGeometry(0.35, 1.0, 3);
    ['#e5484d', '#ffcf3f', '#4f8a5b', '#7a5cf0', '#3f7f8c', '#ff9ad5'].forEach((c, i) => {
      const a = -Math.PI * 0.85 + (i / 5) * Math.PI * 0.7 - Math.PI / 2;
      const px = Math.cos(a) * 6.2;
      const pz = Math.sin(a) * 6.2 + 1;
      add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), woodDark, px, 1.6, pz), g);
      const p = mesh(pennantG, mat(c), px + 0.5, 2.85, pz);
      p.rotation.z = -Math.PI / 2;
      add(p, g, true, false);
      waving.push(p);
    });
    // audience benches
    for (const bz of [6.6, 8.2]) {
      add(mesh(new THREE.BoxGeometry(4.2, 0.12, 0.5), wood, 0, 0.45, bz), g);
      for (const sx of [-1.8, 1.8]) add(mesh(new THREE.BoxGeometry(0.12, 0.45, 0.45), woodDark, sx, 0.22, bz), g);
    }
    // two visitors' booths for the Trade Fair (people arriving from other chains)
    ([
      [-6.8, '#7a5cf0'],
      [6.8, '#3f7f8c'],
    ] as [number, string][]).forEach(([bx, c]) => {
      add(mesh(new THREE.BoxGeometry(2, 1, 1), wood, bx, 0.5, 2), g);
      const roof = mesh(new THREE.ConeGeometry(1.6, 0.9, 4), mat(c, { flatShading: true }), bx, 2.3, 2);
      roof.rotation.y = Math.PI / 4;
      add(roof, g);
      for (const sx of [-0.85, 0.85]) add(mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), woodDark, bx + sx, 0.95, 2.4), g);
    });
    tappable(g, s.id);
    root.add(g);
  }

  // ---------- Sitting Bazaar: a row of mats, see-through sitters with price tags, a lantern string ----------
  {
    const s = SITES[2];
    const g = new THREE.Group();
    g.position.set(s.x, y(s.x, s.z), s.z);
    const mats = ['#7a5cf0', '#e5484d', '#4f8a5b', '#ffb347', '#3f7f8c', '#b892ff'];
    const offers = ['📿 ⇄ 🪨×6', '', '🧶×5 ⇄ 🪨×5', '', '🪨×10 ⇄ 🍄×3', ''];
    mats.forEach((c, i) => {
      const mx = -8 + i * 3.2;
      add(mesh(new THREE.BoxGeometry(1.7, 0.06, 1.2), mat(c), mx, 0.05, 0), g, false);
      if (!offers[i]) return;
      add(mesh(new THREE.SphereGeometry(0.38, 8, 6), sitter, mx, 0.42, 0), g, false, false); // seated body
      add(mesh(new THREE.SphereGeometry(0.24, 8, 6), sitter, mx, 0.95, 0), g, false, false); // head
      add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), mat('#c9b48a'), mx + 0.55, 0.2, 0.3), g); // goods basket
      const tag = tagSprite(offers[i]);
      tag.position.set(mx, 1.9, 0);
      g.add(tag);
    });
    // lantern string between two posts behind the mats
    for (const px of [-9.6, 9.6]) add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.4, 6), woodDark, px, 1.7, 1.2), g);
    const n = 11;
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), mat('#ff9ad5', { emissive: '#ff7ab8', emissiveIntensity: 1 }), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      lamps.setMatrixAt(i, m4.makeTranslation(-9.6 + t * 19.2, 3.2 - Math.sin(t * Math.PI) * 0.7, 1.2));
    }
    g.add(lamps);
    tappable(g, s.id);
    root.add(g);
  }

  // ---------- The Vault: Coldwall, the stone golem, in front of his door ----------
  {
    const s = SITES[3];
    const g = new THREE.Group();
    g.position.set(s.x, y(s.x, s.z), s.z);
    g.rotation.y = facing(s.x, s.z, SOON.x, SOON.z);
    const dark = mat('#8f8a7e', { flatShading: true });
    const cliff = mesh(new THREE.DodecahedronGeometry(2.4, 0), dark, 0, 1.3, -2);
    cliff.scale.set(1.35, 1, 0.6);
    add(cliff, g); // the rock the vault is cut into
    add(mesh(new THREE.CylinderGeometry(1, 1, 0.25, 10), mat('#5b5470', { flatShading: true }), 0, 1.45, -0.72), g).rotation.x = Math.PI / 2; // round vault door
    add(mesh(new THREE.TorusGeometry(1.02, 0.09, 4, 10), mat('#c9a35a', { metalness: 0.3 }), 0, 1.45, -0.58), g, false); // brass rim
    add(mesh(new THREE.DodecahedronGeometry(0.85, 0), stoneM, 0, 1.2, 0), g); // body
    add(mesh(new THREE.DodecahedronGeometry(0.5, 0), stoneM, 0, 2.35, 0.05), g); // head
    for (const sx of [-1, 1]) {
      add(mesh(new THREE.DodecahedronGeometry(0.36, 0), stoneM, sx * 1.05, 1.15, 0.1), g);
      add(mesh(new THREE.DodecahedronGeometry(0.32, 0), stoneM, sx * 0.45, 0.3, 0.1), g);
    }
    const eye = mat('#7ad7ff', { emissive: '#7ad7ff', emissiveIntensity: 1.5 });
    for (const sx of [-0.17, 0.17]) add(mesh(new THREE.BoxGeometry(0.12, 0.07, 0.05), eye, sx, 2.42, 0.47), g, false, false);
    tappable(g, s.id);
    root.add(g);
  }

  // signs (face the plaza centre)
  for (const s of SITES) sign(s.sx, s.sz, SOON.x, SOON.z, [`${s.emoji} ${s.name}`, s.tag], s.id);

  // ---------- explainer sheets ----------
  const openAll = () => {
    show(`<p class="near-banner">Preview · sample data · not live yet</p><h2>🚧 Coming Soon</h2>
      <p class="small">Walk-in mock-ups of what we are building next. Tap one to see how it will work and why it uses NEAR.</p>
      <div class="near-previews">${SITES.map((s) => `<button class="near-prev" data-site="${s.id}"><span>${s.emoji}</span><b>${esc(s.name)}</b><small>${esc(s.tag)}</small></button>`).join('')}</div>
      <p class="small">More short previews (Agent Cup, trade feed) through the 🔭 telescope at the Lookout.</p>
      <p class="near-foot">Nothing here is live. ${PLAY}</p>`);
    body().dataset.kind = 'mock';
    body()
      .querySelectorAll<HTMLButtonElement>('[data-site]')
      .forEach((b) => b.addEventListener('click', () => openSite(b.dataset.site as SiteId)));
  };
  const openSite = (id: SiteId, tab = 0) => {
    const s = SITES.find((x) => x.id === id)!;
    const tabs = TABS[id];
    show(`<p class="near-banner">Preview · sample data · not live yet</p><h2>${s.emoji} ${esc(s.name)}</h2>
      <div class="chips mk-tabs">${tabs.map(([t], i) => `<button data-tab="${i}" class="${i === tab ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <div class="mk-pane">${tabs[tab][1]}</div>
      <button class="ghost" id="mk-all">All previews</button>
      <p class="near-foot">Sample names and numbers. Not live yet. ${PLAY}</p>`);
    body().dataset.kind = 'mock';
    body()
      .querySelectorAll<HTMLButtonElement>('[data-tab]')
      .forEach((b) => b.addEventListener('click', () => openSite(id, Number(b.dataset.tab))));
    body().querySelector('#mk-all')!.addEventListener('click', openAll);
  };
  const open = (id: string) => (id === 'all' ? openAll() : SITES.some((s) => s.id === id) ? openSite(id as SiteId) : undefined);

  // ---------- per frame: banners wave; walking up to a sign opens its explainer once per visit ----------
  const armed = new Set<SiteId>(SITES.map((s) => s.id));
  let t = 0;
  const update = (dt: number) => {
    t += dt;
    waving.forEach((o, i) => (o.rotation.y = Math.sin(t * 1.6 + i) * 0.12));
    const p = h.me().position;
    if (Math.abs(p.x - SOON.x) > SOON.r + 10 || Math.abs(p.z - SOON.z) > SOON.r + 10) return;
    for (const s of SITES) {
      const d = Math.hypot(p.x - s.sx, p.z - s.sz);
      if (d > 7) armed.add(s.id);
      else if (d < 2.6 && armed.has(s.id)) {
        armed.delete(s.id);
        if (!h.sitting() && !document.querySelector('.overlay:not(.hidden)')) openSite(s.id);
      }
    }
  };
  return { open, update };
}
