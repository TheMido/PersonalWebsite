import * as THREE from 'three';

const vertexShader = /* glsl */ `
uniform sampler2D uDepth;
uniform sampler2D uMask;
uniform float uDepthScale;

varying vec2  vUv;
varying float vDepth;

void main() {
  vUv = uv;

  float d = texture2D(uDepth, uv).r;

  // Keep the shoulders close to the base plane, let the head bulge forward.
  float weight = smoothstep(0.04, 0.46, uv.y);

  // Flatten the geometry towards the silhouette. The depth map drops to zero
  // at the cut-out edge; without this the plane would fold up into a thin
  // vertical wall that reads as a translucent flap.
  float a = texture2D(uMask, uv).a;
  weight *= smoothstep(0.05, 0.45, a);

  vDepth = d;

  vec3 p = position;
  p.z += (d - 0.06) * uDepthScale * weight;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uDepth;
uniform vec2      uTexel;
uniform float     uEdgeRadius;
uniform vec3      uRimA;
uniform vec3      uRimB;
uniform float     uRimStrength;
uniform float     uFadeBottom;
uniform float     uOpacity;
uniform float     uContrast;

varying vec2  vUv;
varying float vDepth;

void main() {
  vec4 texel = texture2D(uMap, vUv);
  float alpha = texel.a;
  if (alpha < 0.004) discard;

  // --- where the portrait dissolves into the dark ---------------------------
  // The shoulders reach the edge of the source frame, so the lower body is
  // faded on every side. The rim light has to fade with it, otherwise it
  // would trace the straight edge of the photo.
  float lower = smoothstep(0.80, 0.40, vUv.y);
  float sideFade = min(smoothstep(0.0, 0.16, vUv.x), smoothstep(0.0, 0.16, 1.0 - vUv.x));
  float bodyFade = mix(1.0, sideFade, lower);
  float bottomFade = smoothstep(0.0, uFadeBottom, vUv.y);
  float fade = bodyFade * bottomFade;

  // --- monochrome ----------------------------------------------------------
  float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
  luma = clamp((luma - 0.5) * uContrast + 0.5, 0.0, 1.0);
  luma = luma * luma * (3.0 - 2.0 * luma);

  // --- normal from the depth map -------------------------------------------
  float hL = texture2D(uDepth, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(uDepth, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture2D(uDepth, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture2D(uDepth, vUv + vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3((hL - hR) * 14.0, (hD - hU) * 14.0, 1.0));

  // --- silhouette rim ------------------------------------------------------
  float blur = 0.0;
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * 0.7853981634;
    vec2 o = vec2(cos(ang), sin(ang)) * uEdgeRadius;
    blur += texture2D(uMap, vUv + o).a;
  }
  blur /= 8.0;
  float rim = clamp((alpha - blur) * 3.4, 0.0, 1.0);
  rim = pow(rim, 1.4) * fade;

  // Cyan from the upper left, violet from the lower right.
  float side = smoothstep(-0.4, 0.4, n.x * 1.7 - n.y * 0.7);
  vec3 rimColor = mix(uRimA, uRimB, side);

  vec3 lightDir = normalize(vec3(-0.55, 0.60, 0.58));
  float diffuse = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);

  vec3 color = vec3(luma);
  color = mix(color, color * vec3(0.82, 0.90, 1.06), 0.55);   // cool the shadows
  color += rimColor * rim * (0.35 + 0.65 * diffuse) * uRimStrength;

  alpha *= fade;
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(color, alpha * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface PortraitOptions {
  map: THREE.Texture;
  depth: THREE.Texture;
  /** aspect = width / height of the source image */
  aspect: number;
  mobile: boolean;
}

export class Portrait {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(options: PortraitOptions) {
    const segments = options.mobile ? 84 : 132;
    const imageSize = options.map.image as { width: number; height: number };

    this.geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: options.map },
        uMask: { value: options.map },
        uDepth: { value: options.depth },
        uDepthScale: { value: 0.85 },
        uTexel: { value: new THREE.Vector2(1 / imageSize.width, 1 / imageSize.height) },
        uEdgeRadius: { value: options.mobile ? 0.006 : 0.005 },
        uRimA: { value: new THREE.Color('#00e5ff') },
        uRimB: { value: new THREE.Color('#7c4dff') },
        uRimStrength: { value: 0.85 },
        uFadeBottom: { value: 0.17 },
        uOpacity: { value: 1 },
        uContrast: { value: 1.06 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.group.add(this.mesh);
  }

  /**
   * Place the portrait so that the head is always fully visible.
   *
   * @param viewHeight visible world height at z = 0
   * @param viewWidth  visible world width at z = 0
   * @param headY      world y of the head centre
   */
  layout(viewHeight: number, viewWidth: number, headY: number, aspect: number): void {
    const height = Math.min(viewHeight * 0.86, (viewWidth * 0.92) / aspect);
    const width = height * aspect;

    // The head occupies the upper 58 % of the source frame.
    const headCentreFromBottom = 0.625;
    const bottom = headY - headCentreFromBottom * height;

    this.mesh.scale.set(width, height, 1);
    this.mesh.position.set(0, bottom + height / 2, 0);
  }

  setOpacity(value: number): void {
    this.material.uniforms.uOpacity.value = value;
  }

  setDepthScale(value: number): void {
    this.material.uniforms.uDepthScale.value = value;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
