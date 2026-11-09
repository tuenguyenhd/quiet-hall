import { audio, haptic } from './audio';

export interface MedHooks {
  onSit(): void;
  onStand(seconds: number): void;
  others(): number; // other people in the hall right now
  toast?(text: string): void;
}

const $ = (id: string) => document.getElementById(id)!;
const fmt = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Sit flow: choose length -> screen dims to a breathing circle (3D paused) -> summary. */
export class Meditation {
  active = false;
  /** true once the dim overlay fully covers the scene, so main stops rendering 3D */
  covered = false;

  private minutes = 5;
  private guide = true;
  private startAt = 0;
  private coverTimer = 0;
  private tick = 0;
  private wake: { release(): Promise<void> } | null = null;

  constructor(private hooks: MedHooks) {
    $('durations').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      this.minutes = Number(b.dataset.min);
      for (const x of $('durations').querySelectorAll('button')) x.classList.toggle('on', x === b);
    });
    $('btn-start').addEventListener('click', () => this.start());
    $('btn-cancel').addEventListener('click', () => $('sheet').classList.add('hidden'));
    $('btn-end').addEventListener('click', () => this.finish(false));
    $('btn-strike').addEventListener('click', () => {
      audio.bowl(0.8);
      haptic(15);
    });
    $('btn-back').addEventListener('click', () => $('summary').classList.add('hidden'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.active) void this.lock();
    });
  }

  openSheet(minutes?: number) {
    if (this.active) return;
    if (minutes !== undefined) {
      this.minutes = minutes;
      for (const x of $('durations').querySelectorAll('button')) x.classList.toggle('on', Number((x as HTMLElement).dataset.min) === minutes);
    }
    $('sheet').classList.remove('hidden');
  }

  private async lock() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
      this.wake = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wake = null; // needs https or localhost; fine without
    }
  }

  start() {
    this.guide = (document.getElementById('opt-guide') as HTMLInputElement).checked;
    $('sheet').classList.add('hidden');
    this.active = true;
    this.startAt = Date.now();
    this.hooks.onSit();
    audio.bowl(1);
    haptic(20);
    const med = $('med');
    med.classList.remove('hidden');
    med.classList.toggle('noguide', !this.guide);
    requestAnimationFrame(() => med.classList.add('show'));
    this.coverTimer = window.setTimeout(() => (this.covered = this.active), 2600);
    // timer keeps going even if animation frames pause (screen dim / background)
    this.tick = window.setInterval(() => this.update(), 500);
    void this.lock();
    this.update();
  }

  /** Called every frame by main, plus every 500 ms by the interval. */
  update() {
    if (!this.active) return;
    const el = (Date.now() - this.startAt) / 1000;
    const total = this.minutes * 60;
    if (total > 0 && el >= total) {
      this.finish(true);
      return;
    }
    $('med-time').textContent = total > 0 ? fmt(total - el) : fmt(el);
    const n = this.hooks.others();
    $('med-with').textContent = n > 0 ? `Sitting with ${n} ${n === 1 ? 'other' : 'others'}` : 'Sitting quietly';

    // breathing: 4 s in, 6 s out
    const ph = el % 10;
    const ease = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;
    const k = ph < 4 ? ease(ph / 4) : 1 - ease((ph - 4) / 6);
    ($('breath-circle') as HTMLElement).style.transform = `scale(${0.62 + 0.38 * k})`;
    $('breath-label').textContent = this.guide ? (ph < 4 ? 'Breathe in' : 'Breathe out') : '';
  }

  private finish(completed: boolean) {
    if (!this.active) return;
    const seconds = (Date.now() - this.startAt) / 1000;
    this.active = false;
    this.covered = false;
    clearTimeout(this.coverTimer);
    clearInterval(this.tick);
    void this.wake?.release().catch(() => {});
    this.wake = null;
    const med = $('med');
    med.classList.remove('show');
    med.classList.add('hidden');
    this.hooks.onStand(seconds);

    if (completed) {
      // three soft strikes to close the sit
      audio.bowl(0.9);
      setTimeout(() => audio.bowl(0.7), 1700);
      setTimeout(() => audio.bowl(0.5), 3400);
      haptic(30);
    }
    if (seconds < 20) {
      this.hooks.toast?.('Sits under 20 s aren\'t counted. Try a few breaths longer 🙏');
    } else {
      const n = this.hooks.others();
      $('sum-time').textContent = fmt(seconds);
      $('sum-with').textContent =
        n > 0 ? `touched grass with ${n} ${n === 1 ? 'friend' : 'friends'} in the hall. wagmi.` : 'touched grass. wagmi.';
      $('summary').classList.remove('hidden');
    }
  }
}
