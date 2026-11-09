// Resident frens: meme-animal characters who sit around the world. Tap one (or walk close) for a line.
import * as THREE from 'three';
import { Avatar } from './avatar';
import { popEmoji } from './effects';
import { GARDEN, GROVE, LAKE, LIGHT_COUNT, LOOKOUT, TEA } from './layout';

interface Fren {
  name: string;
  sp: number;
  light: number;
  x: number;
  z: number;
  y?: number;
  face: [number, number];
  lines: string[];
  pad?: boolean;
}

const FRENS: Fren[] = [
  { name: 'Shibu', sp: 1, light: 6, x: 6.5, z: 12, face: [0, 12], lines: ['much calm. very breathe.', 'wow. such peace.', 'gm fren. sit a while?', 'no charts. only sky.'] },
  { name: 'Froggo', sp: 2, light: 1, x: LAKE.x - 4, z: LAKE.z + 2.5, y: -0.12, pad: true, face: [LAKE.x + 10, LAKE.z - 4], lines: ['gm 🐸', 'ribbit. breathe in. ribbit. breathe out.', 'the pond is always green, ser.', 'feels good man... to sit.'] },
  { name: 'Capy', sp: 4, light: 7, x: LAKE.x - LAKE.rx * 1.2, z: LAKE.z - 3, face: [LAKE.x, LAKE.z], lines: ['no thoughts. just vibes.', 'i sit. the orange sits. we are one.', 'everyone is my fren here.'] },
  { name: 'Kitty', sp: 3, light: 5, x: TEA.x - 2.4, z: TEA.z + 2.2, face: [TEA.x - 9, TEA.z + 1], lines: ['nap is also meditation.', 'touch grass? i am the grass.', 'tea is warm. vibes are warmer.'] },
  { name: 'Shibu jr', sp: 1, light: 3, x: GARDEN.x - GARDEN.w / 2 - 4, z: GARDEN.z + 3, face: [GARDEN.x, GARDEN.z], lines: ['each stone is a fren. 108 frens.', 'raked lines go brrr (slowly).'] },
  { name: 'Old Monk', sp: 0, light: 0, x: LOOKOUT.x + 2.6, z: LOOKOUT.z + 1.2, face: [0, -16], lines: ['wagmi. slowly.', 'from here, every hall looks small.', 'the view is free. so is breathing.'] },
  { name: 'Froggo II', sp: 2, light: 3, x: GROVE.x + 2.5, z: GROVE.z - 2.4, face: [GROVE.x + 8, GROVE.z + 3], lines: ['leaves fall. i stay comfy.', 'gm from the grove 🍁'] },
];

function bubbleTex(text: string, name: string) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d')!;
  // sticker bubble: hard black outline + offset shadow
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(18, 18, 610, 150, 34);
  g.fill();
  g.fillStyle = '#fffdf5';
  g.strokeStyle = '#120b24';
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(8, 8, 610, 150, 34);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(290, 155);
  g.lineTo(320, 195);
  g.lineTo(345, 155);
  g.fill();
  g.font = '400 34px "Lilita One", system-ui, sans-serif';
  g.fillStyle = '#9945ff';
  g.textAlign = 'center';
  g.fillText(name, 313, 56);
  g.font = '400 44px "Lilita One", system-ui, sans-serif';
  g.fillStyle = '#120b24';
  let fs = 44;
  while (g.measureText(text).width > 570 && fs > 26) g.font = `400 ${(fs -= 2)}px "Lilita One", system-ui, sans-serif`;
  g.fillText(text, 313, 118);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function setupFrens(scene: THREE.Scene, heightAt: (x: number, z: number) => number, clickables: THREE.Object3D[]) {
  const list = FRENS.map((f) => {
    const a = new Avatar(f.sp * LIGHT_COUNT + f.light, false);
    const y = f.y ?? heightAt(f.x, f.z);
    a.root.position.set(f.x, y, f.z);
    a.target.set(f.x, y, f.z);
    a.targetRy = a.root.rotation.y = Math.atan2(f.face[0] - f.x, f.face[1] - f.z);
    a.state = 'sit';
    a.root.userData.action = 'npc';
    a.root.userData.fren = f.name;
    if (f.pad) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20, 0.3, Math.PI * 1.85), new THREE.MeshStandardMaterial({ color: '#5f9a4d', roughness: 0.9 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.01;
      a.root.add(pad);
    }
    scene.add(a.root);
    clickables.push(a.root);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
    bubble.scale.set(3.0, 0.94, 1);
    bubble.renderOrder = 10;
    bubble.position.y = 2.25;
    bubble.visible = false;
    a.root.add(bubble);
    return { f, a, y, bubble, until: 0, next: 0, i: Math.floor(Math.random() * f.lines.length) };
  });

  function say(n: (typeof list)[number], now: number, text?: string) {
    const line = text ?? n.f.lines[n.i++ % n.f.lines.length];
    n.bubble.material.map?.dispose();
    n.bubble.material.map = bubbleTex(line, n.f.name);
    n.bubble.material.needsUpdate = true;
    n.bubble.visible = true;
    n.until = now + 8000;
    n.next = now + 45000;
    n.a.greet();
  }

  return {
    count: list.length,
    /** where to stand to face fren i (for ?fren=i screenshots), and make it talk */
    meet(i: number) {
      const n = list[i % list.length];
      const ry = n.a.root.rotation.y;
      say(n, performance.now());
      return { x: n.f.x + Math.sin(ry) * 3.2, z: n.f.z + Math.cos(ry) * 3.2, lx: n.f.x, lz: n.f.z };
    },
    /** tap on a fren: it talks; returns its index (for the fren sheet) or -1 */
    tap(o: THREE.Object3D) {
      const i = list.findIndex((x) => x.a.root === o);
      if (i >= 0) say(list[i], performance.now());
      return i;
    },
    name: (i: number) => list[i]?.f.name ?? '',
    /** you pat the fren: hearts + a happy line */
    pat(i: number) {
      const n = list[i];
      if (!n) return;
      popEmoji(n.a.root, ['❤️', '💖', '🥰'], 6, 1.4);
      say(n, performance.now(), ['such pat. wow.', 'hehe. again pls', 'ur a good fren', 'pat received ✦'][Math.floor(Math.random() * 4)]);
    },
    /** the fren blesses you: sparkles + its blessing word */
    blessed(i: number, word: string) {
      const n = list[i];
      if (!n) return;
      popEmoji(n.a.root, ['✨', '🙏', '✨'], 6, 1.4);
      n.a.bow();
      say(n, performance.now(), `${word} ✦ go in peace, fren`);
    },
    update(t: number, dt: number, player: THREE.Vector3) {
      const now = performance.now();
      for (const n of list) {
        n.a.update(dt, t);
        n.a.root.position.y = n.y;
        const d = Math.hypot(player.x - n.f.x, player.z - n.f.z);
        if (d < 5 && now > n.next) say(n, now);
        if (n.bubble.visible && now > n.until) n.bubble.visible = false;
      }
    },
  };
}
