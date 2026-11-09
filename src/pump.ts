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
}

interface Host {
  pid: string;
  seed: number;
  name: () => string;
  toast: (t: string, ms?: number) => void;
  setBoard: (d: BoardData) => void;
  /** is the player near PumpHall (keep the board live) */
  near: () => boolean;
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
  let board: 'week' | 'all' = 'week';
  let busy = false;
  let timer = 0;
  const sheet = $('pumpsheet');
  const open = () => !sheet.classList.contains('hidden');
  const now = () => (st ? st.now + (performance.now() - got) : Date.now());

  async function load() {
    try {
      st = await apiPost<State>('/api/pump/state', { pid: h.pid, room });
      got = performance.now();
      if (open()) render();
    } catch {
      /* offline: keep the last state */
    }
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
      `Locked at <b>$${fmtP(s.live.lock)}</b>${s.live.lock != null ? ` <a href="${s.live.verifyLock}" target="_blank" rel="noopener">verify</a>` : ''}` +
      ` · crowd ⬆${s.live.up} ⬇${s.live.down}` +
      (lm ? ` · you: <b class="${lm.dir}">${lm.dir === 'up' ? '⬆ UP' : '⬇ DOWN'}</b>` : '');
    // next round: the one you can pick
    const closes = s.next.closesAt - t;
    const nm = s.next.mine;
    $('pump-q').textContent = `${market} at ${hhmm(s.next.end)}: higher or lower than at ${hhmm(s.next.start)}?`;
    $('pump-closes').textContent = nm
      ? `You picked ${nm.dir === 'up' ? '⬆ UP' : '⬇ DOWN'}. It locks at ${hhmm(s.next.start)} and ends at ${hhmm(s.next.end)}.`
      : closes > 0
        ? `Picks close in ${fmtT(closes)} (30 s before the round starts) · crowd ⬆${s.next.up} ⬇${s.next.down}`
        : `Picks closed. The next round opens at ${hhmm(s.next.start)}.`;
    const can = !nm && closes > 0 && !busy;
    ($('btn-pump-up') as HTMLButtonElement).disabled = !can;
    ($('btn-pump-down') as HTMLButtonElement).disabled = !can;
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
    const rows = board === 'week' ? st.week_board : st.all_board;
    $('pump-board').innerHTML = rows.length
      ? rows.map((r, i) => `<li class="${r.you ? 'you' : ''}"><span>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span> ${esc(r.name)} <small>#${r.tag}</small><b>${r.pts}</b></li>`).join('')
      : '<li>Nobody on the board yet this week.</li>';
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
      h.toast(`${dir === 'up' ? '⬆ UP' : '⬇ DOWN'} locked in for ${market} ✦ good luck, ser`, 3000);
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
      board = b.dataset.b as 'week' | 'all';
      render();
    });

  // refresh: every 5 s while the sheet is open or you're at PumpHall; the board + timers tick every second
  let lastLoad = 0;
  function tick() {
    const active = open() || h.near();
    if (active && performance.now() - lastLoad > 5000) {
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
