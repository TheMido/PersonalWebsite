import * as THREE from 'three';
import { createRadialSprite, makeRandom } from '../utils/textures';

const vertexShader = /* glsl */ `
attribute float aPhase;
attribute float aY;
attribute float aZ;
attribute float aSpeed;
attribute float aSize;
attribute float aAlpha;

uniform float uTime;
uniform float uSpan;

varying vec2  vUv;
varying float vAlpha;

void main() {
  float x = (fract(aPhase + uTime * aSpeed / uSpan) - 0.5) * uSpan;
  float y = aY + sin(uTime * 0.3 + aPhase * 53.0) * 0.9;

  vec4 mv = modelViewMatrix * vec4(x, y, aZ, 1.0);
  mv.xy += (uv - 0.5) * aSize;

  vUv = uv;
  vAlpha = aAlpha;

  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uSprite;
uniform float uOpacity;

varying vec2  vUv;
varying float vAlpha;

void main() {
  float a = texture2D(uSprite, vUv).a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.62, 0.93, 1.0), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ForegroundParticles {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly sprite: THREE.Texture;

  constructor(mobile: boolean) {
    const count = mobile ? 14 : 30;
    const random = makeRandom(778899);

    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.attributes.position = base.attributes.position;
    geometry.attributes.uv = base.attributes.uv;
    geometry.instanceCount = count;

    const aPhase = new Float32Array(count);
    const aY = new Float32Array(count);
    const aZ = new Float32Array(count);
    const aSpeed = new Float32Array(count);
    const aSize = new Float32Array(count);
    const aAlpha = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      aPhase[i] = random();
      aY[i] = (random() - 0.5) * 13;
      aZ[i] = 1.4 + random() * 6.5;
      aSpeed[i] = 0.25 + random() * 0.5;
      aSize[i] = 0.18 + random() * 0.75;
      aAlpha[i] = 0.05 + random() * 0.13;
    }

    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
    geometry.setAttribute('aY', new THREE.InstancedBufferAttribute(aY, 1));
    geometry.setAttribute('aZ', new THREE.InstancedBufferAttribute(aZ, 1));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));
    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 1));
    geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(aAlpha, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    this.sprite = createRadialSprite(128, 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 1.6);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSprite: { value: this.sprite },
        uTime: { value: 0 },
        uSpan: { value: 40 },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
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
    this.sprite.dispose();
  }
}
