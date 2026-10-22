import * as THREE from 'three';
import { createRadialSprite, makeRandom } from '../utils/textures';

const nodeVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aBob;

uniform float uTime;
uniform float uPointScale;

varying float vAlpha;

void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.55 + aPhase) * aBob;
  p.x += cos(uTime * 0.31 + aPhase * 1.7) * aBob * 0.45;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(0.001, -mv.z);
  gl_PointSize = max(1.0, aSize * uPointScale / dist);

  float fog = exp(-0.022 * max(0.0, dist - 14.0));
  vAlpha = fog;

  gl_Position = projectionMatrix * mv;
}
`;

const nodeFragment = /* glsl */ `
uniform sampler2D uSprite;
uniform vec3  uColor;
uniform float uOpacity;

varying float vAlpha;

void main() {
  float a = texture2D(uSprite, gl_PointCoord).a * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const edgeVertex = /* glsl */ `
attribute float aT;
attribute float aEdgePhase;
attribute float aPhase;
attribute float aBob;

uniform float uTime;

varying float vT;
varying float vEdgePhase;
varying float vDepth;

void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.55 + aPhase) * aBob;
  p.x += cos(uTime * 0.31 + aPhase * 1.7) * aBob * 0.45;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vT = aT;
  vEdgePhase = aEdgePhase;
  vDepth = -mv.z;

  gl_Position = projectionMatrix * mv;
}
`;

const edgeFragment = /* glsl */ `
uniform float uTime;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uOpacity;

varying float vT;
varying float vEdgePhase;
varying float vDepth;

void main() {
  // A light pulse travelling along the edge.
  float head = fract(uTime * 0.14 + vEdgePhase);
  float d = vT - head;
  d = d - floor(d + 0.5);              // wrap into [-0.5, 0.5]

  float pulse = exp(-d * d * 320.0);
  float trail = smoothstep(0.0, 0.35, -d) * exp(-(-d) * 11.0) * 0.30;

  float fog = exp(-0.018 * max(0.0, vDepth - 14.0));
  float a = (0.055 + pulse * 0.55 + trail) * fog * uOpacity;
  if (a < 0.004) discard;

  vec3 c = mix(uColorA, uColorB, pulse * 0.9);
  c = mix(c, vec3(1.0), pulse * 0.55);

  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface Node {
  x: number;
  y: number;
  z: number;
  phase: number;
  bob: number;
  size: number;
}

export class NeuralNet {
  readonly group = new THREE.Group();
  private readonly nodeGeometry: THREE.BufferGeometry;
  private readonly edgeGeometry: THREE.BufferGeometry;
  private readonly nodeMaterial: THREE.ShaderMaterial;
  private readonly edgeMaterial: THREE.ShaderMaterial;
  private readonly sprite: THREE.Texture;

  constructor(mobile: boolean) {
    const random = makeRandom(4242);
    const layers = mobile ? 4 : 6;
    const perLayer = mobile ? 6 : 9;

    const nodes: Node[] = [];
    const layerNodes: Node[][] = [];

    for (let l = 0; l < layers; l++) {
      const t = l / (layers - 1);
      const x = -17 + t * 34;
      // Each layer sits at its own depth so the graph reads as a receding
      // stack of columns rather than a tangle of long diagonals.
      const layerZ = -13 - t * 15;
      const count = Math.max(4, Math.round(perLayer * (0.62 + 0.55 * Math.sin(t * Math.PI))));
      const bucket: Node[] = [];
      for (let i = 0; i < count; i++) {
        const node: Node = {
          x: x + (random() - 0.5) * 2.6,
          y: (random() - 0.5) * 10,
          z: layerZ + (random() - 0.5) * 3.2,
          phase: random() * Math.PI * 2,
          bob: 0.12 + random() * 0.36,
          size: 0.13 + random() * 0.16,
        };
        bucket.push(node);
        nodes.push(node);
      }
      layerNodes.push(bucket);
    }

    // --- nodes -------------------------------------------------------------
    const nodePositions = new Float32Array(nodes.length * 3);
    const nodeSizes = new Float32Array(nodes.length);
    const nodePhases = new Float32Array(nodes.length);
    const nodeBobs = new Float32Array(nodes.length);

    nodes.forEach((node, i) => {
      nodePositions[i * 3] = node.x;
      nodePositions[i * 3 + 1] = node.y;
      nodePositions[i * 3 + 2] = node.z;
      nodeSizes[i] = node.size;
      nodePhases[i] = node.phase;
      nodeBobs[i] = node.bob;
    });

    this.nodeGeometry = new THREE.BufferGeometry();
    this.nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    this.nodeGeometry.setAttribute('aSize', new THREE.BufferAttribute(nodeSizes, 1));
    this.nodeGeometry.setAttribute('aPhase', new THREE.BufferAttribute(nodePhases, 1));
    this.nodeGeometry.setAttribute('aBob', new THREE.BufferAttribute(nodeBobs, 1));
    this.nodeGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 90);

    this.sprite = createRadialSprite(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 1.1);

    this.nodeMaterial = new THREE.ShaderMaterial({
      vertexShader: nodeVertex,
      fragmentShader: nodeFragment,
      uniforms: {
        uSprite: { value: this.sprite },
        uColor: { value: new THREE.Color('#7ee9ff') },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uPointScale: { value: 600 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const nodePoints = new THREE.Points(this.nodeGeometry, this.nodeMaterial);
    nodePoints.frustumCulled = false;
    nodePoints.renderOrder = 0;
    this.group.add(nodePoints);

    // --- edges -------------------------------------------------------------
    const edgePositions: number[] = [];
    const edgeT: number[] = [];
    const edgePhase: number[] = [];
    const edgeNodePhase: number[] = [];
    const edgeBob: number[] = [];

    for (let l = 0; l < layerNodes.length - 1; l++) {
      const from = layerNodes[l];
      const to = layerNodes[l + 1];
      for (const a of from) {
        for (const b of to) {
          // Keep the graph sparse — not every pair is connected.
          if (random() > 0.34) continue;
          edgePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          edgeT.push(0, 1);
          const phase = random();
          edgePhase.push(phase, phase);
          edgeNodePhase.push(a.phase, b.phase);
          edgeBob.push(a.bob, b.bob);
        }
      }
    }

    this.edgeGeometry = new THREE.BufferGeometry();
    this.edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    this.edgeGeometry.setAttribute('aT', new THREE.Float32BufferAttribute(edgeT, 1));
    this.edgeGeometry.setAttribute('aEdgePhase', new THREE.Float32BufferAttribute(edgePhase, 1));
    this.edgeGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(edgeNodePhase, 1));
    this.edgeGeometry.setAttribute('aBob', new THREE.Float32BufferAttribute(edgeBob, 1));
    this.edgeGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 90);

    this.edgeMaterial = new THREE.ShaderMaterial({
      vertexShader: edgeVertex,
      fragmentShader: edgeFragment,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color('#1f6f8f') },
        uColorB: { value: new THREE.Color('#00e5ff') },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const edges = new THREE.LineSegments(this.edgeGeometry, this.edgeMaterial);
    edges.frustumCulled = false;
    edges.renderOrder = 0;
    this.group.add(edges);
  }

  setOpacity(value: number): void {
    this.nodeMaterial.uniforms.uOpacity.value = value;
    this.edgeMaterial.uniforms.uOpacity.value = value;
  }

  setPointScale(value: number): void {
    this.nodeMaterial.uniforms.uPointScale.value = value;
  }

  update(time: number): void {
    this.nodeMaterial.uniforms.uTime.value = time;
    this.edgeMaterial.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.nodeGeometry.dispose();
    this.edgeGeometry.dispose();
    this.nodeMaterial.dispose();
    this.edgeMaterial.dispose();
    this.sprite.dispose();
  }
}
