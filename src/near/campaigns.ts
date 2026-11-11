// NEAR edition: Sponsored Drops on the client. An advertiser's airdrop as a game: every live campaign scatters its
// drops (sponsor emoji on a glowing disc) in one zone; tap one, walk up to it, and the server counts the pick. Collect
// `goal` of them and you earn a bound NEAR badge receipt plus the sponsor's own claim link or code.
// Shared model + socket shapes: src/campaigns.ts. Plan: Design 5 (client).
//
// Messages:  in  welcome{camps} · camps{list} · cpicked{c,d,ok,why?,got,goal,done?,serial?,claim?,login?}
//            out cpick{c,d} · cclaim{c}
// Local state (per visitor id, localStorage): which spots this player picked, progress, and earned badges (with the
// claim link or code, which only this player was sent), so a reload does not show picked drops again.
import * as THREE from 'three';
import { ZONES, dropsOf, isLive, type PublicCampaign } from '../campaigns';
import { GATHER, dist } from '../valley';

type XZ = { x: number; z: number };
type Msg = Record<string, unknown> & { t: string };

export interface DropsHost {
  scene: THREE.Scene;
  heightAt(x: number, z: number): number;
  /** register a clickable (index.ts tap(): userData.action = 'near', kind 'drop') */
  tap(o: THREE.Object3D, kind: string, id: string): void;
  untap(o: THREE.Object3D): void;
  me(): XZ;
  walkTo(p: XZ): void;
  send(m: Record<string, unknown>): void;
  toast(text: string, ms?: number): void;
  pid: string;
  loggedIn(): boolean;
  /** the login perks card */
  loginPerks(what: string, lead?: string): void;
  /** "Show me the way" to any point (quest.ts route walking) */
  guide(to: XZ): void;
  /** close the NEAR sheet */
  close(): void;
}

/** what we remember per campaign (per visitor id) */
interface Mine {
  /** drop indices this player picked */
  p: number[];
  got: number;
  goal: number;
  /** reached the goal as a guest: claim (cclaim) once logged in */
  claim?: boolean;
  /** completed: the badge and the reward, kept for the Rescue Book after the campaign ends */
  done?: { serial: number; at: number; badge: string; title: string; sponsor: string; emoji: string; color: string; url?: string; code?: string };
}

/** most drop sprites in the world at once, over all campaigns (phones) */
const MAX_DROPS = 80;
const REACH = GATHER.reach;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeUrl = (u: unknown) => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' ? x.toString() : '';
  } catch {
    return '';
  }
};
/** sponsor colour vars for a style attribute: the colour, and black or white text that reads on it */
const spVars = (hex: string) => {
  const n = parseInt(hex.slice(1), 16) || 0;
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return `--sp:${esc(hex)};--sp-ink:${lum > 0.55 ? '#111' : '#fff'}`;
};
const left = (ms: number) => {
  if (ms <= 0) return 'ended';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const hh = Math.floor(m / 60);
  return hh < 48 ? `${hh} h ${m % 60} min` : `${Math.floor(hh / 24)} d ${hh % 24} h`;
};

/** a soft glowing disc in the sponsor colour with the emoji on it (one texture per campaign, shared by its drops) */
function discTexture(emoji: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.55, `${color}cc`);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.fillStyle = '#fffbea';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = color;
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '52px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.fillText(emoji, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** "Sponsored by …" board on a post (canvas texture), edged in the sponsor colour */
function sponsorSign(c: PublicCampaign) {
  const g = new THREE.Group();
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#fffbea';
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = c.sponsor.color;
  x.lineWidth = 16;
  x.strokeRect(8, 8, 496, 240);
  x.fillStyle = '#222';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const fit = (s: string, size: number, weight: number, yy: number) => {
    x.font = `${weight} ${size}px system-ui, sans-serif`;
    while (x.measureText(s).width > 460 && size > 18) x.font = `${weight} ${(size -= 3)}px system-ui, sans-serif`;
    x.fillText(s, 256, yy);
  };
  fit('Sponsored by', 34, 500, 56);
  fit(`${c.sponsor.emoji} ${c.sponsor.name}`, 64, 800, 124);
  fit(`collect ${c.goal} ${c.drop.name}`, 34, 500, 196);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), new THREE.MeshStandardMaterial({ color: 0x6b5238, flatShading: true }));
  post.position.y = 1;
  g.add(board, post);
  return g;
}

interface Live {
  c: PublicCampaign;
  group: THREE.Group;
  tex: THREE.Texture;
  mat: THREE.SpriteMaterial;
  ring: THREE.MeshBasicMaterial;
  sprites: Map<number, THREE.Sprite>;
  /** sprites fading out after a pick: index → seconds into the fade */
  fading: Map<number, number>;
  /** a dev-injected campaign (kept when the server's list arrives) */
  dev?: boolean;
}

export function setupDrops(h: DropsHost) {
  const KEY = `qh.drops.v1:${h.pid}`;
  let mine: Record<string, Mine> = {};
  try {
    mine = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    mine = {};
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(mine));
    } catch {
      /* storage blocked: progress still comes from the server's replies */
    }
  };
  const live = new Map<string, Live>();
  /** server clock minus ours (from welcome.now) */
  let skew = 0;
  const now = () => Date.now() + skew;
  /** walking up to a drop: act on arrival */
  let pending: { c: string; d: number; at: XZ } | null = null;
  const root = new THREE.Group();
  root.name = 'sponsored-drops';
  h.scene.add(root);
  const ringGeo = new THREE.RingGeometry(0.42, 0.6, 20);
  ringGeo.rotateX(-Math.PI / 2);
  /** dev hook: what we sent */
  const sent: Record<string, unknown>[] = [];
  const send = (m: Record<string, unknown>) => {
    if (import.meta.env.DEV) sent.push(m);
    h.send(m);
  };

  const me = (cid: string, c?: PublicCampaign): Mine => (mine[cid] ??= { p: [], got: 0, goal: c?.goal ?? 0 });
  const picked = (cid: string, d: number) => !!mine[cid]?.p.includes(d) || !!mine[cid]?.done;

  function build(c: PublicCampaign, dev = false) {
    const group = new THREE.Group();
    group.name = `drop:${c.id}`;
    const tex = discTexture(c.drop.emoji, c.sponsor.color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const ring = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.sponsor.color), transparent: true, opacity: 0.55, depthWrite: false });
    const L: Live = { c, group, tex, mat, ring, sprites: new Map(), fading: new Map(), dev };
    let used = 0;
    for (const l of live.values()) used += l.sprites.size;
    dropsOf(c).forEach((p, i) => {
      if (picked(c.id, i) || used >= MAX_DROPS) return;
      used++;
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(1.3);
      const y = h.heightAt(p.x, p.z);
      s.position.set(p.x, y + 1.1, p.z);
      s.userData.base = y + 1.1;
      s.userData.phase = i * 1.7;
      // a slowly turning ring on the ground under it (also tappable: a bigger target for a thumb)
      const r = new THREE.Mesh(ringGeo, ring);
      r.position.set(p.x, y + 0.06, p.z);
      s.userData.ring = r;
      h.tap(s, 'drop', `${c.id}:${i}`);
      h.tap(r, 'drop', `${c.id}:${i}`);
      group.add(s, r);
      L.sprites.set(i, s);
    });
    // the sign: at the zone's edge on the side facing the courtyard (where most players come from)
    const z = ZONES[c.zone];
    const a = Math.atan2(14 - z.z, 0 - z.x);
    const sx = z.x + Math.cos(a) * z.r * 0.9;
    const sz = z.z + Math.sin(a) * z.r * 0.9;
    const sign = sponsorSign(c);
    sign.position.set(sx + 1.5, h.heightAt(sx + 1.5, sz), sz);
    sign.rotation.y = -a + Math.PI / 2;
    group.add(sign);
    root.add(group);
    live.set(c.id, L);
  }
  function drop(id: string) {
    const L = live.get(id);
    if (!L) return;
    for (const s of L.sprites.values()) (h.untap(s), h.untap(s.userData.ring));
    root.remove(L.group);
    L.group.traverse((o) => {
      // sprites share three's one sprite geometry and the campaign's material: only the sign's own parts go here
      if (!(o instanceof THREE.Mesh) || o.geometry === ringGeo) return;
      o.geometry.dispose();
      const mt = o.material as THREE.MeshBasicMaterial;
      if (mt !== L.ring) {
        mt.map?.dispose();
        mt.dispose();
      }
    });
    L.tex.dispose();
    L.mat.dispose();
    L.ring.dispose();
    live.delete(id);
    if (pending?.c === id) pending = null;
  }
  /** a new list from the server: add the new, remove the gone and the ended, keep the rest as built */
  function setList(list: PublicCampaign[]) {
    const keep = new Set(list.filter((c) => isLive(c, now())).map((c) => c.id));
    for (const [id, L] of live) if (!keep.has(id) && !(import.meta.env.DEV && L.dev)) drop(id);
    for (const c of list) {
      if (!keep.has(c.id)) continue;
      const L = live.get(c.id);
      if (L) L.c = c;
      else build(c);
    }
    changed();
  }

  /** fade a picked drop out (shrink and rise), then remove it */
  function fade(cid: string, d: number) {
    const L = live.get(cid);
    if (L?.sprites.has(d) && !L.fading.has(d)) {
      const s = L.sprites.get(d)!;
      h.untap(s);
      h.untap(s.userData.ring);
      L.fading.set(d, 0);
    }
  }

  // ---------- taps ----------
  /** a drop was tapped (id = '<campaign>:<index>'): walk up to it, then pick it */
  function tap(id: string) {
    const i = id.lastIndexOf(':');
    const cid = id.slice(0, i);
    const d = Number(id.slice(i + 1));
    const L = live.get(cid);
    if (!L) return;
    if (mine[cid]?.done) return h.toast(`✓ You already earned the ${L.c.reward.badge} badge`, 2500);
    const p = dropsOf(L.c)[d];
    if (!p) return;
    const at = h.me();
    if (dist(at, p) <= REACH) return pick(cid, d);
    const len = Math.max(0.001, dist(at, p));
    const k = Math.min(REACH - 0.6, 1.4) / len;
    pending = { c: cid, d, at: p };
    h.walkTo({ x: p.x + (at.x - p.x) * k, z: p.z + (at.z - p.z) * k });
  }
  function pick(cid: string, d: number) {
    if (picked(cid, d)) return;
    send({ t: 'cpick', c: cid, d });
  }

  // ---------- messages ----------
  function onMessage(m: Msg): boolean {
    switch (m.t) {
      case 'welcome':
        if (typeof m.now === 'number') skew = m.now - Date.now();
        if (Array.isArray(m.camps)) setList(m.camps as PublicCampaign[]);
        // the server's record of my progress (another device, cleared storage): picked spots and my own completion
        if (m.cmine && typeof m.cmine === 'object') {
          for (const [cid, v] of Object.entries(m.cmine as Record<string, { d?: number[]; serial?: number; badge?: string; claim?: { url?: string; code?: string } }>)) {
            const c = live.get(cid)?.c;
            const s = me(cid, c);
            for (const d of v.d ?? []) if (Number.isInteger(d) && !s.p.includes(d)) s.p.push(d);
            s.got = Math.max(s.got, s.p.length);
            if (v.serial && !s.done && c)
              s.done = { serial: v.serial, at: Date.now(), badge: v.badge ?? c.reward.badge, title: c.title, sponsor: c.sponsor.name, emoji: c.drop.emoji, color: c.sponsor.color, url: v.claim?.url, code: v.claim?.code };
            for (const d of s.p) fade(cid, d);
          }
          save();
          changed();
        }
        claimPending();
        return false; // main.ts handles welcome too
      case 'camps':
        setList((m.list as PublicCampaign[]) ?? []);
        return true;
      case 'cpicked':
        onPicked(m);
        return true;
    }
    return false;
  }
  function onPicked(m: Msg) {
    const cid = String(m.c);
    const L = live.get(cid);
    const c = L?.c;
    const s = me(cid, c);
    const d = Number(m.d);
    if (typeof m.got === 'number') s.got = m.got;
    if (typeof m.goal === 'number') s.goal = m.goal;
    if (!m.ok) {
      const why = String(m.why ?? '');
      if (/already|picked/i.test(why) && Number.isInteger(d) && d >= 0) {
        if (!s.p.includes(d)) s.p.push(d);
        fade(cid, d);
      }
      save();
      changed();
      if (m.login) return askLogin(cid);
      if (/too fast/i.test(why)) return;
      h.toast(/far/i.test(why) ? 'A little closer…' : /supply|gone|sold|been claimed/i.test(why) ? 'All the badges for this drop are taken 😢' : /end/i.test(why) ? 'This drop has ended.' : why || 'Not this time.', 2500);
      return;
    }
    if (Number.isInteger(d) && d >= 0 && !s.p.includes(d)) s.p.push(d);
    if (Number.isInteger(d) && d >= 0) fade(cid, d);
    const emoji = c?.drop.emoji ?? '🎁';
    const name = c?.drop.name ?? 'drops';
    if (m.done) {
      s.claim = false;
      s.done = {
        serial: Number(m.serial) || 0,
        at: Date.now(),
        badge: c?.reward.badge ?? 'Sponsor badge',
        title: c?.title ?? '',
        sponsor: c?.sponsor.name ?? '',
        emoji: c?.sponsor.emoji ?? emoji,
        color: c?.sponsor.color ?? '#00ec97',
        ...((m.claim as { url?: string })?.url ? { url: safeUrl((m.claim as { url?: string }).url) || undefined } : {}),
        ...((m.claim as { code?: string })?.code ? { code: String((m.claim as { code?: string }).code).slice(0, 64) } : {}),
      };
      save();
      // every drop of a finished campaign fades: nothing more to collect
      if (L) for (const i of L.sprites.keys()) fade(cid, i);
      changed();
      celebrate(cid);
      return;
    }
    save();
    changed();
    if (Number.isInteger(d) && d >= 0) h.toast(`${emoji} ${s.got}/${s.goal} ${name}`, 1800);
    // reached the goal as a guest: the badge needs a NEAR account
    if (m.login || (s.got >= s.goal && s.goal > 0 && !h.loggedIn())) askLogin(cid);
  }
  function askLogin(cid: string) {
    const s = me(cid, live.get(cid)?.c);
    s.claim = true;
    save();
    changed();
    const c = live.get(cid)?.c;
    h.loginPerks(
      'Log in with NEAR to claim your badge',
      `You collected ${s.got}/${s.goal}${c ? ` ${esc(c.drop.name)}` : ''}! ${c ? `The <b>${esc(c.reward.badge)}</b> badge` : 'Your badge'} is a NEAR receipt bound to your account${c?.reward.hasClaim ? `, and ${esc(c.sponsor.name)}'s reward comes with it` : ''}. Log in and it's yours:`,
    );
  }
  /** back from a login (or a new connection): claim what was collected as a guest */
  const claimSent = new Set<string>();
  function claimPending() {
    if (!h.loggedIn()) return;
    for (const [cid, s] of Object.entries(mine))
      if (s.claim && !s.done && !claimSent.has(cid)) {
        claimSent.add(cid);
        send({ t: 'cclaim', c: cid });
      }
  }

  // ---------- the completion card ----------
  function celebrate(cid: string) {
    const s = mine[cid];
    const d = s?.done;
    if (!d) return;
    document.getElementById('near-drop-win')?.remove();
    const el = document.createElement('div');
    el.id = 'near-drop-win';
    const bits = [d.emoji, live.get(cid)?.c.drop.emoji ?? '🎁', '✨', '🎉'];
    const confetti = Array.from({ length: 22 }, (_, i) => {
      const x = (i * 37) % 100;
      const delay = ((i * 53) % 60) / 100;
      const dur = 1.6 + ((i * 29) % 90) / 100;
      return `<i style="left:${x}%;animation-delay:${delay}s;animation-duration:${dur}s">${bits[i % bits.length]}</i>`;
    }).join('');
    const url = d.url ? safeUrl(d.url) : '';
    el.innerHTML = `<div class="pump-win-confetti">${confetti}</div>
      <div class="drop-win-card" style="${spVars(d.color)}">
        <div class="drop-win-badge">${esc(d.emoji)}</div>
        <div class="drop-win-kicker">Badge earned${d.serial ? ` · #${d.serial}` : ''}</div>
        <div class="drop-win-title">${esc(d.badge)}</div>
        <div class="drop-win-line">from <b>${esc(d.sponsor)}</b>${d.title ? ` · ${esc(d.title)}` : ''}</div>
        ${url ? `<a class="drop-win-claim" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Claim your reward ↗</a>` : ''}
        ${d.code ? `<div class="drop-win-code"><code>${esc(d.code)}</code><button type="button" data-copy>Copy</button></div>` : ''}
        <div class="drop-win-foot">NEAR receipt: <span class="near-dot">syncing</span> · see 📖 Badges</div>
        <div class="drop-win-close">tap anywhere to close</div>
      </div>`;
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('a')) return;
      if (t.closest('[data-copy]')) {
        void navigator.clipboard?.writeText(d.code ?? '').then(
          () => h.toast('Code copied ✓', 1500),
          () => h.toast(d.code ?? '', 4000),
        );
        return;
      }
      el.remove();
    });
    document.body.appendChild(el);
    navigator.vibrate?.([30, 120, 60]);
  }

  // ---------- quest sheet section, chip count, Rescue Book ----------
  let onChange: (() => void) | null = null;
  function changed() {
    onChange?.();
  }
  const list = () => [...live.values()].map((l) => l.c).filter((c) => isLive(c, now()));
  /** live campaigns this player has not finished yet */
  const open = () => list().filter((c) => !mine[c.id]?.done).length;
  /** a signature of what the quest sheet shows (re-render only when it changes) */
  const sig = () => JSON.stringify([list().map((c) => [c.id, c.completions, Math.floor((c.ends - now()) / 60000)]), mine, h.loggedIn()]);
  function sheet(): string {
    const cs = list();
    if (!cs.length) return '';
    return `<div class="q-drops"><div class="q-drops-h">🎁 Sponsored drops <span class="q-badge">live</span></div>
      ${cs
        .map((c) => {
          const s = mine[c.id];
          const got = Math.min(s?.got ?? 0, c.goal);
          const leftN = Math.max(0, c.supply - c.completions);
          const btn = s?.done
            ? `<button class="q-mini q-claimed" data-dshow="${esc(c.id)}">✓ Claimed</button>`
            : s?.claim || (got >= c.goal && !h.loggedIn())
              ? `<button class="q-mini" data-dclaim="${esc(c.id)}">${h.loggedIn() ? 'Claim badge' : 'Log in to claim'}</button>`
              : `<button class="q-mini" data-dgo="${esc(c.id)}">Show me the way</button>`;
          return `<div class="q-fren q-drop ${s?.done ? 'done' : ''}" style="${spVars(c.sponsor.color)}"><span class="q-face q-dface">${esc(c.drop.emoji)}</span><div class="q-fren-txt">
            <b>${esc(c.title)}</b><div class="small">by <b>${esc(c.sponsor.name)}</b> · ${esc(ZONES[c.zone].name)}</div>
            <div class="small">${esc(c.blurb)}</div>
            <div class="near-pbar q-dbar"><div style="width:${(got / Math.max(1, c.goal)) * 100}%"></div><span>${s?.done ? `✓ ${esc(c.reward.badge)} #${s.done.serial}` : `${got}/${c.goal} ${esc(c.drop.name)}`}</span></div>
            <div class="q-needs"><span class="q-need">⏳ ends in ${left(c.ends - now())}</span><span class="q-need">🏅 ${leftN} of ${c.supply} left</span>${c.reward.hasClaim ? '<span class="q-need have">+ sponsor reward</span>' : ''}</div>
            </div></div><div class="q-drop-act" style="${spVars(c.sponsor.color)}">${btn}</div>`;
        })
        .join('')}
      <p class="near-foot">Badges are NEAR receipts bound to you. Sponsors give their own rewards; we never hold tokens.</p></div>`;
  }
  function wire(el: HTMLElement) {
    el.querySelectorAll<HTMLElement>('[data-dgo]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = live.get(b.dataset.dgo!)?.c;
        if (!c) return;
        h.close();
        const z = ZONES[c.zone];
        h.toast(`Walking to ${z.name} for ${c.sponsor.name}'s ${c.drop.emoji} drops…`, 3500);
        h.guide({ x: z.x, z: z.z });
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-dclaim]').forEach((b) =>
      b.addEventListener('click', () => {
        const cid = b.dataset.dclaim!;
        if (!h.loggedIn()) return askLogin(cid);
        send({ t: 'cclaim', c: cid });
        h.toast('Claiming your badge…', 2000);
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-dshow]').forEach((b) => b.addEventListener('click', () => (h.close(), celebrate(b.dataset.dshow!))));
  }
  /** the Rescue Book's "Badges" section: what this player earned (local) + badge receipts from the server */
  function book(receipts: { job: string; status: string; tx: string | null }[], rec: (job: string) => string): string {
    const rows = new Map<string, string>();
    for (const [cid, s] of Object.entries(mine)) {
      if (!s.done) continue;
      const job = `badge-${cid}-${s.done.serial}`;
      rows.set(
        job,
        `<li class="have"><span class="q-dface" style="${spVars(s.done.color)}">${esc(s.done.emoji)}</span> <b>${esc(s.done.badge)}</b> #${s.done.serial} <span class="small">· ${esc(s.done.sponsor)}</span> ${rec(job) || '<span class="near-dot">syncing</span>'} <a href="#" class="q-link" data-dshow="${esc(cid)}">reward</a></li>`,
      );
    }
    for (const r of receipts) {
      if (!r.job.startsWith('badge-') || rows.has(r.job)) continue;
      const m = r.job.match(/^badge-(.+)-(\d+)$/);
      const c = m ? live.get(m[1])?.c : undefined;
      rows.set(r.job, `<li class="have">🏅 <b>${esc(c?.reward.badge ?? 'Sponsor badge')}</b> #${esc(m?.[2] ?? '')} ${c ? `<span class="small">· ${esc(c.sponsor.name)}</span>` : ''} ${rec(r.job)}</li>`);
    }
    if (!rows.size) return list().length ? `<div class="label">Badges</div><p class="small">No badges yet. A sponsored drop is live: tap 🎁 on the quest chip.</p>` : '';
    return `<div class="label">Badges</div><ul class="near-needs">${[...rows.values()].join('')}</ul>`;
  }

  // ---------- per frame ----------
  let t = 0;
  let tick = 0;
  function update(dt: number) {
    t += dt;
    for (const L of live.values()) {
      for (const [i, s] of L.sprites) {
        const f = L.fading.get(i);
        if (f !== undefined) {
          const k = f + dt;
          L.fading.set(i, k);
          s.scale.setScalar(1.3 * Math.max(0, 1 - k / 0.5) + 0.01);
          s.position.y = s.userData.base + k * 2;
          (s.userData.ring as THREE.Mesh).visible = false;
          if (k >= 0.5) {
            L.group.remove(s, s.userData.ring);
            L.sprites.delete(i);
            L.fading.delete(i);
          }
          continue;
        }
        s.position.y = s.userData.base + Math.sin(t * 2 + s.userData.phase) * 0.15;
        (s.userData.ring as THREE.Mesh).scale.setScalar(1 + 0.12 * Math.sin(t * 3 + s.userData.phase));
      }
    }
    if (pending && dist(h.me(), pending.at) <= REACH) {
      const p = pending;
      pending = null;
      pick(p.c, p.d);
    }
    // campaigns that ended while we watched
    if ((tick += dt) > 5) {
      tick = 0;
      for (const [id, L] of live) if (!isLive(L.c, now()) && !L.dev) drop(id);
      changed();
    }
  }

  const api = {
    onMessage,
    tap,
    update,
    sheet,
    wire,
    book,
    open,
    sig,
    /** the player just logged in (econ.near set): claim anything collected as a guest */
    loggedIn: claimPending,
    set onChange(f: (() => void) | null) {
      onChange = f;
    },
    show: celebrate,
  };
  if (import.meta.env.DEV) {
    // test hook: drops without the server. __drops.inject(sample()) · __drops.reply({t:'cpicked',…}) · __drops.sent
    (window as unknown as { __drops: unknown }).__drops = {
      inject(c: PublicCampaign) {
        if (live.has(c.id)) drop(c.id);
        build(c, true);
        changed();
        return c.id;
      },
      remove: (id: string) => (drop(id), changed()),
      reply: (m: Msg) => onMessage(m),
      sent,
      mine: () => mine,
      reset: () => ((mine = {}), save()),
      spots: (id: string) => {
        const L = live.get(id);
        return L ? [...L.sprites.entries()].map(([i, s]) => ({ i, x: s.position.x, y: s.position.y, z: s.position.z })) : [];
      },
      sample: (over: Partial<PublicCampaign> = {}): PublicCampaign => ({
        id: 'cmp-devbonk01',
        sponsor: { name: 'BONK', emoji: '🐕', color: '#ff9f1c' },
        title: 'Bonk meme hunt',
        blurb: 'Find 3 BONK memes in Meme Valley to earn the Bonk Hunter badge.',
        zone: 'valley',
        drop: { name: 'BONK memes', emoji: '🐕', count: 20 },
        goal: 3,
        reward: { badge: 'Bonk Hunter', hasClaim: true },
        supply: 500,
        completions: 88,
        starts: Date.now() - 60000,
        ends: Date.now() + 3 * 86400000,
        status: 'live',
        ...over,
      }),
    };
  }
  return api;
}
