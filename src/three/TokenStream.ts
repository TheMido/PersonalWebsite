import * as THREE from 'three';
import type { TokenAtlas } from './atlas';
import { makeRandom } from '../utils/textures';

const vertexShader = /* glsl */ `
attribute float aPhase;
attribute float aY;
attribute float aZ;
attribute float aSpeed;
attribute float aHeight;
attribute float aAspect;
attribute vec4  aUvRect;
attribute vec3  aColor;
attribute float aAlpha;

uniform float uTime;
uniform float uSpan;

varying vec2  vUv;
varying vec3  vColor;
varying float vAlpha;

void main() {
  // Wrap the token around the horizontal span so it re-enters from the left.
  float x = (fract(aPhase + uTime * aSpeed / uSpan) - 0.5) * uSpan;
  float y = aY + sin(uTime * 0.21 + aPhase * 41.0) * 0.22;

  vec4 mv = modelViewMatrix * vec4(x, y, aZ, 1.0);

  float w = aHeight * aAspect;
  mv.xy += (uv - 0.5) * vec2(w, aHeight);

  // vUv.y is flipped because the atlas texture uses flipY = false.
  vUv = vec2(mix(aUvRect.x, aUvRect.z, uv.x), mix(aUvRect.w, aUvRect.y, uv.y));
  vColor = aColor;

  float dist = max(0.0, -mv.z);
  float fog = exp(-0.016 * max(0.0, dist - 11.0));
  vAlpha = aAlpha * fog;

  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uOpacity;

varying vec2  vUv;
varying vec3  vColor;
varying float vAlpha;

void main() {
  vec4 texel = texture2D(uAtlas, vUv);
  float a = texel.a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * texel.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface Lane {
  z: number;
  speed: number;
  count: number;
  yMin: number;
  yMax: number;
  height: number;
  alpha: number;
}

export class TokenStream {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;

  constructor(atlas: TokenAtlas, mobile: boolean) {
    const s = mobile ? 0.62 : 1;
    const lanes: Lane[] = [
      { z: -28, speed: 0.55, count: mobile ? 5 : 7, yMin: -4.6, yMax: 4.6, height: 0.95 * s, alpha: 0.42 },
      { z: -21, speed: 1.05, count: mobile ? 6 : 9, yMin: -4.2, yMax: 4.8, height: 0.78 * s, alpha: 0.58 },
      { z: -15, speed: 1.85, count: mobile ? 6 : 9, yMin: -4.8, yMax: 4.2, height: 0.62 * s, alpha: 0.75 },
      { z: -9, speed: 3.10, count: mobile ? 5 : 7, yMin: -4.0, yMax: 4.6, height: 0.48 * s, alpha: 0.9 },
    ];

    const random = makeRandom(90210);
    const total = lanes.reduce((sum, lane) => sum + lane.count, 0);

    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.attributes.position = base.attributes.position;
    geometry.attributes.uv = base.attributes.uv;
    geometry.instanceCount = total;

    const aPhase = new Float32Array(total);
    const aY = new Float32Array(total);
    const aZ = new Float32Array(total);
    const aSpeed = new Float32Array(total);
    const aHeight = new Float32Array(total);
    const aAspect = new Float32Array(total);
    const aUvRect = new Float32Array(total * 4);
    const aColor = new Float32Array(total * 3);
    const aAlpha = new Float32Array(total);

    const cyan = new THREE.Color('#00e5ff');
    const violet = new THREE.Color('#7c4dff');
    const ink = new THREE.Color('#dfe6f2');

    let i = 0;
    for (const lane of lanes) {
      for (let n = 0; n < lane.count; n++) {
        const entry = atlas.entries[Math.floor(random() * atlas.entries.length)];

        aPhase[i] = random();
        aY[i] = lane.yMin + random() * (lane.yMax - lane.yMin);
        aZ[i] = lane.z + (random() - 0.5) * 1.4;
        aSpeed[i] = lane.speed * (0.82 + random() * 0.36);
        aHeight[i] = lane.height * (0.85 + random() * 0.4);
        aAspect[i] = entry.aspect;
        aUvRect.set(entry.uv, i * 4);

        const roll = random();
        const color = roll < 0.5 ? cyan : roll < 0.72 ? violet : ink;
        aColor[i * 3] = color.r;
        aColor[i * 3 + 1] = color.g;
        aColor[i * 3 + 2] = color.b;

        aAlpha[i] = lane.alpha * (0.55 + random() * 0.55);
        i++;
      }
    }

    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
    geometry.setAttribute('aY', new THREE.InstancedBufferAttribute(aY, 1));
    geometry.setAttribute('aZ', new THREE.InstancedBufferAttribute(aZ, 1));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));
    geometry.setAttribute('aHeight', new THREE.InstancedBufferAttribute(aHeight, 1));
    geometry.setAttribute('aAspect', new THREE.InstancedBufferAttribute(aAspect, 1));
    geometry.setAttribute('aUvRect', new THREE.InstancedBufferAttribute(aUvRect, 4));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(aColor, 3));
    geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(aAlpha, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: atlas.texture },
        uTime: { value: 0 },
        uSpan: { value: 40 },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });

    this.geometry = geometry;
    this.material = material;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setSpan(span: number): void {
    this.material.uniforms.uSpan.value = span;
  }

  setOpacity(value: number): void {
    this.material.uniforms.uOpacity.value = value;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
