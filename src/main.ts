import './style.css';
import * as THREE from 'three';
import { buildWorld, type Seat, type Theme } from './world';
import { setupAccount } from './account';
import { setupItems } from './items';
import type { LanternData } from './lanterns';
import { Avatar, lerpAngle, type SitState } from './avatar';
import { Controls } from './controls';
import { audio, haptic } from './audio';
import { Net, type Msg } from './net';
import { Meditation } from './meditation';
import { LIGHTS } from './palette';
import { LIGHT_COUNT, SPECIES } from './layout';
import { setupFrens } from './frens';
import { inviteUrl, makeCard, shareCard, shareInvite } from './share';
import { setupPwa } from './pwa';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
/** Group bell every N minutes (default 60, aligned to server clock). Use ?bell=2 to test. */
const BELL_MIN = Math.max(1, Number(params.get('bell')) || 60);

const store = {
  get(k: string) {
    try {
      return localStorage.getItem('qh.' + k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem('qh.' + k, v);
    } catch {
      /* private mode */
    }
  },
};

// Persistent anonymous visitor id: only used for "sit with me" links. Not an account.
let pid = store.get('pid') ?? '';
if (!/^[a-z0-9]{8,16}$/.test(pid)) {
  pid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  store.set('pid', pid);
}
const withPid = (params.get('with') ?? '').toLowerCase();
const invitedBy = /^[a-z0-9]{8,16}$/.test(withPid) && withPid !== pid ? withPid : '';
let friendGreeted = false;

// ---------- renderer ----------
const lowPower = params.has('low') || (navigator.hardwareConcurrency ?? 8) <= 4;
const canvas = $('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = !params.has('noshadow');
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
const world = buildWorld(scene, renderer.shadowMap.enabled, lowPower);
Avatar.heightAt = world.heightAt;

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 60 : 48;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- me ----------
let colorIdx = Number(store.get('color') ?? NaN);
if (!(Number.isInteger(colorIdx) && colorIdx >= 0 && colorIdx < LIGHT_COUNT * SPECIES.length)) {
  colorIdx = (1 + Math.floor(Math.random() * (SPECIES.length - 1))) * LIGHT_COUNT + Math.floor(Math.random() * LIGHT_COUNT);
}
let me = new Avatar(colorIdx, true);
const frens = setupFrens(scene, world.heightAt, world.clickables);
me.root.position.copy(world.spawn);
me.root.rotation.y = Math.PI;
scene.add(me.root);

const others = new Map<string, Avatar>();
const stats = { here: 1, sitting: 0, minutes: 0, world: 0, worldAt: 0 };
let entered = false;

// tap marker
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.36, 32),
  new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0, depthWrite: false }),
);
marker.rotation.x = -Math.PI / 2;
scene.add(marker);
let markerT = 1;

// ---------- UI helpers ----------
let toastTimer = 0;
function toast(text: string, ms = 3200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

function renderStats() {
  const p = $('presence');
  if (!net.online) {
    p.classList.remove('live');
    $('presence-text').textContent = 'Offline · solo sit ok';
    $('today').textContent = '';
    return;
  }
  p.classList.add('live');
  $('presence-text').textContent = `${stats.here} here · ${stats.sitting} sitting`;
  $('today').textContent =
    stats.minutes > 0 ? `${stats.minutes.toLocaleString()} minutes sat together today` : 'Be the first to sit today';
}

// ---------- network ----------
const net = new Net();
let clockOffset = 0;

type PubPlayer = { id: string; color: number; x: number; z: number; ry: number; s: SitState; g?: boolean; sp?: boolean };
function addOther(p: PubPlayer) {
  others.get(p.id)?.dispose();
  const a = new Avatar(p.color, false);
  a.root.position.set(p.x, world.heightAt(p.x, p.z), p.z);
  a.root.rotation.y = p.ry;
  a.target.set(p.x, 0, p.z);
  a.targetRy = p.ry;
  a.state = p.s;
  a.setBadges(!!p.g, !!p.sp);
  scene.add(a.root);
  others.set(p.id, a);
}

net.hello = () => ({
  color: colorIdx,
  x: me.root.position.x,
  z: me.root.position.z,
  ry: me.root.rotation.y,
  s: me.state,
  pid,
  session: acct?.session()?.token,
  // only ask to be placed next to the inviter on the first connection
  ...(invitedBy && !friendGreeted ? { with: invitedBy } : {}),
});
net.onStatus = () => renderStats();
net.onMessage = (m: Msg) => {
  items.onMessage(m);
  switch (m.t) {
    case 'welcome': {
      clockOffset = (m.now as number) - Date.now();
      for (const a of others.values()) a.dispose();
      others.clear();
      for (const p of m.players as PubPlayer[]) addOther(p);
      Object.assign(stats, m.stats);
      const mine = m.me as { g: boolean; sp: boolean } | undefined;
      myBadges = { g: !!mine?.g, sp: !!mine?.sp };
      me.setBadges(myBadges.g, myBadges.sp);
      setInvites(Number(m.invites) || 0, false);
      if (m.room === 'seeker') toast('Seeker hall ✦ only verified Seeker owners sit here.', 4000);
      renderStats();
      break;
    }
    case 'join':
      addOther(m.p as PubPlayer);
      break;
    case 'p': {
      const a = others.get(m.id as string);
      if (a) a.setBadges(!!m.g, !!m.sp);
      break;
    }
    case 'denied':
      toast(String(m.reason ?? 'Not allowed here.'), 5000);
      net.setRoom('main');
      break;
    case 'leave':
      others.get(m.id as string)?.dispose();
      others.delete(m.id as string);
      break;
    case 'm': {
      const a = others.get(m.id as string);
      if (a) {
        a.target.set(m.x as number, 0, m.z as number);
        a.targetRy = m.ry as number;
      }
      break;
    }
    case 's': {
      const a = others.get(m.id as string);
      if (a) a.state = m.s as SitState;
      break;
    }
    case 'e': {
      const a = others.get(m.id as string);
      if (a) m.e === 'bow' ? a.bow() : a.greet();
      break;
    }
    case 'ring': {
      const a = others.get(m.id as string);
      const from = a ? a.root.position : world.bellPos;
      const d = from.distanceTo(me.root.position);
      const vol = Math.max(0.25, 1 - d / 45);
      if (m.what === 'bowl') audio.bowl(vol * 0.8);
      else {
        audio.bell(vol);
        world.swingBell();
      }
      break;
    }
    case 'stats':
      Object.assign(stats, m);
      renderStats();
      break;
    case 'friendHere': {
      friendGreeted = true;
      const a = others.get(m.id as string);
      a?.setFriend(true);
      // appear right next to the friend who invited you
      const x = (m.x as number) + 1.3;
      const z = (m.z as number) + 0.6;
      me.root.position.set(x, world.heightAt(x, z), z);
      moveTarget = null;
      camInit = false;
      toast('You are next to the friend who invited you ✧', 5000);
      break;
    }
    case 'friendAway':
      friendGreeted = true;
      toast('Your friend is not in the hall right now. Feel free to sit; they will see you when they come.', 6000);
      break;
    case 'friend': {
      const a = others.get(m.id as string);
      a?.setFriend(true);
      a?.greet();
      haptic(30);
      if (!setInvites(Number(m.invites) || 0, true)) toast('A friend just arrived from your link ✧', 5000);
      break;
    }
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') net.wake();
});

// ---------- actions ----------
let moveTarget: THREE.Vector3 | null = null;
let pending: { kind: 'sit' | 'bell' | 'bowl'; seat?: Seat } | null = null;
/** the seat you are sitting on (for place badges); null = sitting on the ground */
let currentSeat: Seat | null = null;
let lastRing = 0;

function ringBell() {
  const now = Date.now();
  if (now - lastRing < 5000) return;
  lastRing = now;
  audio.bell(1);
  world.swingBell();
  haptic(25);
  net.send({ t: 'ring', what: 'bell' });
  const interval = BELL_MIN * 60000;
  items.badgeEvent({ type: 'bell', msSinceGroupBell: (Date.now() + clockOffset) % interval });
}
function strikeBowl() {
  const now = Date.now();
  if (now - lastRing < 5000) {
    audio.bowl(0.8);
    return;
  }
  lastRing = now;
  audio.bowl(1);
  haptic(15);
  net.send({ t: 'ring', what: 'bowl' });
}

function walkTo(p: THREE.Vector3) {
  moveTarget = new THREE.Vector3(p.x, 0, p.z);
  marker.position.set(p.x, world.heightAt(p.x, p.z) + 0.04, p.z);
  markerT = 0;
}

function arrive() {
  const p = pending;
  pending = null;
  if (!p) return;
  if (p.kind === 'sit') {
    if (p.seat) {
      me.root.position.set(p.seat.pos.x, p.seat.pos.y, p.seat.pos.z);
      me.root.rotation.y = p.seat.ry;
      currentSeat = p.seat;
    }
    med.openSheet();
  } else if (p.kind === 'bell') ringBell();
  else strikeBowl();
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const controls = new Controls(canvas);
controls.onTap = (x, y) => {
  if (!entered || med.active) return;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const lh = ray.intersectObjects(items.lanterns.objects, true)[0];
  if (lh) {
    let o: THREE.Object3D | null = lh.object;
    while (o && !o.userData.lantern) o = o.parent;
    if (o) return items.tapLantern(o.userData.lantern as LanternData);
  }
  const hit = ray.intersectObjects(world.clickables, true)[0];
  if (hit) {
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.action) o = o.parent;
    if (o) {
      const action = o.userData.action as string;
      const here = me.root.position;
      if (action === 'seat') {
        const seat = o.userData.seat as Seat;
        pending = { kind: 'sit', seat };
        walkTo(seat.pos);
        return;
      }
      if (action === 'npc') {
        frens.tap(o);
        haptic(15);
        return;
      }
      if (action === 'spot') {
        onSpotTap(o.userData.kind as 'stone' | 'tree', hit.instanceId ?? -1);
        return;
      }
      const at = action === 'bell' ? world.bellPos : world.bowlPos;
      const reach = action === 'bell' ? 4 : 2.2;
      if (Math.hypot(here.x - at.x, here.z - at.z) <= reach + 0.6) {
        action === 'bell' ? ringBell() : strikeBowl();
      } else {
        // walk up to it first, then ring
        const dir = new THREE.Vector3(here.x - at.x, 0, here.z - at.z).normalize().multiplyScalar(reach);
        pending = { kind: action === 'bell' ? 'bell' : 'bowl' };
        walkTo(at.clone().add(dir));
      }
      return;
    }
  }
  const g = ray.intersectObjects(world.ground, false)[0];
  if (g) {
    pending = null;
    walkTo(g.point);
  }
};

$('btn-bow').addEventListener('click', () => {
  me.bow();
  haptic(10);
  net.send({ t: 'emote', e: 'bow' });
});
$('btn-greet').addEventListener('click', () => {
  me.greet();
  haptic(10);
  net.send({ t: 'emote', e: 'greet' });
});
$('btn-sit').addEventListener('click', () => med.openSheet());

async function invite() {
  const msg = await shareInvite(inviteUrl(pid));
  if (msg) toast(msg);
}
$('btn-invite').addEventListener('click', invite);
$('btn-invite2').addEventListener('click', invite);

let lastSit = { seconds: 0, others: 0 };
function snapshot(): HTMLCanvasElement | null {
  try {
    renderer.render(scene, camera); // read back in the same task, before the buffer is cleared
    const c = document.createElement('canvas');
    c.width = renderer.domElement.width;
    c.height = renderer.domElement.height;
    c.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    return c;
  } catch {
    return null;
  }
}
$('btn-share').addEventListener('click', async () => {
  const link = inviteUrl(pid);
  const blob = await makeCard({ ...lastSit, scene: snapshot(), link });
  const mins = Math.max(1, Math.round(lastSit.seconds / 60));
  const msg = await shareCard(blob, link, `I sat ${mins} min in the Quiet Hall. Sit with me:`);
  if (msg) toast(msg);
});

setupPwa($('btn-install'), () => toast('Installed. Quiet Hall now opens from your home screen, even offline.'));
$('btn-sound').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  $('btn-sound').classList.toggle('muted', audio.muted);
  store.set('muted', audio.muted ? '1' : '0');
});

const med = new Meditation({
  onSit() {
    sitInWorld = worldLive;
    moveTarget = null;
    pending = null;
    me.state = 'sit';
    net.send({ t: 'state', s: 'sit' });
    $('actions').classList.add('hidden');
    $('hud').classList.add('hidden');
  },
  onStand(seconds) {
    lastSit = { seconds, others: Math.max(0, (net.online ? stats.here : 1) - 1) };
    const streak = seconds >= 60 ? recordDay() : currentStreak();
    const place = currentSeat?.place ?? world.placeAt(me.root.position.x, me.root.position.z)?.id ?? null;
    items.badgeEvent({ type: 'sit', place, seconds, worldSit: sitInWorld, seeker: myBadges.g });
    items.badgeEvent({ type: 'streak', days: streak });
    currentSeat = null;
    const el = $('sum-streak');
    el.textContent = streak >= 2 ? `${streak} days in a row ✧` : streak === 1 && seconds >= 60 ? 'Day 1. Come back tomorrow to start a streak.' : '';
    el.classList.toggle('hidden', !el.textContent);
    me.state = 'idle';
    net.send({ t: 'state', s: 'idle' });
    $('actions').classList.remove('hidden');
    $('hud').classList.remove('hidden');
  },
  others: () => Math.max(0, (net.online ? stats.here : 1) - 1),
});

// ---------- theme, invites, wallet ----------
let myBadges = { g: false, sp: false };
let theme: Theme = 'day';
let invites = 0;
let nightUnlocked = store.get('night') === '1';
function setTheme(t: Theme) {
  theme = t;
  world.setTheme(t);
  store.set('theme', t);
}
if (params.get('theme') === 'night' || (nightUnlocked && store.get('theme') === 'night')) setTheme('night');

/** Returns true if this call just unlocked the Night hall (and showed a toast). */
function setInvites(n: number, live: boolean) {
  invites = Math.max(invites, n);
  if (invites >= 3) items.badgeEvent({ type: 'invites', n: invites });
  if (invites >= 3 && !nightUnlocked) {
    nightUnlocked = true;
    store.set('night', '1');
    if (live) {
      setTheme('night');
      toast('3 friends joined from your link ✧ The Night hall is unlocked. Switch any time in your profile.', 7000);
      return true;
    }
  }
  return false;
}

const acct = setupAccount({
  toast,
  onSession(s) {
    myBadges = { g: !!s?.seeker, sp: !!s?.supporter };
    me.setBadges(myBadges.g, myBadges.sp);
    if (s) net.send({ t: 'profile', session: s.token });
  },
  invites: () => invites,
  nightUnlocked: () => nightUnlocked,
  theme: () => theme,
  setTheme,
  room: () => net.room,
  setRoom: (r) => net.setRoom(r),
});

const items = setupItems({ scene, world, send: (m) => net.send(m), toast, buy: acct.buy, store });
let sitInWorld = false;

// ---------- welcome ----------
const colorsEl = $('colors');
const speciesEl = $('species');
function rebuildMe() {
  const pos = me.root.position.clone();
  const ry = me.root.rotation.y;
  me.dispose();
  me = new Avatar(colorIdx, true);
  me.setBadges(myBadges.g, myBadges.sp);
  me.root.position.copy(pos);
  me.root.rotation.y = ry;
  scene.add(me.root);
}
SPECIES.forEach((sp, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span></span><small></small>`;
  b.querySelector('span')!.textContent = sp.emoji;
  b.querySelector('small')!.textContent = sp.name;
  b.classList.toggle('on', i === Math.floor(colorIdx / LIGHT_COUNT));
  b.addEventListener('click', () => {
    colorIdx = i * LIGHT_COUNT + (colorIdx % LIGHT_COUNT);
    for (const x of speciesEl.children) x.classList.toggle('on', x === b);
    rebuildMe();
  });
  speciesEl.appendChild(b);
});
LIGHTS.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = c;
  b.setAttribute('aria-label', `Light ${i + 1}`);
  b.classList.toggle('on', i === colorIdx % LIGHT_COUNT);
  b.addEventListener('click', () => {
    colorIdx = Math.floor(colorIdx / LIGHT_COUNT) * LIGHT_COUNT + i;
    for (const x of colorsEl.children) x.classList.toggle('on', x === b);
    rebuildMe();
  });
  colorsEl.appendChild(b);
});

$('btn-enter').addEventListener('click', () => {
  audio.unlock();
  if (store.get('muted') === '1') {
    audio.setMuted(true);
    $('btn-sound').classList.add('muted');
  }
  audio.ambience(true);
  store.set('color', String(colorIdx));
  entered = true;
  $('welcome').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('actions').classList.remove('hidden');
  if (!store.get('hinted')) {
    $('hint').classList.remove('hidden');
    setTimeout(() => $('hint').classList.add('hidden'), 7000);
    store.set('hinted', '1');
  }
  net.connect();
  renderStats();
});

// ---------- group bell ----------
let lastBellSlot = -1;
let lastBellText = '';
function bellTick() {
  const now = Date.now() + clockOffset;
  const interval = BELL_MIN * 60000;
  const slot = Math.floor(now / interval);
  if (lastBellSlot === -1) lastBellSlot = slot;
  if (slot !== lastBellSlot) {
    lastBellSlot = slot;
    if (entered) {
      audio.bell(0.9);
      world.swingBell();
      if (!med.active) toast('The group bell rings. Everyone here sits together now.', 6000);
    }
  }
  const left = Math.ceil(((slot + 1) * interval - now) / 1000);
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (text !== lastBellText) {
    lastBellText = text;
    $('bell-count').textContent = text;
  }
}

// ---------- streaks (kept on this device, works offline) ----------
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function sitDays(): string[] {
  try {
    return JSON.parse(store.get('days') ?? '[]');
  } catch {
    return [];
  }
}
function currentStreak() {
  const days = new Set(sitDays());
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet: count from yesterday
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function recordDay() {
  const days = sitDays();
  const k = dayKey(new Date());
  if (!days.includes(k)) days.push(k);
  store.set('days', JSON.stringify(days.slice(-400)));
  return currentStreak();
}

// ---------- World Sit: once a day, everyone sits together for 10 minutes ----------
const WORLD_WINDOW = 20 * 60000;
const worldOverride = /^(\d{1,2}):(\d{2})$/.exec(params.get('world') ?? ''); // ?world=HH:MM (UTC) to test
function worldStart(now: number) {
  if (stats.worldAt && !worldOverride) return stats.worldAt; // server is the source of truth
  const d = new Date(now);
  const h = worldOverride ? Number(worldOverride[1]) : 20;
  const mi = worldOverride ? Number(worldOverride[2]) : 0;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, mi);
}
let worldLive = false;
let worldText = '';
function worldTick() {
  const now = Date.now() + clockOffset;
  let at = worldStart(now);
  const live = now >= at && now < at + WORLD_WINDOW;
  if (!live && now >= at + WORLD_WINDOW) at += 86400000;
  if (live && !worldLive && entered) {
    audio.bell(1);
    world.swingBell();
    if (!med.active) toast('World Sit is starting. Everyone in the hall sits together for 10 minutes.', 7000);
  }
  worldLive = live;
  let text: string;
  if (live) text = '🌍 World Sit · join';
  else {
    const left = Math.max(0, at - now);
    const h = Math.floor(left / 3600000);
    const mi = Math.ceil((left % 3600000) / 60000);
    text = `🌍 ${h > 0 ? `${h}h ${mi}m` : `${mi}m`}`;
    if (stats.world > 0 && h >= 20) text = `🌍 ${stats.world} sat today`;
  }
  if (text !== worldText) {
    worldText = text;
    const el = $('world');
    el.textContent = text;
    el.classList.toggle('live', live);
  }
}
$('world').addEventListener('click', () => {
  if (worldLive) return med.openSheet(10);
  const at = new Date(worldStart(Date.now() + clockOffset));
  const local = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  toast(`Every day at ${local} your time, people all over the world sit together for 10 minutes.`, 6000);
});

// ---------- where am I ----------
const onSpotTap = (kind: 'stone' | 'tree', i: number) => items.openSpot(kind, i);
let lastPlace = '';
const seenPlaces = new Set<string>(JSON.parse(store.get('places') ?? '[]'));
function placeTick() {
  const p = world.placeAt(me.root.position.x, me.root.position.z);
  const id = p?.id ?? '';
  if (id === lastPlace) return;
  lastPlace = id;
  const el = $('place');
  el.textContent = p ? p.name : '';
  el.classList.toggle('hidden', !p);
  if (p && entered && !seenPlaces.has(p.id)) {
    seenPlaces.add(p.id);
    store.set('places', JSON.stringify([...seenPlaces]));
    toast(`${p.name}: ${p.hint}`, 5000);
  }
}
// ?at=lake|garden|grove|tea|lookout|hall : start at a place (used by screenshot loops)
{
  const at = world.places.find((p) => p.id === params.get('at'));
  if (at) {
    const [vx, vz] = at.view;
    const [lx, lz] = at.look;
    me.root.position.set(vx, world.heightAt(vx, vz), vz);
    controls.yaw = Math.atan2(vx - lx, vz - lz);
    me.root.rotation.y = controls.yaw + Math.PI;
  }
  if (params.has('fren')) {
    const v = frens.meet(Number(params.get('fren')) || 0);
    me.root.position.set(v.x, world.heightAt(v.x, v.z), v.z);
    controls.yaw = Math.atan2(v.x - v.lx, v.z - v.lz);
    me.root.rotation.y = controls.yaw + Math.PI;
  }
}

// ---------- movement ----------
const SPEED = 3.2;
const dir = new THREE.Vector2();
function stepMe(dt: number) {
  if (me.state === 'sit') {
    me.moving = false;
    return;
  }
  const p = me.root.position;
  let moving = false;
  if (entered && controls.keyVector(dir, dt)) {
    moveTarget = null;
    pending = null;
    moving = true;
  } else if (moveTarget) {
    dir.set(moveTarget.x - p.x, moveTarget.z - p.z);
    const len = dir.length();
    if (len < 0.12) {
      moveTarget = null;
      arrive();
    } else {
      dir.divideScalar(len);
      moving = true;
    }
  }
  me.moving = moving;
  if (!moving) return;
  const before = moveTarget ? Math.hypot(moveTarget.x - p.x, moveTarget.z - p.z) : Infinity;
  const step = Math.min(SPEED * dt, before);
  const ox = p.x;
  const oz = p.z;
  p.x += dir.x * step;
  p.z += dir.y * step;
  // water, raked sand: slide along the edge instead of walking in
  if (!world.walkable(p.x, p.z)) {
    if (world.walkable(ox + dir.x * step, oz)) p.z = oz;
    else if (world.walkable(ox, oz + dir.y * step)) p.x = ox;
    else {
      p.x = ox;
      p.z = oz;
    }
  }
  // collisions
  for (const o of world.obstacles) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const min = o.r + 0.32;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = o.x + (dx / d) * min;
      p.z = o.z + (dz / d) * min;
    }
  }
  const r = Math.hypot(p.x, p.z);
  if (r > world.bounds) {
    p.x *= world.bounds / r;
    p.z *= world.bounds / r;
  }
  // stuck on an obstacle while walking to a target? give up gracefully
  if (moveTarget) {
    const after = Math.hypot(moveTarget.x - p.x, moveTarget.z - p.z);
    stuck = after > before - step * 0.25 ? stuck + dt : 0;
    if (stuck > 0.6) {
      moveTarget = null;
      stuck = 0;
      if (pending && after < 2) arrive();
      else pending = null;
    }
  }
  me.root.rotation.y = lerpAngle(me.root.rotation.y, Math.atan2(dir.x, dir.y), 1 - Math.exp(-dt * 12));
}
let stuck = 0;

let lastSent = 0;
let sentX = 0;
let sentZ = 0;
let sentRy = 0;
function netTick(now: number) {
  if (!net.online || now - lastSent < 120) return;
  const p = me.root.position;
  const ry = me.root.rotation.y;
  if (Math.abs(p.x - sentX) + Math.abs(p.z - sentZ) < 0.02 && Math.abs(ry - sentRy) < 0.05) return;
  lastSent = now;
  sentX = p.x;
  sentZ = p.z;
  sentRy = ry;
  net.send({ t: 'move', x: p.x, z: p.z, ry });
}

// ---------- camera ----------
const camLook = new THREE.Vector3();
const camWant = new THREE.Vector3();
let camInit = false;
function updateCamera(dt: number) {
  const p = me.root.position;
  let zoom = controls.zoom;
  if (me.state === 'sit') {
    controls.yaw += dt * 0.05; // slow orbit while settling into a sit
    zoom = Math.min(zoom, 6);
  }
  const yaw = controls.yaw;
  const pitch = controls.pitch;
  // keep trunks, posts and walls from hiding you: pull the camera in front of the nearest one
  const sx = Math.sin(yaw);
  const sz = Math.cos(yaw);
  let hd = zoom * Math.cos(pitch);
  for (const o of world.obstacles) {
    const ox = o.x - p.x;
    const oz = o.z - p.z;
    const along = ox * sx + oz * sz;
    if (o.r < 0.5 || along < 0.5 || along > hd) continue; // thin trunks don't hide you; walls and pillars do
    if (Math.abs(ox * sz - oz * sx) < o.r + 0.3) hd = Math.max(3, along - o.r - 0.4);
  }
  zoom = Math.min(zoom, hd / Math.cos(pitch));
  camWant.set(
    p.x + Math.sin(yaw) * zoom * Math.cos(pitch),
    p.y + 1.0 + zoom * Math.sin(pitch),
    p.z + Math.cos(yaw) * zoom * Math.cos(pitch),
  );
  const look = new THREE.Vector3(p.x, p.y + 1.0, p.z);
  if (!camInit) {
    camera.position.copy(camWant);
    camLook.copy(look);
    camInit = true;
  }
  camera.position.lerp(camWant, 1 - Math.exp(-dt * 6));
  camLook.lerp(look, 1 - Math.exp(-dt * 9));
  camera.lookAt(camLook);
}

// ---------- loop ----------
let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  stepMe(dt);
  me.update(dt, t);
  for (const a of others.values()) a.update(dt, t);
  world.update(t, dt, me.root.position);
  frens.update(t, dt, me.root.position);
  placeTick();
  items.update(t);
  if (markerT < 1) {
    markerT = Math.min(1, markerT + dt * 1.4);
    (marker.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - markerT);
    marker.scale.setScalar(1 + markerT * 0.6);
  }
  med.update();
  updateCamera(dt);
  netTick(now);
  bellTick();
  worldTick();
  // while the meditation overlay fully covers the screen, skip 3D rendering to save battery
  if (!med.covered) renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// dev-only: skip the welcome card for automated screenshots (?autoenter)
if (import.meta.env.DEV && params.has('autoenter')) $('btn-enter').click();

// tiny debug hook for automated checks
(window as unknown as { __qh: unknown }).__qh = { others, stats, net, me: () => me, renderer };
