// Stylised water: moving ripples, fresnel sky reflection, sun glint, shallow edges. No textures.
import * as THREE from 'three';

export function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: new THREE.Color('#4f7f86') },
        shallow: { value: new THREE.Color('#9cc3b8') },
        sky: { value: new THREE.Color('#e9ece4') },
        sunDir: { value: new THREE.Vector3(0.5, 0.75, 0.4).normalize() },
        sunCol: { value: new THREE.Color('#fff4dc') },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float time;
      uniform vec3 deep, shallow, sky, sunDir, sunCol;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec2 p = vWorld.xz;
        // three wave trains -> analytic normal
        float a1 = p.x * 0.9 + p.y * 0.4 + time * 0.8;
        float a2 = p.x * -0.5 + p.y * 1.3 - time * 1.05;
        float a3 = (p.x + p.y) * 2.6 + time * 1.7;
        vec2 grad = vec2(0.9, 0.4) * cos(a1) * 0.05 + vec2(-0.5, 1.3) * cos(a2) * 0.04 + vec2(2.6, 2.6) * cos(a3) * 0.012;
        vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float edge = smoothstep(0.55, 1.0, length(vUv - 0.5) * 2.0);
        vec3 col = mix(deep, shallow, edge * 0.85);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        col = mix(col, sky, clamp(fres * 0.85 + 0.08, 0.0, 0.9));
        float spec = pow(max(dot(reflect(-sunDir, n), V), 0.0), 120.0);
        col += sunCol * spec * 1.4;
        // soft foam line at the shore
        col = mix(col, vec3(0.95, 0.96, 0.92), smoothstep(0.93, 1.0, length(vUv - 0.5) * 2.0) * 0.55);
        gl_FragColor = vec4(col, 0.94);
        #include <fog_fragment>
      }`,
  });
}
