// Hall items UI: lanterns (shared, timed), stones + trees (scarce NFTs), badges (earned, 30 days).
import * as THREE from 'three';
import { apiGet } from './api';
import { haptic } from './audio';
import { BADGES, applyEvent, badge, daysLeft, isActive, type BadgeEvent, type BadgeStore } from './badges';
import { LINES, STONE_COUNT, TREE_COUNT, WISHES, cleanName } from './layout';
import { Lanterns, describe, type LanternData } from './lanterns';
import type { Msg } from './net';
import type { World } from './world';

const $ = (id: string) => document.getElementById(id)!;

interface SpotInfo {
  owner: string;
  name: string;
  line: string;
  asset: string | null;
}
interface SpotsResp {
  stone: Record<string, SpotInfo>;
  tree: Record<string, SpotInfo>;
  prices: Record<string, { SOL: number; USDC: number; SKR?: number }>;
  onSale: boolean;
  cluster: string;
}

export interface ItemsHooks {
  scene: THREE.Scene;
  world: World;
  send(m: Record<string, unknown>): void;
  toast(text: string, ms?: number): void;
  buy(
    item: { kind: string; currency?: Pay; spot?: number; name?: string; line?: string; pet?: number; pid?: string },
    say: (t: string, err?: boolean) => void,
  ): Promise<Record<string, unknown> | null>;
  store: { get(k: string): string | null; set(k: string, v: string): void };
  online(): boolean;
}

type Pay = 'SOL' | 'USDC' | 'SKR';
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function setupItems(h: ItemsHooks) {
  const lanterns = new Lanterns(h.scene);
  let spots: SpotsResp | null = null;
  // which currency paid items use (SOL / USDC / SKR when on); one choice shared by every sheet
  let pay: Pay = (['SOL', 'USDC', 'SKR'] as Pay[]).find((c) => c === h.store.get('pay')) ?? 'SOL';
  const fmt = (kind: string) => {
    const p = spots?.prices[kind];
    const v = p?.[pay];
    return v != null ? `${v} ${pay}` : '';
  };
  function renderPay() {
    const opts: Pay[] = spots?.prices.pet?.SKR != null ? ['SOL', 'USDC', 'SKR'] : ['SOL', 'USDC'];
    if (!opts.includes(pay)) pay = 'SOL';
    for (const box of document.querySelectorAll<HTMLElement>('.paywith')) {
      box.replaceChildren();
      for (const c of opts) {
        const b = document.createElement('button');
        b.textContent = c === 'SKR' ? 'SKR ✦' : c;
        b.classList.toggle('on', c === pay);
        b.addEventListener('click', () => {
          pay = c;
          h.store.set('pay', c);
          renderPay();
        });
        box.appendChild(b);
      }
    }
    for (const el of document.querySelectorAll<HTMLElement>('.price')) el.textContent = fmt(el.dataset.k!);
    if (current) $('spot-price').textContent = fmt(current.kind);
    for (const el of document.querySelectorAll('.skr-only')) el.classList.toggle('hidden', !opts.includes('SKR'));
    onPay?.();
  }
  let onPay: (() => void) | null = null;
  const buy: ItemsHooks['buy'] = (item, say) => h.buy({ currency: pay, ...item }, say);
  let wish = 0;
  let line = LINES[0];

  // ---------- badges ----------
  let badges: BadgeStore = {};
  try {
    badges = JSON.parse(h.store.get('badges') ?? '{}');
  } catch {
    badges = {};
  }
  const renderBadgeCount = () => ($('badge-count').textContent = String(BADGES.filter((b) => isActive(badges, b.id, Date.now())).length));
  function badgeEvent(e: BadgeEvent) {
    const fresh = applyEvent(badges, e, Date.now());
    h.store.set('badges', JSON.stringify(badges));
    renderBadgeCount();
    for (const id of fresh) {
      const b = badge(id)!;
      h.toast(`${b.icon} badge unlocked: ${b.name}. Shows beside your light for 30 days.`, 6000);
      haptic(30);
    }
    return fresh;
  }
  function renderBadges() {
    const grid = $('badge-grid');
    grid.replaceChildren();
    const now = Date.now();
    for (const b of BADGES) {
      const on = isActive(badges, b.id, now);
      const cell = document.createElement('div');
      cell.className = `badge-cell${on ? '' : ' off'}`;
      cell.innerHTML = `<span class="bi"></span><span class="bn"></span><small></small>`;
      cell.querySelector('.bi')!.textContent = b.icon;
      cell.querySelector('.bn')!.textContent = b.name;
      cell.querySelector('small')!.textContent = on ? `${daysLeft(badges, b.id, now)} days left` : b.hint;
      grid.appendChild(cell);
    }
  }
  $('btn-badges').addEventListener('click', () => {
    renderBadges();
    $('badgesheet').classList.remove('hidden');
  });
  renderBadgeCount();

  // ---------- lanterns ----------
  const wishes = $('wishes');
  WISHES.forEach((w, i) => {
    const b = document.createElement('button');
    b.textContent = w;
    b.classList.toggle('on', i === 0);
    b.addEventListener('click', () => {
      wish = i;
      for (const x of wishes.children) x.classList.toggle('on', x === b);
    });
    wishes.appendChild(b);
  });
  const lStatus = (t: string, err = false) => {
    $('lantern-status').textContent = t;
    $('lantern-status').classList.toggle('err', err);
  };
  $('btn-lantern').addEventListener('click', () => {
    lStatus('');
    $('lanternsheet').classList.remove('hidden');
  });
  $('btn-light').addEventListener('click', () => {
    if (!h.online()) return lStatus('Offline. Lanterns need the hall connection.', true);
    h.send({ t: 'lantern', wish, name: cleanName(($('lantern-name') as HTMLInputElement).value) });
    lStatus('Lighting…');
  });
  for (const b of document.querySelectorAll<HTMLElement>('#lanternsheet [data-tier]')) {
    b.addEventListener('click', async () => {
      const r = await buy({ kind: b.dataset.tier! }, lStatus);
      const order = r?.order as { id: string } | undefined;
      if (order) h.send({ t: 'lantern', wish, name: cleanName(($('lantern-name') as HTMLInputElement).value), order: order.id });
    });
  }

  // ---------- stones + trees ----------
  async function loadSpots() {
    try {
      spots = await apiGet<SpotsResp>('/api/spots');
    } catch {
      return;
    }
    for (const kind of ['stone', 'tree'] as const) {
      const m = new Map<number, { name: string; line: string }>();
      for (const [k, v] of Object.entries(spots[kind])) m.set(Number(k), { name: v.name, line: v.line });
      h.world.setOwned(kind, m);
    }
    // paid lanterns need the same on-chain setup as stones/trees
    document.querySelector('#lanternsheet .paid-row')?.classList.toggle('hidden', !spots.onSale);
    document.querySelector('#lanternsheet .paid-row')?.previousElementSibling?.classList.toggle('hidden', !spots.onSale);
    renderPay();
  }
  const lines = $('spot-lines');
  LINES.forEach((l, i) => {
    const b = document.createElement('button');
    b.textContent = l;
    b.classList.toggle('on', i === 0);
    b.addEventListener('click', () => {
      line = l;
      for (const x of lines.children) x.classList.toggle('on', x === b);
    });
    lines.appendChild(b);
  });
  let current: { kind: 'stone' | 'tree'; i: number } | null = null;
  const sStatus = (t: string, err = false) => {
    $('spot-status').textContent = t;
    $('spot-status').classList.toggle('err', err);
  };
  function openSpot(kind: 'stone' | 'tree', i: number) {
    if (i < 0) return;
    current = { kind, i };
    const label = kind === 'stone' ? 'Stone' : 'Tree';
    const total = kind === 'stone' ? STONE_COUNT : TREE_COUNT;
    const owned = spots?.[kind][String(i)];
    $('spot-kind').textContent = `${label} · ${kind === 'stone' ? 'Stone Garden' : 'Maple Grove'}`;
    $('spot-title').textContent = owned ? owned.name : `${label} #${i + 1}`;
    const taken = spots ? Object.keys(spots[kind]).length : 0;
    $('spot-desc').textContent = owned
      ? `“${owned.line}” · ${label} #${i + 1} · held by ${short(owned.owner)}${owned.asset ? ' · NFT ' + short(owned.asset) : ''}`
      : `Only ${total} ${kind}s exist; ${total - taken} are still free. Yours shows your name and a line to everyone in the hall, and comes as an NFT in your wallet.`;
    $('spot-buy').classList.toggle('hidden', !!owned);
    $('spot-price').textContent = fmt(kind);
    $('spot-note').textContent = spots?.onSale
      ? spots.cluster === 'mainnet'
        ? 'Resale on NFT marketplaces later. We never promise its value will rise.'
        : `Devnet test mode: uses test SOL. Resale later.`
      : 'Not on sale yet.';
    ($('btn-buy-spot') as HTMLButtonElement).disabled = !spots?.onSale;
    sStatus('');
    $('spotsheet').classList.remove('hidden');
  }
  $('btn-buy-spot').addEventListener('click', async () => {
    if (!current) return;
    const name = cleanName(($('spot-name') as HTMLInputElement).value);
    if (!name) return sStatus('Add a name first.', true);
    const r = await buy({ kind: current.kind, spot: current.i, name, line }, sStatus);
    if (r) {
      const sp = r.spot as { asset?: string; mintError?: string } | undefined;
      sStatus(sp?.asset ? `It's yours ✦ NFT ${short(sp.asset)} is in your wallet.` : `Paid. Minting is retrying (${sp?.mintError ?? 'pending'}).`, !sp?.asset);
      await loadSpots();
      h.send({ t: 'spots' });
      $('spot-buy').classList.add('hidden');
    }
  });
  loadSpots();

  return {
    lanterns,
    /** paid items (lanterns, blessings, stones, trees) are switched on */
    get onSale() {
      return !!spots?.onSale;
    },
    /** display price of a paid item, e.g. "0.015 SOL" ('' until loaded) */
    price: fmt,
    /** buy with the chosen currency */
    buy,
    /** called when the pay currency changes (to refresh labels elsewhere) */
    set onPayChange(f: () => void) {
      onPay = f;
    },
    badgeEvent,
    openSpot,
    onMessage(m: Msg) {
      if (m.t === 'welcome') lanterns.set((m.lanterns as LanternData[]) ?? []);
      else if (m.t === 'lantern') {
        lanterns.add(m.l as LanternData);
        if (!$('lanternsheet').classList.contains('hidden')) {
          $('lanternsheet').classList.add('hidden');
          h.toast('ser, your lantern is rising over the lake ✦', 4000);
        }
      } else if (m.t === 'lanternNo') lStatus(String(m.reason), true);
      else if (m.t === 'spots') loadSpots();
    },
    /** tap on a lantern → read its wish */
    tapLantern(d: LanternData) {
      h.toast(describe(d, Date.now()), 5000);
    },
    update(t: number) {
      lanterns.update(t, Date.now());
    },
  };
}
