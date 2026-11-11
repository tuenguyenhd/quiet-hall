// NEAR edition: the "Lost frens of Meme Valley" quest. Pets are not sold in this edition, so this is how you get one:
// go to Meme Valley, gather what a lost fren wishes for, grant the wish and sit beside them for a minute, and they
// follow you home as your pet. A small HUD chip opens the quest sheet; progress is read live from the econ state the
// server already sends (bag, frens rescued) plus where you are standing. No server state of its own.
// Also: "Preview · coming in Season 2" frens (sample text only, not playable) and the pointers to the quest from the
// welcome card, the pet sheet, the bag, the Rescue Book and the first-time hint.
import { FRENS, GATE, ITEMS, NODES, VALLEY, dist, type FrenInfo, type Item } from '../valley';
import { COURT } from '../layout';

type XZ = { x: number; z: number };
export interface QuestEcon {
  bag: Record<string, number>;
  frens: { fren: string; serial: number; rescues: number }[];
  near?: string | null;
}
export interface QuestHost {
  econ(): QuestEcon;
  /** my avatar's position */
  me(): XZ;
  /** walk in a straight line to a point (main.ts tap-to-walk) */
  walkTo(p: XZ): void;
  /** walk up to a valley thing and act on arrival (node: pick, fren: open the wish) */
  approach(kind: 'node' | 'fren', id: string): void;
  /** the lantern trail from the courtyard to the Gate: its points, and showing it */
  trail(): XZ[];
  showTrail(on: boolean): void;
  /** the fren whose wish sit is running right now, if any */
  wishFren(): string | null;
  /** wear a rescued fren as your pet */
  setPet(k: number): void;
  /** the shared NEAR sheet */
  show(html: string, kind: string): void;
  body(): HTMLElement;
  isOpen(kind: string): boolean;
  close(): void;
  toast(text: string, ms?: number): void;
  /** has the player entered the hall (welcome card gone)? */
  entered(): boolean;
  login(): void;
  /** sponsored drops (campaigns.ts): their section at the top of this sheet and the chip's count */
  drops?: { sheet(): string; wire(el: HTMLElement): void; open(): number; sig(): string };
}

/** Season 2 previews: sample text only, nothing here is playable or stored. */
export const SEASON2 = [
  { emoji: '🐶', name: 'Bonk Pup', where: 'in the Copium Caves', wants: '3 Bonk Bones · walk a lap of Wen Moon Lake together', pet: 'Bonk Pup: wags at every green candle' },
  { emoji: '😔', name: 'Wojak', where: 'on the ridge above the valley', wants: 'sit with him at sunrise, 3 days in a row', pet: 'Wojak: sits beside you, slowly cheers up' },
  { emoji: '🐱', name: 'Popcat', where: 'in the Rug Yarn meadow', wants: '2 Rug Yarn · a 5-minute silent group sit (3 players)', pet: 'Popcat: pops when someone says gm' },
];

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const frenEmoji = (f: FrenInfo) => (f.pet === 1 ? '🐕' : '🐸');
const wishText = (f: FrenInfo) =>
  Object.entries(f.wish)
    .map(([k, n]) => `${n} ${ITEMS[k as Item].name}${n! > 1 ? 's' : ''}`)
    .join(' + ');
const STORE = 'qh.quest.v1';
const load = (): { seen?: boolean; nudged?: boolean; after?: boolean } => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
};
const save = (s: ReturnType<typeof load>) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
};

export function setupQuest(h: QuestHost) {
  let mem = load();
  const inValley = (p: XZ = h.me()) => dist(p, VALLEY) <= VALLEY.r + 2 || dist(p, GATE) <= 14;
  const rescued = (f: FrenInfo) => h.econ().frens.find((x) => x.fren === f.id);
  const has = (f: FrenInfo) => Object.entries(f.wish).every(([k, n]) => (h.econ().bag[k] ?? 0) >= (n ?? 0));
  /** the fren to help next: one you can already grant, else the first still lost */
  const target = () => {
    const lost = FRENS.filter((f) => !rescued(f));
    return lost.find(has) ?? lost[0] ?? null;
  };
  const allDone = () => FRENS.every((f) => rescued(f));

  /** the one-line next step, for the chip and the sheet */
  function next(): { short: string; long: string; go: string } {
    const f = target();
    if (!f) return { short: '✓', long: 'Both lost frens are home. More frens arrive in Season 2.', go: '' };
    const w = h.wishFren();
    if (w) {
      const wf = FRENS.find((x) => x.id === w)!;
      return { short: `Sit with ${wf.name}…`, long: `Sit still beside ${wf.name} for a minute. Standing up cancels the wish.`, go: '' };
    }
    if (!inValley() && !mem.seen) return { short: 'Go to Meme Valley', long: 'Meme Valley is north-east, past the Tea House. Follow the lanterns.', go: 'Show me the way' };
    if (!has(f)) {
      const [k, n] = Object.entries(f.wish).find(([kk, nn]) => (h.econ().bag[kk] ?? 0) < (nn ?? 0))!;
      const it = ITEMS[k as Item];
      return { short: `Find ${it.emoji} ${h.econ().bag[k] ?? 0}/${n}`, long: `${f.name} wants ${wishText(f)}. Tap ${it.emoji} ${it.name}s in the valley to pick them.`, go: inValley() ? `Walk to the ${it.name}s` : 'Show me the way' };
    }
    return { short: `Help ${f.name}`, long: `You have what ${f.name} wants. Tap ${f.name}, grant the wish, and sit beside them for a minute.`, go: inValley() ? `Walk to ${f.name}` : 'Show me the way' };
  }

  // ---------- the chip ----------
  const chip = document.createElement('button');
  chip.id = 'near-quest-chip';
  chip.className = 'pill';
  chip.title = 'Quest: Lost frens of Meme Valley';
  chip.innerHTML = '<span class="q-ico">🐾</span><span class="q-txt"></span><span class="q-drop-n hidden"></span>';
  document.getElementById('hud')?.appendChild(chip);
  chip.addEventListener('click', () => open());
  let lastChip = '';
  function renderChip() {
    const done = FRENS.filter((f) => rescued(f)).length;
    const n = next();
    const txt = allDone() ? '✓' : done === 0 && !mem.seen && !inValley() ? 'Rescue a fren' : `${n.short} · ${done}/${FRENS.length}`;
    // a live sponsored drop not finished yet: a 🎁 count on the chip
    const dn = h.drops?.open() ?? 0;
    if (txt + dn === lastChip) return;
    lastChip = txt + dn;
    chip.querySelector('.q-txt')!.textContent = txt;
    const dEl = chip.querySelector('.q-drop-n')!;
    dEl.textContent = `🎁 ${dn}`;
    dEl.classList.toggle('hidden', !dn);
    chip.title = dn ? `Quest: Lost frens of Meme Valley · ${dn} sponsored drop${dn > 1 ? 's' : ''} live` : 'Quest: Lost frens of Meme Valley';
    chip.classList.toggle('done', allDone());
  }

  // ---------- the sheet ----------
  function step(state: 'done' | 'now' | 'todo', title: string, sub: string) {
    return `<li class="q-step ${state}"><span class="q-tick">${state === 'done' ? '✓' : state === 'now' ? '●' : '○'}</span><div><b>${title}</b><div class="small">${sub}</div></div></li>`;
  }
  function frenCard(f: FrenInfo) {
    const got = rescued(f);
    const need = Object.entries(f.wish)
      .map(([k, n]) => {
        const have = Math.min(h.econ().bag[k] ?? 0, n ?? 0);
        return `<span class="q-need ${have >= (n ?? 0) || got ? 'have' : ''}">${ITEMS[k as Item].emoji} ${got ? n : have}/${n}</span>`;
      })
      .join('');
    return `<div class="q-fren ${got ? 'done' : ''}"><span class="q-face">${frenEmoji(f)}</span><div class="q-fren-txt"><b>${esc(f.name)}</b> ${
      got ? `<span class="q-badge">✓ rescued #${got.serial}</span>` : '<span class="q-badge lost">lost</span>'
    }<div class="small">${got ? `${esc(f.name)} is your pet now.` : `Wants ${esc(wishText(f))} + ${f.sitMin} min sit beside them.`}</div><div class="q-needs">${need}<span class="q-need ${got ? 'have' : ''}">🧘 ${f.sitMin} min</span></div></div>${
      got ? `<button class="q-mini" data-pet="${f.pet}">Walk with ${esc(f.name)}</button>` : ''
    }</div>`;
  }
  function render() {
    const e = h.econ();
    const done = FRENS.filter((f) => rescued(f)).length;
    const there = inValley() || mem.seen || done > 0;
    const anyHas = FRENS.some((f) => !rescued(f) && has(f));
    const w = h.wishFren();
    const n = next();
    const s1 = there ? 'done' : 'now';
    const s2 = allDone() || anyHas || w ? 'done' : there ? 'now' : 'todo';
    const s3 = allDone() ? 'done' : anyHas || w ? 'now' : 'todo';
    const s4 = done > 0 ? 'done' : 'todo';
    const g = target();
    h.body().innerHTML = `${h.drops?.sheet() ?? ''}<h2>🐾 Lost frens of Meme Valley</h2>
      <p class="small q-lead">Pets aren't sold here. Two frens are lost in Meme Valley: help one home and it follows you as your pet.</p>
      <div class="near-pbar"><div style="width:${(done / FRENS.length) * 100}%"></div><span>${done}/${FRENS.length} frens rescued</span></div>
      ${allDone() ? '' : `<p class="q-next"><b>Next:</b> ${esc(n.long)}</p>${n.go ? `<button class="primary" id="q-go">${esc(n.go)} →</button>` : ''}`}
      <ol class="q-steps">
        ${step(s1, 'Go to Meme Valley', there ? 'You found the valley.' : 'North-east, past the Tea House. Lanterns light the way.')}
        ${step(s2, 'Gather what a fren wants', allDone() ? 'You found everything they wished for.' : g && has(g) ? `You have what ${esc(g.name)} wants.` : g ? `${esc(g.name)}: ${esc(wishText(g))}. Tap rocks 🪨 and shrooms 🍄 to pick them.` : 'Rocks 🪨 by the Gate and pond, shrooms 🍄 by the caves.')}
        ${step(s3, 'Grant the wish, sit 1 min', allDone() ? 'Both wishes granted.' : w ? `Sitting with ${esc(FRENS.find((x) => x.id === w)?.name)}… stay seated.` : 'Tap the fren, grant the wish, and sit quietly beside them.')}
        ${step(s4, 'Your new pet', done ? 'Pick it any time with 🐾 Pet, or on the welcome card.' : 'The fren follows you home. Choose it with 🐾 Pet.')}
      </ol>
      ${FRENS.map(frenCard).join('')}
      <p class="small q-chain">${
        e.near
          ? `Rescues are recorded on NEAR testnet to <b>${esc(e.near)}</b>.`
          : 'As a guest, rescues are recorded on NEAR under an account made for you. <a href="#" id="q-login">Log in</a> to keep them on your own.'
      }</p>
      <div class="q-s2"><p class="near-banner">Preview · coming in Season 2</p>
        <p class="small">More lost frens are on their way. Not playable yet: this is what they will ask for.</p>
        ${SEASON2.map(
          (p) => `<div class="q-fren q-soon"><span class="q-face">${p.emoji}</span><div class="q-fren-txt"><b>${esc(p.name)}</b> <span class="q-badge soon">🔒 Season 2</span>
            <div class="small">Lost ${esc(p.where)}. Will ask for: ${esc(p.wants)}.</div><div class="small">Pet: ${esc(p.pet)}</div></div></div>`,
        ).join('')}
        <p class="near-foot">Sample text. Names and wishes may change.</p></div>
      <button class="ghost" id="q-close">Close</button>`;
    h.body().dataset.kind = 'quest';
    lastSig = sig();
    h.drops?.wire(h.body());
    document.getElementById('q-go')?.addEventListener('click', go);
    document.getElementById('q-close')?.addEventListener('click', h.close);
    document.getElementById('q-login')?.addEventListener('click', (ev) => (ev.preventDefault(), h.close(), h.login()));
    h.body()
      .querySelectorAll<HTMLButtonElement>('[data-pet]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          h.setPet(Number(b.dataset.pet));
          h.close();
        }),
      );
  }
  let lastSig = '';
  const sig = () => JSON.stringify([h.econ().bag, h.econ().frens.length, h.econ().near, h.wishFren(), inValley(), mem.seen, h.drops?.sig()]);
  function open() {
    h.show('', 'quest');
    render();
  }

  // ---------- "Show me the way": follow the lantern trail to the Gate, then walk to what you need ----------
  let route: XZ[] = [];
  let trailOn = false;
  let bestD = Infinity;
  let stall = 0;
  /**
   * Walk somewhere far. Into Meme Valley: along the lantern trail to the Gate, then to `to`. Anywhere else (a sponsored
   * drop's zone): through the courtyard (the hub every road leaves from) unless already close, then to `to`.
   */
  function walkRoute(to: XZ) {
    const me = h.me();
    if ((dist(to, VALLEY) > VALLEY.r + 2 && dist(to, GATE) > 14) || inValley(me)) {
      route = [];
      const viaCourt = dist(me, COURT) > COURT.r && dist(to, COURT) > COURT.r && dist(me, to) > 30;
      if (viaCourt) route.push({ x: COURT.x, z: COURT.z });
      route.push(to);
      bestD = Infinity;
      stall = 0;
      h.walkTo(route[0]);
      return;
    }
    const pts = h.trail();
    // join the trail at the point nearest to you that is still ahead (closer to the Gate than you are)
    const ahead = pts.filter((p) => dist(p, GATE) < dist(me, GATE));
    const start = ahead.reduce((b, p, i) => (dist(p, me) < dist(ahead[b], me) ? i : b), 0);
    route = ahead.slice(start);
    // far from the courtyard and the trail (e.g. PumpHall): back to the courtyard first
    if (route.length && dist(me, route[0]) > 30 && dist(me, COURT) > COURT.r) route.unshift({ x: COURT.x, z: COURT.z });
    route.push(to);
    bestD = Infinity;
    stall = 0;
    h.showTrail((trailOn = true));
    h.walkTo(route[0]);
  }
  function go() {
    h.close();
    const f = target();
    if (!f) return;
    if (!inValley()) {
      h.toast('Walking to Meme Valley… follow the lanterns 🏮', 4000);
      return walkRoute(GATE);
    }
    if (has(f)) return h.approach('fren', f.id);
    // the nearest node with something this fren still needs
    const want = Object.entries(f.wish)
      .filter(([k, n]) => (h.econ().bag[k] ?? 0) < (n ?? 0))
      .map(([k]) => k);
    const me = h.me();
    const node = NODES.filter((nd) => want.includes(nd.item)).sort((a, b) => dist(a, me) - dist(b, me))[0];
    if (node) h.approach('node', node.id);
  }
  /** per frame: advance the route; stop if the player takes over or gets stuck */
  function update(dt: number) {
    if (!route.length) return;
    const me = h.me();
    const d = dist(me, route[0]);
    if (d < 2.2 || (route.length > 1 && d < 4)) {
      route.shift();
      bestD = Infinity;
      stall = 0;
      if (route.length) h.walkTo(route[0]);
      return;
    }
    if (d < bestD - 0.05) {
      bestD = d;
      stall = 0;
    } else if ((stall += dt) > 1.2) {
      // the player walked off somewhere else, or a tree is in the way: skip ahead once, then let them be
      route.shift();
      if (route.length) {
        bestD = Infinity;
        stall = 0;
        h.walkTo(route[0]);
      }
    }
  }

  // ---------- arrival, chip refresh ----------
  let tick = 0;
  function frame(dt: number) {
    update(dt);
    if ((tick += dt) < 0.4) return;
    tick = 0;
    if (h.entered() && !mem.seen && inValley()) {
      mem = { ...mem, seen: true };
      save(mem);
      if (!route.length) h.showTrail((trailOn = false));
      if (!allDone()) h.toast(`You found Meme Valley 🌙 ${target()?.name ?? 'A fren'} is waiting. Tap 🐾 for what they need.`, 5000);
    }
    if (!route.length && trailOn && inValley()) h.showTrail((trailOn = false));
    renderChip();
    // re-render the open sheet only when something on it changed (a rebuild mid-tap would eat the tap)
    if (h.isOpen('quest') && sig() !== lastSig) render();
  }
  /** econ changed (bag, rescues): re-render what shows */
  function refresh() {
    renderChip();
    if (h.isOpen('quest') && sig() !== lastSig) render();
  }

  // ---------- pointers from everywhere pets come up ----------
  // first-time hint (shown once on the first Enter)
  const hint = document.getElementById('hint');
  if (hint) hint.textContent = 'Tap to walk · drag to look · 🐾 top-left: rescue a lost fren to get a pet';
  // the welcome card's pet strip: pets aren't sold, say where they come from
  const strip = document.getElementById('pets');
  if (strip) {
    const p = document.createElement('p');
    p.className = 'small q-welcome-note';
    p.innerHTML = '🔒 Pets come from Meme Valley: rescue a lost fren and it follows you. Tap a 🔒 pet to see how.';
    strip.after(p);
  }
  // the pet sheet: no "adopt" here; a locked pet gets a "start the quest" button under its note
  const petCard = document.querySelector('#petsheet .card');
  const petIntro = petCard?.querySelector('h2 + p.small');
  if (petIntro) petIntro.textContent = 'Pets are not sold here: rescue a lost fren in Meme Valley and it follows you everywhere, and sits beside you when you sit.';
  const note = document.getElementById('pet-note');
  if (note) {
    const b = document.createElement('button');
    b.id = 'near-pet-quest';
    b.className = 'primary';
    b.type = 'button';
    b.textContent = '🐾 Start the Meme Valley quest';
    note.after(b);
    b.addEventListener('click', () => {
      // close the pet sheet the normal way (ends the try-on)
      document.querySelector<HTMLButtonElement>('#petsheet [data-close]')?.click();
      document.getElementById('petsheet')?.classList.add('hidden');
      if (h.entered()) return open();
      // still on the welcome card: open the quest once they are in
      mem = { ...mem, after: true };
      save(mem);
      h.toast('Pick a name and enter: the quest opens in the hall 🐾', 3500);
    });
  }
  document.getElementById('btn-enter')?.addEventListener('click', () => {
    const fresh = !h.econ().frens.length;
    if (mem.after) {
      mem = { ...mem, after: false };
      save(mem);
      setTimeout(open, 1200);
    } else if (fresh && !mem.nudged) {
      mem = { ...mem, nudged: true };
      save(mem);
      setTimeout(() => !allDone() && h.toast('A lost fren is waiting in Meme Valley. Tap 🐾 top-left to rescue them and get a pet.', 6000), 9000);
    }
  });

  renderChip();
  if (import.meta.env.DEV) (window as unknown as { __quest: unknown }).__quest = { route: () => route, stall: () => stall };
  return {
    open,
    refresh,
    update: frame,
    /** for the bag and the book: a link into the quest */
    link: (label = 'Find in Meme Valley →') => `<a href="#" class="q-link" data-quest>${esc(label)}</a>`,
    /** wire any [data-quest] link inside el */
    wire(el: HTMLElement) {
      el.querySelectorAll<HTMLElement>('[data-quest]').forEach((a) => a.addEventListener('click', (ev) => (ev.preventDefault(), open())));
    },
    guide: go,
    /** "Show me the way" to any point (sponsored drop zones); into the valley it follows the lanterns */
    guideTo(to: XZ) {
      if (dist(h.me(), to) < 6) return;
      walkRoute(to);
    },
  };
}
