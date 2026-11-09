// Bake many small coloured meshes into at most two: one lit (vertex colours) and one glowing (unlit).
// Turns a ~30-part robed avatar into a handful of draw calls; all baked avatars share two materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { own } from './dispose';

export const BAKED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
export const BAKED_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });

const tmp = new THREE.Matrix4();

function prep(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.morphAttributes = {};
  return g;
}

/**
 * Merges every mesh under `root` (and `root` itself if it is a mesh) into baked meshes in root's local space.
 * Subtrees for which `keep(o)` is true are left alone (animated parts that are baked separately).
 * Returns the [lit, glow] meshes (either may be null). `shadow` = whether the lit mesh casts a shadow.
 */
export function bake(root: THREE.Object3D, keep: (o: THREE.Object3D) => boolean = () => false, shadow = true, dropped?: Set<THREE.Material>) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const lit: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const victims: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o !== root && keep(o)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.visible) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      // glow = unlit emblems (toneMapped off) and strongly emissive trims
      const isGlow = mat.type === 'MeshBasicMaterial' ? mat.toneMapped === false : (mat.emissiveIntensity ?? 0) > 0.3 && !!mat.emissive && mat.emissive.getHex() !== 0;
      const color = isGlow && mat.emissive ? mat.emissive.clone() : (mat.color ?? new THREE.Color('#fff')).clone();
      const rel = inv.clone().multiply(mesh.matrixWorld);
      const out = isGlow ? glow : lit;
      const im = mesh as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, tmp);
          out.push(prep(im.geometry, rel.clone().multiply(tmp), color));
        }
      } else out.push(prep(mesh.geometry, rel, color));
      victims.push(mesh);
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  // remove the originals (keep the root object itself: callers hold references to it)
  for (const v of victims) {
    if (v === root) continue;
    v.removeFromParent();
    for (const mt of Array.isArray(v.material) ? v.material : [v.material]) if (mt.userData?.own) dropped?.add(mt); // caller frees the unused ones
  }
  const make = (geos: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean) => {
    if (!geos.length) return null;
    const g = own(mergeGeometries(geos)!);
    geos.forEach((x) => x.dispose());
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast;
    return m;
  };
  const a = make(lit, BAKED, shadow);
  const b = make(glow, BAKED_GLOW, false);
  if ((root as THREE.Mesh).isMesh && victims.includes(root as THREE.Mesh)) {
    // root was a mesh: it becomes the lit mesh itself
    const rm = root as THREE.Mesh;
    if (a) {
      rm.geometry = a.geometry;
      rm.material = BAKED;
      rm.castShadow = shadow;
    } else rm.visible = false;
    if (b) rm.add(b);
    return [rm, b] as const;
  }
  if (a) root.add(a);
  if (b) root.add(b);
  return [a, b] as const;
}

/**
 * Make animated (skinned) meshes frustum-cullable: bounds from the current pose, padded so limbs moving
 * in animations stay inside. Call after the model is posed/scaled. (Was frustumCulled = false = always drawn.)
 */
export function cullable(root: THREE.Object3D, pad = 1.6) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.frustumCulled = true;
    if (m.isSkinnedMesh) {
      m.skeleton.update();
      m.computeBoundingSphere();
    } else m.geometry.computeBoundingSphere();
    const bs = m.isSkinnedMesh ? m.boundingSphere : m.geometry.boundingSphere;
    if (bs) bs.radius *= pad;
  });
}
