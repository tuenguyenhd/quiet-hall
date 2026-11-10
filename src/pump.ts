// PumpHall sheet: pick UP or DOWN for the next SOL / SKR round, see the live round, past results
// (each with a "verify" link to the public Coinbase candles), and the weekly / all-time leaderboard.
// Fun only: no money in, no prizes out.
import { apiPost } from './api';
import { PUMP_MARKETS, type PumpMarket } from './layout';
import type { BoardData } from './pumphall';

type Dir = 'up' | 'down';
interface Mine {
  dir: Dir;
  won: number | null;
  pts: number;
}
interface Round {
  k: number;
  start: number;
  end: number;
  up: number;
  down: number;
  mine: Mine | null;
}
interface MarketState {
  roundMin: number;
  price: number | null;
  live: Round & { lock: number | null; verifyLock: string };
  next: Round & { closesAt: number };
  past: (Round & { lock: number; close: number; res: 'up' | 'down' | 'flat' | 'void'; verifyLock: string; verifyClose: string })[];
}
interface Row {
  name: string;
  tag: string;
  pts: number;
  wins: number;
  losses: number;
  best: number;
  you: boolean;
}
interface State {
  now: number;
  closeMs: number;
  markets: Record<PumpMarket, MarketState>;
  week_board: Row[];
  all_board: Row[];
  me: { name: string; tag: string; pts: number; wpts: number; wins: number; losses: number; streak: number; best: number; rank: number | null; wrank: number | null } | null;
  duels: { id: string; m: PumpMarket; dir: Dir; opp: string | null; oppTag: string | null; endAt: number; rated: boolean; status: string; res: string | null; won: number | null; pts: number; r0: number | null; r1: number | null; verifyClose: string }[];
  duel_board: (Row & { rating: number })[];
  duel_me: { rating: number; rated: number; wins: number; losses: number; draws: number; streak: number; best: number; pts: number; wpts: number } | null;
}

interface Host {
  pid: string;
  seed: number;
  name: () => string;
  toast: (t: string, ms?: number) => void;
  setBoard: (d: BoardData) => void;
  /** is the player near PumpHall (keep the board live) */
  near: () => boolean;
  duelOpen: () => boolean;
  setDuelOpen: (on: boolean) => void;
}

const $ = (id: string) => document.getElementById(id)!;
const fmtP = (p: number | null | undefined) => (p == null ? '…' : p >= 10 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toFixed(5));
const fmtT = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const room = new URLSearchParams(location.search).get('pumproom') ?? undefined;

export function setupPump(h: Host) {
  let st: State | null = null;
  let got = 0; // performance.now() when st arrived (server clock = st.now + elapsed)
  let market: PumpMarket = 'SOL';
  let board: 'week' | 'all' | 'duel' = 'week';
  let busy = false;
  let timer = 0;
  const sheet = $('pumpsheet');
  /** my picks we are waiting on (`${m}:${k}`): shown as a status card until settled, then a toast */
  const waiting = new Map<string, { m: PumpMarket; k: number; dir: Dir; start: number; end: number }>();
  /** a just-settled result to show on the card for a minute */
  let lastResult: { text: string; good: boolean; until: number } | null = null;
  const open = () => !sheet.classList.contains('hidden');
  const now = () => (st ? st.now + (performance.now() - got) : Date.now());

  async function load() {
    try {
      st = await apiPost<State>('/api/pump/state', { pid: h.pid, room });
      got = performance.now();
      track();
      if (open()) render();
    } catch {
      /* offline: keep the last state */
    }
  }

  function track() {
    if (!st) return;
    for (const m of Object.keys(PUMP_MARKETS) as PumpMarket[]) {
      const s = st.markets[m];
      for (const r of [s.live, s.next]) if (r.mine) waiting.set(`${m}:${r.k}`, { m, k: r.k, dir: r.mine.dir, start: r.start, end: r.end });
      for (const r of s.past) {
        const w = waiting.get(`${m}:${r.k}`);
        if (!w || !r.mine) continue;
        waiting.delete(`${m}:${r.k}`);
        const move = `${m} ${r.res === 'up' ? '⬆ went UP' : r.res === 'down' ? '⬇ went DOWN' : r.res === 'flat' ? 'stayed flat' : 'round void'} ($${fmtP(r.lock)} → $${fmtP(r.close)})`;
        const good = r.mine.won === 1;
        const text = good ? `✅ ${move}. You were right: +${r.mine.pts} pts!` : r.mine.won === 0 ? `❌ ${move}. Not this time.` : `➖ ${move}. No points either way.`;
        lastResult = { text, good, until: performance.now() + 60000 };
        h.toast(text, 5000);
      }
    }
  }

  /** status card: what is happening with my pick right now */
  function status(t: number) {
    const el = $('pump-status');
    const mine = [...waiting.values()].sort((a, b) => a.end - b.end);
    let html = '';
    for (const w of mine) {
      const s = st!.markets[w.m];
      const arrow = w.dir === 'up' ? '⬆ UP' : '⬇ DOWN';
      if (t < w.start) html += `<div>✓ <b>${w.m} ${arrow}</b> picked · round starts in <b>${fmtT(w.start - t)}</b>, result in ~${fmtT(w.end + 35000 - t)}</div>`;
      else if (t < w.end) {
        const lock = s.live.k === w.k ? s.live.lock : null;
        const d = lock != null && s.price != null ? Math.sign(s.price - lock) : 0;
        const win = d !== 0 && (d > 0) === (w.dir === 'up');
        html += `<div>🔴 <b>LIVE · ${w.m} ${arrow}</b> · $${fmtP(lock)} → $${fmtP(s.price)} · ${d === 0 ? 'even right now' : win ? '<b class="up">winning right now</b>' : '<b class="down">losing right now</b>'} · ends in <b>${fmtT(w.end - t)}</b></div>`;
      } else html += `<div>⏳ <b>${w.m} ${arrow}</b> · round over, checking the Coinbase close price…</div>`;
    }
    if (lastResult && performance.now() < lastResult.until) html = `<div class="${lastResult.good ? 'up' : ''}">${lastResult.text}</div>` + html;
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
  }

  function boardData(): BoardData | null {
    if (!st) return null;
    const t = now();
    const d = {} as BoardData;
    for (const m of Object.keys(PUMP_MARKETS) as PumpMarket[]) {
      const s = st.markets[m];
      d[m] = { price: s.price, lock: s.live.lock, left: s.live.end - t, closes: s.next.closesAt - t };
    }
    return d;
  }

  function render() {
    if (!st) return;
    const s = st.markets[market];
    const t = now();
    for (const b of document.querySelectorAll<HTMLElement>('#pump-markets button')) b.classList.toggle('on', b.dataset.m === market);
    for (const b of document.querySelectorAll<HTMLElement>('#pump-boards button')) b.classList.toggle('on', b.dataset.b === board);
    // live round
    const dir = s.price != null && s.live.lock != null ? Math.sign(s.price - s.live.lock) : 0;
    $('pump-price').textContent = `$${fmtP(s.price)}`;
    $('pump-price').className = 'pump-price ' + (dir > 0 ? 'up' : dir < 0 ? 'down' : '');
    const lm = s.live.mine;
    $('pump-live').innerHTML =
      `<b>Live</b> ${hhmm(s.live.start)}–${hhmm(s.live.end)} · ends in <b>${fmtT(s.live.end - t)}</b><br>` +
      (s.live.lock != null ? `Locked at <b>$${fmtP(s.live.lock)}</b> <a href="${s.live.verifyLock}" target="_blank" rel="noopener">verify</a>` : 'Price locking… (a few seconds)') +
      ` · crowd ⬆${s.live.up} ⬇${s.live.down}` +
      (lm ? ` · you: <b class="${lm.dir}">${lm.dir === 'up' ? '⬆ UP' : '⬇ DOWN'}</b>` : '');
    // next round: the one you can pick
    const closes = s.next.closesAt - t;
    const nm = s.next.mine;
    $('pump-q').textContent = `${market} at ${hhmm(s.next.end)}: higher or lower than at ${hhmm(s.next.start)}?`;
    $('pump-closes').textContent = nm
      ? `Saved ✓ Price locks at ${hhmm(s.next.start)}, result at ${hhmm(s.next.end)}. You can pick the following round once this one starts.`
      : closes > 0
        ? `Picks close in ${fmtT(closes)} (30 s before the round starts) · crowd ⬆${s.next.up} ⬇${s.next.down}`
        : `⏱ Last 30 s: picks are closed while the price locks (${fmtT(s.next.start - t)}). The next round opens right after.`;
    const can = !nm && closes > 0 && !busy;
    const up = $('btn-pump-up') as HTMLButtonElement;
    const down = $('btn-pump-down') as HTMLButtonElement;
    up.disabled = down.disabled = !can;
    up.classList.toggle('picked', nm?.dir === 'up');
    down.classList.toggle('picked', nm?.dir === 'down');
    up.textContent = nm?.dir === 'up' ? '✓ UP' : '⬆ UP';
    down.textContent = nm?.dir === 'down' ? '✓ DOWN' : '⬇ DOWN';
    status(t);
    // past results
    $('pump-past').innerHTML = s.past.length
      ? s.past
          .map((r) => {
            const res = r.res === 'up' ? '⬆' : r.res === 'down' ? '⬇' : r.res === 'flat' ? '＝' : '✕';
            const you = r.mine ? (r.mine.won === 1 ? ` <b class="up">+${r.mine.pts}</b>` : r.mine.won === 0 ? ' <b class="down">✗</b>' : ' ·') : '';
            return `<li>${hhmm(r.start)} ${res} $${fmtP(r.lock)} → $${fmtP(r.close)}${you} <a href="${r.verifyClose}" target="_blank" rel="noopener">verify</a></li>`;
          })
          .join('')
      : '<li>No finished rounds yet. Be the first!</li>';
    // leaderboard
    ($('opt-duel') as HTMLInputElement).checked = h.duelOpen();
    const myDuels = $('pump-myduels');
    myDuels.classList.toggle('hidden', board !== 'duel');
    if (board === 'duel') {
      const rows = st.duel_board ?? [];
      $('pump-board').innerHTML = rows.length
        ? rows.map((r, i) => `<li class="${r.you ? 'you' : ''}"><span>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span> ${esc(r.name)} <small>#${r.tag} · ${r.rating}</small><b>${r.pts}</b></li>`).join('')
        : '<li>No duel points yet this week. Bump into someone here and tap ⚔.</li>';
      const dm = st.duel_me;
      $('pump-me').textContent = dm ? `You: rating ${dm.rating} · ${dm.wpts} duel pts this week · ${dm.wins}W ${dm.losses}L ${dm.draws}D · streak ${dm.streak} (best ${dm.best})` : 'No duels yet.';
      myDuels.innerHTML = (st.duels ?? [])
        .map((d) => {
          const vs = `${d.m} ${d.dir === 'up' ? '⬆' : '⬇'} vs ${esc(d.opp ?? 'someone')}`;
          if (d.status !== 'done') return `<li>⏳ ${vs} · result ${hhmm(d.endAt + 30000)}</li>`;
          const r = d.won === 1 ? `<b class="up">won${d.pts ? ` +${d.pts}` : ''}</b>` : d.won === 0 ? '<b class="down">lost</b>' : 'draw';
          const rt = d.r0 != null && d.r1 != null && d.r1 !== d.r0 ? ` · ${d.r1 > d.r0 ? '+' : ''}${d.r1 - d.r0}` : d.rated ? '' : ' · unrated';
          return `<li>${hhmm(d.endAt)} ${vs} · ${r}${rt} <a href="${d.verifyClose}" target="_blank" rel="noopener">verify</a></li>`;
        })
        .join('');
      return;
    }
    const rows = board === 'week' ? st.week_board : st.all_board;
    $('pump-board').innerHTML = rows.length
      ? rows.map((r, i) => `<li class="${r.you ? 'you' : ''}"><span>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span> ${esc(r.name)} <small>#${r.tag}</small><b>${r.pts}</b></li>`).join('')
      : `<li>${board === 'week' ? 'Nobody on the board yet this week.' : 'Nobody has scored yet.'}</li>`;
    const me = st.me;
    $('pump-me').textContent = me
      ? `You: ${me.name} #${me.tag} · ${board === 'week' ? me.wpts : me.pts} pts${(board === 'week' ? me.wrank : me.rank) ? ` · rank ${board === 'week' ? me.wrank : me.rank}` : ''} · ${me.wins}W ${me.losses}L · streak ${me.streak} (best ${me.best})`
      : 'Make a pick to get on the board.';
  }

  async function pick(dir: Dir) {
    if (!st || busy) return;
    busy = true;
    render();
    try {
      await apiPost('/api/pump/pick', { pid: h.pid, seed: h.seed, name: h.name(), m: market, k: st.markets[market].next.k, dir, room });
      // the status card at the top of the sheet already says "✓ picked"; no toast over the sheet
    } catch (e) {
      h.toast((e as Error).message, 3500);
    }
    busy = false;
    await load();
  }

  $('btn-pump-up').addEventListener('click', () => pick('up'));
  $('btn-pump-down').addEventListener('click', () => pick('down'));
  for (const b of document.querySelectorAll<HTMLElement>('#pump-markets button'))
    b.addEventListener('click', () => {
      market = b.dataset.m as PumpMarket;
      render();
    });
  for (const b of document.querySelectorAll<HTMLElement>('#pump-boards button'))
    b.addEventListener('click', () => {
      board = b.dataset.b as 'week' | 'all' | 'duel';
      render();
    });
  $('opt-duel').addEventListener('change', (e) => h.setDuelOpen((e.target as HTMLInputElement).checked));

  // refresh: every 5 s while the sheet is open or you're at PumpHall; the board + timers tick every second
  let lastLoad = 0;
  function tick() {
    const active = open() || h.near();
    // waiting on a result elsewhere in the world: keep polling (slower) so the result toast still arrives
    if ((active && performance.now() - lastLoad > 5000) || (waiting.size && performance.now() - lastLoad > 10000)) {
      lastLoad = performance.now();
      load();
    }
    if (active && st) {
      const d = boardData();
      if (d) h.setBoard(d);
      if (open()) render();
      // a round just ended: fetch now so results appear quickly
      for (const m of Object.keys(PUMP_MARKETS) as PumpMarket[]) if (now() > st.markets[m].live.end + 1500 && performance.now() - lastLoad > 1500) lastLoad = 0;
    }
  }
  timer = window.setInterval(tick, 1000);

  return {
    open() {
      sheet.classList.remove('hidden');
      lastLoad = 0;
      tick();
      render();
    },
    stop: () => clearInterval(timer),
  };
}
