import * as THREE from 'three';
import { palette, runtime } from '../config';
import { buildTokenAtlas, extraGlyphs, type TokenAtlas } from './atlas';
import { TokenStream } from './TokenStream';
import { NeuralNet } from './NeuralNet';
import { LossHalo } from './LossHalo';
import { Portrait } from './Portrait';
import { ForegroundParticles } from './Foreground';

const FOV = 38;

/** Vertical placement of the head, as a fraction of the visible world height. */
const HEAD_Y_FACTOR = 0.15;

export interface SceneAssets {
  portraitMap: THREE.Texture;
  portraitDepth: THREE.Texture;
  portraitAspect: number;
}

export interface SceneOptions {
  name: string;
  tokens: readonly string[];
  mobile: boolean;
  reducedMotion: boolean;
}

export class SceneManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly background = new THREE.Scene();
  private readonly portraitScene = new THREE.Scene();
  private readonly foregroundScene = new THREE.Scene();

  private readonly backgroundGroup = new THREE.Group();

  private neuralNet!: NeuralNet;
  private tokenStream!: TokenStream;
  private lossHalo!: LossHalo;
  private portrait!: Portrait;
  private foreground!: ForegroundParticles;
  private atlas!: TokenAtlas;

  private width = 1;
  private height = 1;
  private viewHeight = 11;
  private viewWidth = 17;
  private frameHandle = 0;
  private lastTime = 0;
  private elapsed = 0;
  private intro = 0;
  private running = false;
  private disposed = false;

  private frameTimes: number[] = [];
  private quality = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: SceneAssets,
    private readonly options: SceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !options.mobile,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    this.background.add(this.backgroundGroup);
  }

  /** Builds every layer. Resolves once the first frame can be rendered. */
  async init(): Promise<void> {
    this.atlas = buildTokenAtlas(this.options.tokens, extraGlyphs);

    this.neuralNet = new NeuralNet(this.options.mobile);
    this.tokenStream = new TokenStream(this.atlas, this.options.mobile);
    this.lossHalo = new LossHalo(this.options.mobile);
    this.portrait = new Portrait({
      map: this.assets.portraitMap,
      depth: this.assets.portraitDepth,
      aspect: this.assets.portraitAspect,
      mobile: this.options.mobile,
    });
    this.foreground = new ForegroundParticles(this.options.mobile);

    this.backgroundGroup.add(this.neuralNet.group);
    this.backgroundGroup.add(this.tokenStream.mesh);
    this.backgroundGroup.add(this.lossHalo.group);
    this.portraitScene.add(this.portrait.group);
    this.foregroundScene.add(this.foreground.mesh);

    this.resize();

    // Warm the shaders up so the first visible frame is not a stutter.
    this.renderer.compile(this.background, this.camera);
    this.renderer.compile(this.portraitScene, this.camera);
    this.renderer.compile(this.foregroundScene, this.camera);

    // With reduced motion we never enter the animation loop, so the layers
    // have to be primed with their final opacity right away.
    this.applyOpacities(this.options.reducedMotion ? 1 : 0);
    this.portrait.setOpacity(this.options.reducedMotion ? 1 : 0);

    this.renderFrame(0);
  }

  /* ---------------------------------------------------------------------- */
  /*  Layout                                                                */
  /* ---------------------------------------------------------------------- */

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));

    this.width = width;
    this.height = height;

    const dpr = Math.min(window.devicePixelRatio || 1, runtime.maxPixelRatio) * this.quality;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    const aspect = this.width / this.height;
    this.viewHeight = aspect >= 1 ? 11 : 6.4 / aspect;
    this.viewWidth = this.viewHeight * aspect;

    const distance = this.viewHeight / (2 * Math.tan((FOV * Math.PI) / 360));
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, distance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    const headY = this.viewHeight * HEAD_Y_FACTOR;
    this.portrait.layout(this.viewHeight, this.viewWidth, headY, this.assets.portraitAspect);

    this.tokenStream.setSpan(this.viewWidth * 1.55);
    this.foreground.setSpan(this.viewWidth * 1.45);

    this.lossHalo.group.position.set(0, headY, -12);
    this.lossHalo.group.scale.setScalar(aspect >= 1 ? 1.85 : 1.35);

    const pointScale = (height * dpr) / (2 * Math.tan((FOV * Math.PI) / 360));
    this.neuralNet.setPointScale(pointScale);
    this.lossHalo.setPointScale(pointScale);

    if (!this.running) this.renderFrame(0);
  }

  /* ---------------------------------------------------------------------- */
  /*  Loop                                                                  */
  /* ---------------------------------------------------------------------- */

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;

    this.update(dt);
    this.renderFrame(dt);
    this.monitorPerformance(dt);
  };

  private update(dt: number): void {
    this.intro = Math.min(1, this.intro + dt / 1.25);
    const eased = 1 - Math.pow(1 - this.intro, 3);

    this.applyOpacities(eased);
    this.portrait.setOpacity(Math.min(1, this.intro * 1.35));
  }

  private applyOpacities(value: number): void {
    this.neuralNet.setOpacity(value * 0.95);
    this.tokenStream.setOpacity(value);
    this.lossHalo.setOpacity(value * 0.8);
    this.foreground.setOpacity(value);
  }

  /**
   * Applies the damped tilt. Called from the app loop so that the pointer
   * smoothing stays in one place.
   */
  applyTilt(tiltX: number, tiltY: number): void {
    const maxTilt = (runtime.maxTiltDeg * Math.PI) / 180;

    this.portrait.group.rotation.y = -tiltX * maxTilt;
    this.portrait.group.rotation.x = tiltY * maxTilt * 0.55;
    this.portrait.group.position.x = tiltX * 0.3;
    this.portrait.group.position.y = tiltY * 0.12;

    this.backgroundGroup.position.x = -tiltX * 0.16;
    this.backgroundGroup.position.y = tiltY * 0.06;
  }

  private renderFrame(_dt: number): void {
    const t = this.elapsed;

    this.neuralNet.update(t);
    this.tokenStream.update(t);
    this.lossHalo.update(t);
    this.foreground.update(t);

    this.renderer.clear(true, true, true);
    this.renderer.render(this.background, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.portraitScene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.foregroundScene, this.camera);
  }

  /** Drops the pixel ratio if the device cannot keep up. */
  private monitorPerformance(dt: number): void {
    if (dt <= 0) return;
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length < 90) return;

    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;

    if (average > 26 && this.quality > 0.7) {
      this.quality = 0.7;
      this.resize();
    } else if (average < 15 && this.quality < 1) {
      this.quality = 1;
      this.resize();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    this.neuralNet?.dispose();
    this.tokenStream?.dispose();
    this.lossHalo?.dispose();
    this.portrait?.dispose();
    this.foreground?.dispose();
    this.atlas?.texture.dispose();
    this.renderer.dispose();
  }
}

/** Palette helper so the CSS and the shaders stay in sync. */
export const colors = {
  cyan: new THREE.Color(palette.cyan),
  violet: new THREE.Color(palette.violet),
  ink: new THREE.Color(palette.ink),
};
