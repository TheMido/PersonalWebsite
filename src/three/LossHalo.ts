import * as THREE from 'three';

const vertexShader = /* glsl */ `
attribute float aFade;
attribute float aHeight;

uniform float uTime;

varying float vFade;
varying float vHeight;

void main() {
  vec3 p = position;
  // A slow, shallow breathing so the halo never feels frozen.
  p += normalize(p) * sin(uTime * 0.42 + p.x * 0.6 + p.y * 0.45) * 0.045;

  // Keep only the equatorial band so the shape reads as a halo ring that
  // frames the head rather than a full sphere.
  float band = smoothstep(-3.15, -1.35, p.y) * smoothstep(3.15, 1.35, p.y);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFade = aFade * band;
  vHeight = aHeight;

  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3  uLow;
uniform vec3  uHigh;
uniform float uOpacity;

varying float vFade;
varying float vHeight;

void main() {
  float a = vFade * uOpacity;
  if (a < 0.004) discard;
  vec3 c = mix(uLow, uHigh, clamp(vHeight, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const pointVertex = /* glsl */ `
attribute float aSize;
attribute float aHeight;

uniform float uTime;
uniform float uPointScale;

varying float vHeight;
varying float vAlpha;

void main() {
  vec3 p = position;
  p += normalize(p) * sin(uTime * 0.42 + p.x * 0.6 + p.y * 0.45) * 0.045;

  float band = smoothstep(-3.15, -1.35, p.y) * smoothstep(3.15, 1.35, p.y);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, aSize * uPointScale / max(0.001, -mv.z));
  vHeight = aHeight;
  vAlpha = exp(-0.020 * max(0.0, -mv.z - 14.0)) * band;

  gl_Position = projectionMatrix * mv;
}
`;

const pointFragment = /* glsl */ `
uniform vec3  uLow;
uniform vec3  uHigh;
uniform float uOpacity;

varying float vHeight;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.06, d) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  vec3 col = mix(uLow, uHigh, clamp(vHeight, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Fibonacci sphere — an even, elegant distribution of points. */
function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }
  return points;
}

export class LossHalo {
  readonly group = new THREE.Group();
  private readonly lineGeometry: THREE.BufferGeometry;
  private readonly pointGeometry: THREE.BufferGeometry;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly pointMaterial: THREE.ShaderMaterial;

  constructor(mobile: boolean) {
    const radius = 3.9;

    // --- wireframe: meridians + parallels -----------------------------------
    const positions: number[] = [];
    const fades: number[] = [];
    const heights: number[] = [];

    const meridians = mobile ? 8 : 12;
    const parallels = mobile ? 5 : 8;
    const steps = 44;

    const pushArc = (points: THREE.Vector3[]) => {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        fades.push(1, 1);
        heights.push(a.y / radius, b.y / radius);
      }
    };

    for (let m = 0; m < meridians; m++) {
      const phi = (m / meridians) * Math.PI * 2;
      const arc: THREE.Vector3[] = [];
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        arc.push(
          new THREE.Vector3(
            Math.cos(theta) * Math.cos(phi),
            Math.sin(theta),
            Math.cos(theta) * Math.sin(phi),
          ).multiplyScalar(radius),
        );
      }
      pushArc(arc);
    }

    for (let p = 1; p < parallels; p++) {
      const lat = (p / parallels) * Math.PI - Math.PI / 2;
      const r = Math.cos(lat);
      const y = Math.sin(lat);
      const arc: THREE.Vector3[] = [];
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        arc.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
      }
      pushArc(arc);
    }

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.lineGeometry.setAttribute('aFade', new THREE.Float32BufferAttribute(fades, 1));
    this.lineGeometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
    this.lineGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.2);

    this.lineMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uLow: { value: new THREE.Color('#00e5ff') },
        uHigh: { value: new THREE.Color('#7c4dff') },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    lines.frustumCulled = false;
    this.group.add(lines);

    // --- point cloud --------------------------------------------------------
    const count = mobile ? 420 : 820;
    const sphere = fibonacciSphere(count, radius);

    const pPos: number[] = [];
    const pSize: number[] = [];
    const pHeight: number[] = [];

    sphere.forEach((p, i) => {
      pPos.push(p.x, p.y, p.z);
      pSize.push(0.055 + ((i * 13) % 7) * 0.016);
      pHeight.push(p.y / radius * 0.5 + 0.5);
    });

    this.pointGeometry = new THREE.BufferGeometry();
    this.pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
    this.pointGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(pSize, 1));
    this.pointGeometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(pHeight, 1));
    this.pointGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.2);

    this.pointMaterial = new THREE.ShaderMaterial({
      vertexShader: pointVertex,
      fragmentShader: pointFragment,
      uniforms: {
        uTime: { value: 0 },
        uLow: { value: new THREE.Color('#00e5ff') },
        uHigh: { value: new THREE.Color('#9d7bff') },
        uOpacity: { value: 0 },
        uPointScale: { value: 600 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(this.pointGeometry, this.pointMaterial);
    points.frustumCulled = false;
    this.group.add(points);
  }

  setOpacity(value: number): void {
    this.lineMaterial.uniforms.uOpacity.value = value * 0.5;
    this.pointMaterial.uniforms.uOpacity.value = value * 0.85;
  }

  setPointScale(value: number): void {
    this.pointMaterial.uniforms.uPointScale.value = value;
  }

  update(time: number): void {
    this.lineMaterial.uniforms.uTime.value = time;
    this.pointMaterial.uniforms.uTime.value = time;
    this.group.rotation.y = time * 0.055;
    this.group.rotation.x = Math.sin(time * 0.11) * 0.16 - 0.06;
    this.group.rotation.z = Math.sin(time * 0.07) * 0.05;
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.pointGeometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
  }
}
