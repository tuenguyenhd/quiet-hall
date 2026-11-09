// Chat: a small global chat box (bottom-left, can be hidden), whispers from the player menu, and speech
// bubbles over heads (like classic MMOs: tap a player → menu → Chat). Lines are cleaned again on the server
// (no links, no wallet addresses, swear words masked, slow mode).
import * as THREE from 'three';
import { CHAT_MAX, cleanChat } from './layout';

export interface ChatLine {
  id: string;
  n: string;
  x: string;
  w?: string; // whisper: the receiver's id
  wn?: string; // whisper: the receiver's name
  at?: number;
}

interface Host {
  camera: THREE.Camera;
  myId: () => string;
  myName: () => string;
  /** the avatar root of a player (for bubbles); undefined when not in view */
  rootOf: (id: string) => THREE.Object3D | undefined;
  send: (m: Record<string, unknown>) => void;
  online: () => boolean;
  store: { get(k: string): string | null; set(k: string, v: string): void };
  toast: (t: string, ms?: number) => void;
}

const $ = (id: string) => document.getElementById(id)!;
const MAX_LINES = 40;
const BUBBLE_MS = 6000;

export function setupChat(h: Host) {
  const box = $('chat');
  const log = $('chat-log');
  const input = $('chat-input') as HTMLInputElement;
  const toChip = $('chat-to');
  const toggle = $('btn-chat');
  const unread = $('chat-unread');
  input.maxLength = CHAT_MAX;
  let shown = h.store.get('chat') !== 'off';
  let whisperTo: { id: string; n: string } | null = null;
  let unseen = 0;
  const muted = new Set<string>();
  const bubbles = new Map<string, { el: HTMLElement; until: number }>();
  const tmp = new THREE.Vector3();

  function render() {
    box.classList.toggle('hidden', !shown);
    toggle.classList.toggle('off', !shown);
    toggle.title = shown ? 'Hide chat' : 'Show chat';
    unread.textContent = unseen ? String(Math.min(unseen, 99)) : '';
    unread.classList.toggle('hidden', !unseen || shown);
  }
  toggle.addEventListener('click', () => {
    shown = !shown;
    h.store.set('chat', shown ? 'on' : 'off');
    if (shown) unseen = 0;
    else {
      for (const b of bubbles.values()) b.el.remove();
      bubbles.clear();
    }
    render();
    h.toast(shown ? 'Chat on 💬' : 'Chat hidden. Tap 💬 to bring it back.', 2200);
  });

  function setWhisper(to: { id: string; n: string } | null) {
    whisperTo = to;
    toChip.textContent = to ? `→ ${to.n} ✕` : '';
    toChip.classList.toggle('hidden', !to);
    input.placeholder = to ? `Whisper to ${to.n}…` : 'Say gm…';
  }
  toChip.addEventListener('click', () => setWhisper(null));

  function submit() {
    const x = cleanChat(input.value);
    if (!x) return;
    if (!h.online()) return h.toast('Offline. Chat needs the hall connection.');
    if (x.startsWith('/name ')) {
      h.send({ t: 'name', name: x.slice(6) });
      h.store.set('name', x.slice(6, 22));
      input.value = '';
      return;
    }
    h.send({ t: 'chat', x, ...(whisperTo ? { to: whisperTo.id } : {}) });
    input.value = '';
  }
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  // keys typed into the chat must not walk / turn the camera
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') input.blur();
  });
  // desktop: Enter opens the chat (MMO habit)
  addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || document.activeElement === input || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (!shown) {
      shown = true;
      unseen = 0;
      render();
    }
    input.focus();
  });

  function addLine(c: ChatLine) {
    if (muted.has(c.id)) return;
    const mine = c.id === h.myId();
    const row = document.createElement('div');
    row.className = 'cl' + (c.w ? ' wh' : '') + (mine ? ' me' : '');
    const who = document.createElement('b');
    who.textContent = c.w ? (mine ? `→ ${c.wn}` : `${c.n} ⇢ you`) : c.n;
    if (!mine) {
      who.addEventListener('click', () => {
        setWhisper({ id: c.id, n: c.n });
        input.focus();
      });
    }
    row.append(who, document.createTextNode(' ' + c.x));
    log.appendChild(row);
    while (log.children.length > MAX_LINES) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
    if (!shown) {
      if (c.w && !mine) {
        unseen++;
        render();
      }
      return;
    }
    if (!c.w) bubble(c.id, c.x);
  }

  function bubble(id: string, x: string) {
    bubbles.get(id)?.el.remove();
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = x.length > 60 ? x.slice(0, 58) + '…' : x;
    document.body.appendChild(el);
    bubbles.set(id, { el, until: performance.now() + BUBBLE_MS });
  }

  return {
    get shown() {
      return shown;
    },
    onMessage(m: Record<string, unknown>) {
      if (m.t === 'welcome') {
        log.textContent = '';
        for (const c of (m.chat as ChatLine[]) ?? []) addLine(c);
        const tip = document.createElement('div');
        tip.className = 'cl sys';
        tip.textContent = `✦ You are ${h.myName()}. Type /name YourName to change it. Tap someone to whisper.`;
        log.appendChild(tip);
        log.scrollTop = log.scrollHeight;
        render();
      } else if (m.t === 'c') addLine(m as unknown as ChatLine);
      else if (m.t === 'chatNo') h.toast(String(m.reason), 2500);
    },
    /** from the player menu */
    whisper(id: string, n: string) {
      if (!shown) {
        shown = true;
        h.store.set('chat', 'on');
        render();
      }
      setWhisper({ id, n });
      input.focus();
    },
    isMuted: (id: string) => muted.has(id),
    mute(id: string, on: boolean) {
      if (on) muted.add(id);
      else muted.delete(id);
      if (on) {
        bubbles.get(id)?.el.remove();
        bubbles.delete(id);
      }
    },
    /** per frame: keep bubbles above heads */
    update() {
      if (!bubbles.size) return;
      const now = performance.now();
      for (const [id, b] of bubbles) {
        const root = h.rootOf(id);
        if (!root || now > b.until) {
          b.el.remove();
          bubbles.delete(id);
          continue;
        }
        tmp.copy(root.position);
        tmp.y += 2.3;
        tmp.project(h.camera);
        const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
        b.el.style.display = vis ? '' : 'none';
        if (vis) {
          b.el.style.transform = `translate(-50%, -100%) translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px)`;
          b.el.style.opacity = String(Math.min(1, (b.until - now) / 600));
        }
      }
    },
    render,
  };
}
