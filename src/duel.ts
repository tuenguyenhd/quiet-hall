// PvP prediction duels ("touch to duel"), design/gdd/pvp-prediction-duel.md.
// In PumpHall, walking into someone shows a ⚔ bubble over their head. Tap it, call SOL/SKR up or down for the next
// short round, and they take the other side if they accept. Coinbase candles settle it. Points only: no money in,
// nothing of value out. Never in the calm places and never during a sit.
import * as THREE from 'three';
import { apiPost } from './api';
import { DUEL, inDuelZone, type PumpMarket } from './layout';

type Dir = 'up' | 'down';
type Msg = Record<string, unknown>;

interface Other {
  root: THREE.Object3D;
  state: string;
}
interface Host {
  pid: string;
  scene: THREE.Scene;
  camera: THREE.Camera;
  myId: () => string;
  meRoot: () => THREE.Object3D;
  /** in the hall (welcome card closed) and not in a sit */
  canPlay: () => boolean;
  sitting: () => boolean;
  others: () => Map<string, Other>;
  name: (id: string) => string;
  isMuted: (id: string) => boolean;
  send: (m: Msg) => void;
  toast: (t: string, ms?: number) => void;
  haptic: (ms: number) => void;
  store: { get(k: string): string | null; set(k: string, v: string): void };
}
interface Active {
  id: string;
  opp: string;
  oppN: string;
  m: PumpMarket;
  dir: Dir;
  lockAt: number;
  endAt: number;
  rated: boolean;
}
interface DuelRow {
  id: string;
  m: PumpMarket;
  dir: Dir;
  opp: string | null;
  status: string;
  lock: number | null;
  close: number | null;
  res: string | null;
  won: number | null;
  pts: number;
  r0: number | null;
  r1: number | null;
  verifyClose: string;
}

const $ = (id: string) => document.getElementById(id)!;
const pumpRoom = new URLSearchParams(location.search).get('pumproom') ?? undefined;
const arrow = (d: Dir) => (d === 'up' ? '⬆ UP' : '⬇ DOWN');
const other = (d: Dir): Dir => (d === 'up' ? 'down' : 'up');
const fmtT = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtP = (p: number | null | undefined) => (p == null ? '…' : p >= 10 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toFixed(5));
const UP_C = new THREE.Color('#14F195');
const DOWN_C = new THREE.Color('#ff4d6d');

export function setupDuel(h: Host) {
  /** who is open to duels (from welcome / join / dq) */
  const open = new Map<string, boolean>();
  let mine = h.store.get('duel') !== '0';
  let market: PumpMarket = (h.store.get('duelm') as PumpMarket) || 'SOL';
  let len = Number(h.store.get('duell')) || DUEL.lens[0];

  // ---------- state ----------
  let bubbleFor: { id: string; until: number } | null = null;
  const touching = new Set<string>();
  let compose: { to: string; n: string } | null = null;
  let sent: { id: string; to: string; n: string; until: number } | null = null;
  let incoming: { id: string; from: string; n: string; m: PumpMarket; dir: Dir; len: number; rated: boolean; why: string; until: number } | null = null;
  let active: Active | null = null;
  let outOfZoneSince = 0;
  /** the last result, shown on the chip with a Rematch button */
  let result: { text: string; opp: string; oppN: string; m: PumpMarket; dir: Dir; until: number } | null = null;
  /** results that landed during a sit: shown when it ends */
  const held: string[] = [];
  let offset = 0; // server clock - local clock
  let live: { price: number | null; lockSeen: number | null } = { price: null, lockSeen: null };
  let lastPoll = 0;
  const now = () => Date.now() + offset;

  // ---------- rings between duelling players (everyone nearby sees them) ----------
  const rings = new Map<string, { a: string; b: string; until: number; line: THREE.Line }>();
  function ring(id: string, a: string, b: string, adir: Dir, until: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const ca = adir === 'up' ? UP_C : DOWN_C;
    const cb = adir === 'up' ? DOWN_C : UP_C;
    g.setAttribute('color', new THREE.Float32BufferAttribute([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    line.frustumCulled = false;
    h.scene.add(line);
    rings.set(id, { a, b, until, line });
    if (rings.size > 6) dropRing([...rings.keys()][0]);
  }
  function dropRing(id: string) {
    const r = rings.get(id);
    if (!r) return;
    h.scene.remove(r.line);
    r.line.geometry.dispose();
    (r.line.material as THREE.Material).dispose();
    rings.delete(id);
  }
  const rootOf = (id: string) => (id === h.myId() ? h.meRoot() : h.others().get(id)?.root);

  // ---------- DOM ----------
  const bubble = $('duel-bubble');
  const chip = $('duel-chip');
  const composeEl = $('duelsheet');
  const invEl = $('duelinv');
  const tmp = new THREE.Vector3();

  function renderCompose() {
    if (!compose) return composeEl.classList.add('hidden');
    $('duel-to').textContent = `⚔ Duel ${compose.n}`;
    for (const b of composeEl.querySelectorAll<HTMLElement>('[data-dm]')) b.classList.toggle('on', b.dataset.dm === market);
    for (const b of composeEl.querySelectorAll<HTMLElement>('[data-dl]')) b.classList.toggle('on', Number(b.dataset.dl) === len);
    $('duel-sub').textContent = `${market} in ${len} min: higher or lower? They take the other side.`;
    composeEl.classList.remove('hidden');
  }
  function renderInvite() {
    if (!incoming) return invEl.classList.add('hidden');
    $('duelinv-head').textContent = `⚔ ${incoming.n} calls ${incoming.m} ${arrow(incoming.dir)}`;
    $('duelinv-sub').textContent = `Next ${incoming.len}-min round · you take ${arrow(other(incoming.dir))} · ${incoming.rated ? 'rated' : `unrated (${incoming.why})`} · points only`;
    invEl.classList.remove('hidden');
  }
  function closeCompose() {
    compose = null;
    composeEl.classList.add('hidden');
  }

  function ask(dir: Dir) {
    if (!compose) return;
    h.store.set('duelm', market);
    h.store.set('duell', String(len));
    h.send({ t: 'duel_ask', to: compose.to, m: market, dir, len });
    $('duel-sub').textContent = 'Sending…';
  }

  function canChallenge(id: string) {
    const o = h.others().get(id);
    if (!o || !mine || active || !h.canPlay() || open.get(id) === false || o.state === 'sit') return false;
    const me = h.meRoot().position;
    if (!inDuelZone(me.x, me.z) || !inDuelZone(o.root.position.x, o.root.position.z)) return false;
    return Math.hypot(me.x - o.root.position.x, me.z - o.root.position.z) <= DUEL.menuR;
  }

  function challenge(id: string) {
    if (!canChallenge(id)) return h.toast('Duels happen in PumpHall, standing close to someone who is open to duels.', 3500);
    incoming = null;
    invEl.classList.add('hidden');
    compose = { to: id, n: h.name(id) };
    bubbleFor = null;
    renderCompose();
  }

  async function poll() {
    lastPoll = performance.now();
    try {
      const st = await apiPost<{ now: number; markets: Record<PumpMarket, { price: number | null }>; duels: DuelRow[] }>('/api/pump/state', { pid: h.pid, room: pumpRoom });
      offset = st.now - Date.now();
      if (!active) return;
      live.price = st.markets[active.m]?.price ?? null;
      if (live.lockSeen == null && now() >= active.lockAt) live.lockSeen = live.price;
      const d = st.duels.find((x) => x.id === active!.id);
      if (d?.status === 'done') finish(d);
    } catch {
      /* offline: try again */
    }
  }

  function finish(d: DuelRow) {
    const a = active!;
    active = null;
    dropRing(d.id);
    const move = `${d.m} ${d.res === 'up' ? 'went ⬆ UP' : d.res === 'down' ? 'went ⬇ DOWN' : d.res === 'flat' ? 'stayed flat' : 'had no price'} ($${fmtP(d.lock)} → $${fmtP(d.close)})`;
    const rating = d.r0 != null && d.r1 != null && d.r1 !== d.r0 ? ` · rating ${d.r1} (${d.r1 > d.r0 ? '+' : ''}${d.r1 - d.r0})` : '';
    const text =
      d.won === 1
        ? `⚔ You beat ${a.oppN}! ${move}.${d.pts ? ` +${d.pts} duel pts` : ' (unrated)'}${rating}`
        : d.won === 0
          ? `⚔ ${a.oppN} called it this time. ${move}.${rating}`
          : `⚔ Draw with ${a.oppN}: ${move}.${rating}`;
    result = { text, opp: a.opp, oppN: a.oppN, m: a.m, dir: other(a.dir), until: performance.now() + 20000 };
    if (h.sitting()) held.push(text);
    else {
      h.toast(text, 6000);
      h.haptic(d.won === 1 ? 40 : 15);
    }
  }

  function renderChip(t: number) {
    let html = '';
    if (active) {
      const a = active;
      const vs = `${a.m} ${arrow(a.dir)} vs ${escape(a.oppN)}`;
      if (t < a.lockAt) html = `⚔ <b>${vs}</b> · locks in <b>${fmtT(a.lockAt - t)}</b> <button data-dx>✕</button>`;
      else if (t < a.endAt) {
        const lk = live.lockSeen;
        const d = lk != null && live.price != null ? Math.sign(live.price - lk) : 0;
        const ahead = d === 0 ? 'even' : (d > 0) === (a.dir === 'up') ? '<b class="up">ahead</b>' : '<b class="down">behind</b>';
        html = `⚔ <b>LIVE ${vs}</b> · ${fmtT(a.endAt - t)} · ~${ahead}`;
      } else html = `⚔ <b>${vs}</b> · checking the Coinbase close…`;
    } else if (sent) html = `⚔ Waiting for ${escape(sent.n)}… ${fmtT(sent.until - performance.now())}`;
    else if (result && performance.now() < result.until && !h.sitting()) {
      const can = canChallenge(result.opp);
      html = `${escape(result.text)}${can ? ` <button data-dr>Rematch ${arrow(result.dir)}</button>` : ''}`;
    }
    if (chip.dataset.h !== html) {
      chip.dataset.h = html;
      chip.innerHTML = html;
    }
    chip.classList.toggle('hidden', !html);
  }
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // ---------- events ----------
  for (const b of composeEl.querySelectorAll<HTMLElement>('[data-dm]'))
    b.addEventListener('click', () => {
      market = b.dataset.dm as PumpMarket;
      renderCompose();
    });
  for (const b of composeEl.querySelectorAll<HTMLElement>('[data-dl]'))
    b.addEventListener('click', () => {
      len = Number(b.dataset.dl);
      renderCompose();
    });
  $('btn-duel-up').addEventListener('click', () => ask('up'));
  $('btn-duel-down').addEventListener('click', () => ask('down'));
  $('btn-duel-x').addEventListener('click', closeCompose);
  bubble.addEventListener('click', () => bubbleFor && challenge(bubbleFor.id));
  const answer = (ok: boolean) => {
    if (!incoming) return;
    h.send({ t: 'duel_ans', id: incoming.id, ok });
    incoming = null;
    renderInvite();
  };
  $('btn-duelinv-ok').addEventListener('click', () => answer(true));
  $('btn-duelinv-no').addEventListener('click', () => answer(false));
  $('btn-duelinv-x').addEventListener('click', () => answer(false));
  $('btn-duelinv-mute').addEventListener('click', () => {
    if (!incoming) return;
    const id = incoming.from;
    answer(false);
    muteHook?.(id);
  });
  chip.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-dx]') && active) h.send({ t: 'duel_cancel' });
    if (el.closest('[data-dr]') && result) {
      const r = result;
      result = null;
      if (!canChallenge(r.opp)) return;
      market = r.m;
      compose = { to: r.opp, n: r.oppN };
      ask(r.dir);
      compose = null;
    }
  });
  let muteHook: ((id: string) => void) | null = null;

  return {
    /** set from main: the player-menu mute */
    onMute(f: (id: string) => void) {
      muteHook = f;
    },
    isOpen: () => mine,
    setOpen(on: boolean) {
      mine = on;
      h.store.set('duel', on ? '1' : '0');
      h.send({ t: 'dq', on });
      if (!on) bubbleFor = null;
    },
    canChallenge,
    challenge,

    onMessage(m: Msg) {
      switch (m.t) {
        case 'welcome':
          open.clear();
          for (const p of (m.players as { id: string; dq?: boolean }[]) ?? []) open.set(p.id, p.dq !== false);
          if (!mine) h.send({ t: 'dq', on: false });
          break;
        case 'join': {
          const p = m.p as { id: string; dq?: boolean };
          open.set(p.id, p.dq !== false);
          break;
        }
        case 'dq':
          open.set(m.id as string, m.on !== false);
          break;
        case 'leave':
          open.delete(m.id as string);
          if (bubbleFor?.id === m.id) bubbleFor = null;
          if (compose?.to === m.id) closeCompose();
          break;
        case 'duel_inv': {
          const from = m.from as string;
          // muted players: drop silently (they just see "No answer")
          if (h.isMuted(from) || h.sitting() || !mine || active) return;
          closeCompose();
          incoming = { id: m.id as string, from, n: String(m.n), m: m.m as PumpMarket, dir: m.dir as Dir, len: Number(m.len), rated: !!m.rated, why: String(m.why ?? ''), until: performance.now() + Number(m.ms ?? DUEL.inviteMs) };
          renderInvite();
          h.haptic(15);
          break;
        }
        case 'duel_sent':
          sent = { id: m.id as string, to: m.to as string, n: String(m.n), until: performance.now() + Number(m.ms ?? DUEL.inviteMs) };
          closeCompose();
          break;
        case 'duel_no':
          if (sent && (!m.id || m.id === sent.id)) sent = null;
          if (compose) $('duel-sub').textContent = String(m.why);
          else h.toast(String(m.why), 3000);
          break;
        case 'duel_on': {
          const me = h.myId();
          ring(m.id as string, m.a as string, m.b as string, m.adir as Dir, Number(m.endAt));
          if (m.a !== me && m.b !== me) break;
          const isA = m.a === me;
          sent = null;
          incoming = null;
          renderInvite();
          closeCompose();
          result = null;
          live = { price: null, lockSeen: null };
          active = {
            id: m.id as string,
            opp: (isA ? m.b : m.a) as string,
            oppN: String(isA ? m.bn : m.an),
            m: m.m as PumpMarket,
            dir: isA ? (m.adir as Dir) : other(m.adir as Dir),
            lockAt: Number(m.lockAt),
            endAt: Number(m.endAt),
            rated: !!m.rated,
          };
          h.toast(`⚔ Duel on! You: ${active.m} ${arrow(active.dir)} vs ${active.oppN}. Locks in ${fmtT(active.lockAt - now())}.`, 4000);
          h.haptic(30);
          poll();
          break;
        }
        case 'duel_off':
          dropRing(m.id as string);
          if (active?.id === m.id) {
            active = null;
            h.toast(m.by === h.myId() ? 'Duel cancelled.' : `Duel cancelled (${m.why === 'sit' ? 'they sat down' : m.why === 'left' ? 'they left' : 'they backed out'}).`, 3000);
          }
          break;
      }
    },

    /** per frame */
    update() {
      const pnow = performance.now();
      const t = now();
      // rings
      for (const [id, r] of rings) {
        const ra = rootOf(r.a);
        const rb = rootOf(r.b);
        if (!ra || !rb || Date.now() > r.until + 60000) {
          dropRing(id);
          continue;
        }
        const pos = r.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, ra.position.x, ra.position.y + 0.08, ra.position.z);
        pos.setXYZ(1, rb.position.x, rb.position.y + 0.08, rb.position.z);
        pos.needsUpdate = true;
      }
      // invites time out quietly
      if (incoming && pnow > incoming.until) {
        incoming = null;
        renderInvite();
      }
      if (sent && pnow > sent.until) {
        sent = null;
        h.toast('No answer. Maybe next time.', 2500);
      }
      // results held during a sit
      if (held.length && !h.sitting()) h.toast(held.splice(0).join('  ·  '), 6000);
      // active duel: poll prices / result; leaving PumpHall before the lock cancels it
      if (active) {
        const every = t < active.endAt ? 5000 : 4000;
        if (pnow - lastPoll > every && t > active.lockAt - 2000) poll();
        const me = h.meRoot().position;
        if (t < active.lockAt && !inDuelZone(me.x, me.z)) {
          outOfZoneSince ||= pnow;
          if (pnow - outOfZoneSince > 2000) {
            h.send({ t: 'duel_cancel' });
            outOfZoneSince = 0;
          }
        } else outOfZoneSince = 0;
      }
      if (compose && !canChallenge(compose.to) && !sent) closeCompose();
      // touch → bubble over the nearest person you bump into
      const me = h.meRoot().position;
      const can = mine && !active && !sent && !compose && !incoming && h.canPlay() && inDuelZone(me.x, me.z);
      let best = '';
      let bestD = Infinity;
      if (can)
        for (const [id, o] of h.others()) {
          const d = Math.hypot(o.root.position.x - me.x, o.root.position.z - me.z);
          const isTouch = d <= DUEL.touchR && o.state !== 'sit' && open.get(id) !== false && !h.isMuted(id) && inDuelZone(o.root.position.x, o.root.position.z);
          if (isTouch && !touching.has(id) && d < bestD) {
            best = id;
            bestD = d;
          }
          if (isTouch) touching.add(id);
          else if (d > DUEL.touchR + 0.6) touching.delete(id);
        }
      if (best) bubbleFor = { id: best, until: pnow + DUEL.bubbleMs };
      if (bubbleFor && (!can || pnow > bubbleFor.until || !canChallenge(bubbleFor.id))) bubbleFor = null;
      const broot = bubbleFor && rootOf(bubbleFor.id);
      if (broot) {
        tmp.copy(broot.position);
        tmp.y += 2.6;
        tmp.project(h.camera);
        const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
        bubble.classList.toggle('hidden', !vis);
        if (vis) bubble.style.transform = `translate(-50%, -100%) translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px)`;
      } else bubble.classList.add('hidden');
      // HUD chip (cheap: only rewrites when the text changes)
      renderChip(t);
    },
  };
}
