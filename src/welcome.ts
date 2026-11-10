// The welcome card, short: sign in with a wallet (or Quick join as a guest), then one step: a name (an auto degen
// name you can keep) and Enter. The look (fren, light, pet) folds into one "Look: auto · change" line.
// Same flow as the NEAR edition's welcome card.
import { SOLANA_MARK } from './brand-marks';
import { degenName } from './names';
import type { Session } from './account';

interface WelcomeHooks {
  session(): Session | null;
  /** opens the wallet picker; true once signed in */
  signIn(): Promise<boolean>;
  signOut(): void;
  setNick(nick: string): void;
  store: { get(k: string): string | null; set(k: string, v: string): void };
  toast(text: string, ms?: number): void;
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const solMark = (size: number) =>
  `<svg width="${size}" height="${Math.round(size * 0.78)}" viewBox="0 0 397.7 311.7" aria-hidden="true">${SOLANA_MARK.map((d) => `<path fill="currentColor" d="${d}"/>`).join('')}</svg>`;

export function setupWelcome(h: WelcomeHooks) {
  const card = document.querySelector<HTMLElement>('#welcome .card')!;
  const lead = card.querySelector('.lead')!;
  const enterBtn = $('btn-enter');
  card.querySelector(':scope > p.small')?.remove(); // the long "No sign-up…" line

  // 1. sign in (guests) / signed-in line with Log out
  const box = document.createElement('div');
  box.id = 'login-box';
  box.innerHTML = `<button id="login-welcome" class="login-btn">${solMark(20)}<span>Sign in with wallet</span></button>
    <p class="small login-note">Seeker owners glow gold · keep your name on any phone · free, no funds move</p>
    <p id="login-done" class="login-done"></p>`;
  lead.after(box);
  $('login-welcome').addEventListener('click', async () => {
    if (await h.signIn()) ($('name-input') as HTMLInputElement | null)?.focus({ preventScroll: true });
  });

  // 2. the name step (signed in): an auto degen name, 🎲 for another, or their own
  let auto = h.store.get('autoname') ?? '';
  if (!auto) h.store.set('autoname', (auto = degenName()));
  const nameRow = document.createElement('div');
  nameRow.id = 'name-row';
  nameRow.innerHTML = `<label for="name-input">Your name</label>
    <div class="name-field"><input id="name-input" maxlength="24" autocomplete="off" spellcheck="false" value="${esc(auto)}" /><button id="name-dice" type="button" aria-label="Another name">🎲</button></div>
    <p class="small">Shown in the hall instead of your address. Keep it, or type your own.</p>`;
  enterBtn.before(nameRow);
  const input = $('name-input') as HTMLInputElement;
  $('name-dice').addEventListener('click', () => (input.value = degenName()));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && enterBtn.click());

  // 3. the look folds into one line ("auto" unless opened)
  const look = document.createElement('details');
  look.id = 'look';
  look.innerHTML = `<summary>Look: <b>auto</b> · <span class="look-change">change</span></summary>`;
  const from = card.querySelector(':scope > .label');
  if (from) {
    const moving: Element[] = [];
    for (let el: Element | null = from; el && el !== nameRow && el !== enterBtn; el = el.nextElementSibling) moving.push(el);
    look.append(...moving);
  }
  enterBtn.before(look);
  look.addEventListener('toggle', () => {
    look.querySelector('summary b')!.textContent = look.open ? 'pick below' : 'yours';
    look.querySelector('.look-change')!.textContent = look.open ? 'hide' : 'change';
  });

  // Enter = submit: save the name first (capture phase: before the game connects and says hello with it)
  $('welcome').addEventListener(
    'click',
    (e) => {
      const s = h.session();
      if (!s || !(e.target as Element).closest?.('#btn-enter')) return;
      const nm = input.value.replace(/\s+/g, ' ').trim() || auto;
      h.store.set('name', nm);
      void fetch('/api/name', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: s.token, name: nm }) })
        .then((r) => r.json())
        .then((r: { ok: boolean; name?: string; why?: string }) => {
          if (r.ok && r.name) h.setNick(r.name);
          else if (r.why) h.toast(r.why, 3500);
        })
        .catch(() => undefined);
    },
    true,
  );

  /** guest ↔ signed in: what the card shows */
  function render() {
    const s = h.session();
    document.body.classList.toggle('guest', !s);
    box.classList.toggle('logged', !!s);
    $('login-done').innerHTML = s
      ? `<span>${s.seeker ? '✦ Seeker' : 'Signed in'} · <b>${esc(short(s.address))}</b></span> <button id="logout-welcome" type="button">Log out</button>`
      : '';
    document.getElementById('logout-welcome')?.addEventListener('click', () => h.signOut());
    if (s?.nick && document.activeElement !== input) input.value = s.nick;
    enterBtn.textContent = s ? 'Enter the hall' : 'Quick join as guest →';
    enterBtn.classList.toggle('quick', !s);
    enterBtn.classList.toggle('primary', !!s);
  }
  render();
  return { onSession: render };
}
