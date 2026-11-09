// All sounds are synthesised (no audio files): singing bowl, temple bell, forest air.
class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise: AudioBuffer | null = null;
  private amb: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  muted = false;

  /** Must be called from a user gesture (tap/click). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.08);
  }

  private noiseBuf(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown noise: soft, wind-like
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    this.noise = b;
    return b;
  }

  /** One ringing partial = two slightly detuned sines (gives the slow "wah" beating of real bowls). */
  private partial(freq: number, amp: number, decay: number, t0: number, beat: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    for (const d of [-beat / 2, beat / 2]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq + d;
      o.connect(g);
      o.start(t0);
      o.stop(t0 + decay + 0.1);
    }
    g.connect(dest);
  }

  private strike(t0: number, dest: AudioNode, freq: number, amp: number, len = 0.06) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(bp).connect(g).connect(dest);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + len + 0.05);
  }

  bowl(volume = 1, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const out = this.ctx.createGain();
    out.gain.value = 0.2 * volume;
    out.connect(this.master);
    const f = 330 * pitch;
    const parts: [number, number, number][] = [
      [1, 1, 10],
      [2.71, 0.42, 7],
      [5.13, 0.2, 4.2],
      [8.41, 0.08, 2.4],
    ];
    for (const [r, a, d] of parts) this.partial(f * r, a, d, t, 0.9 + r * 0.4, out);
    this.strike(t, out, 2600, 0.35);
  }

  bell(volume = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const out = this.ctx.createGain();
    out.gain.value = 0.28 * volume;
    out.connect(this.master);
    const f = 98;
    const parts: [number, number, number][] = [
      [0.5, 0.55, 16],
      [1, 1, 13],
      [1.19, 0.45, 9],
      [1.5, 0.32, 7],
      [2, 0.38, 6],
      [2.52, 0.18, 4],
      [3.01, 0.1, 3],
    ];
    for (const [r, a, d] of parts) this.partial(f * r, a, d, t, 0.5 + r * 0.3, out);
    this.strike(t, out, 220, 1.2, 0.18);
  }

  ambience(on: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.amb) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf();
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.07, ctx.currentTime, 1.5);
      // slow swell, like wind through pines
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain).connect(gain.gain);
      src.connect(lp).connect(gain).connect(this.master);
      src.start();
      lfo.start();
      this.amb = { src, gain, lfo };
    } else if (!on && this.amb) {
      const a = this.amb;
      this.amb = null;
      a.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => {
        a.src.stop();
        a.lfo.stop();
      }, 2000);
    }
  }
}

export const audio = new AudioEngine();

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
