import * as THREE from 'three';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Touch: tap = walk/interact, drag = look around, pinch = zoom.
 * Desktop: click = walk, drag = look, wheel = zoom, WASD/arrows = walk, Q/E = turn.
 */
export class Controls {
  yaw = 0;
  pitch = 0.42;
  zoom = 9;
  onTap: (x: number, y: number) => void = () => {};

  private keys = new Set<string>();
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private dragging = false;
  private pinch = 0;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pts.size === 2) {
        this.pinch = this.dist();
        this.dragging = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pts.size === 2) {
        const d = this.dist();
        if (this.pinch > 0 && d > 0) this.zoom = clamp((this.zoom * this.pinch) / d, 4, 16);
        this.pinch = d;
        return;
      }
      if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > 10) this.dragging = true;
      if (this.dragging) {
        this.yaw -= dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.004, 0.15, 1.1);
      }
    });
    const end = (e: PointerEvent, tap: boolean) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      this.pts.delete(e.pointerId);
      if (tap && !this.dragging && this.pts.size === 0 && performance.now() - p.t < 450) this.onTap(e.clientX, e.clientY);
      if (this.pts.size === 0) {
        this.dragging = false;
        this.pinch = 0;
      }
    };
    el.addEventListener('pointerup', (e) => end(e, true));
    el.addEventListener('pointercancel', (e) => end(e, false));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = clamp(this.zoom * (1 + e.deltaY * 0.001), 4, 16);
      },
      { passive: false },
    );
    addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  private dist() {
    const [a, b] = [...this.pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Walking direction from keys, relative to the camera. Returns false if no key pressed. */
  keyVector(out: THREE.Vector2, dt: number): boolean {
    const k = this.keys;
    if (k.has('KeyQ')) this.yaw += dt * 1.6;
    if (k.has('KeyE')) this.yaw -= dt * 1.6;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (!fwd && !side) return false;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    out.set(fx * fwd + rx * side, fz * fwd + rz * side).normalize();
    return true;
  }
}
