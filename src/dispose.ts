// Freeing GPU memory for one character / pet: cloned skeletons (their bone textures) and anything tagged
// `userData.own` (per-instance materials and geometries). Shared materials/geometries from caches are left alone.
import * as THREE from 'three';

export function own<T extends THREE.Material | THREE.BufferGeometry>(x: T): T {
  x.userData.own = true;
  return x;
}

export function disposeOwned(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton && !seen.has(sm.skeleton)) {
      seen.add(sm.skeleton);
      sm.skeleton.dispose();
    }
    const m = o as THREE.Mesh | THREE.Sprite | THREE.Points;
    if (!('material' in m)) return;
    const geo = (m as THREE.Mesh).geometry;
    if (geo?.userData?.own && !seen.has(geo)) {
      seen.add(geo);
      geo.dispose();
    }
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mt?.userData?.own && !seen.has(mt)) {
        seen.add(mt);
        mt.dispose();
      }
    }
  });
}
