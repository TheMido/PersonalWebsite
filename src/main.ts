import './styles/main.css';

import * as THREE from 'three';

import { site, tokens } from './config';
import { SceneManager } from './three/Scene';
import { initDock } from './ui/dock';
import { isMobileLike, TiltController } from './utils/motion';
import { loadTexture } from './utils/textures';

import portraitPng from './assets/portrait-cutout.png';
import portraitWebp from './assets/portrait-cutout.webp';
import portraitAvif from './assets/portrait-cutout.avif';
import depthPng from './assets/portrait-depth.png';
import depthWebp from './assets/portrait-depth.webp';

const root = document.documentElement;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

// Motion is enabled by default. Pass ?motion=off in URL to disable.
function resolveMotionPreference(): boolean {
  const forced = new URLSearchParams(window.location.search).get('motion');
  if (forced === 'off') return true;
  return false;
}

function buildFallbackPortrait(figure: HTMLElement): void {
  figure.innerHTML = `
    <picture>
      <source srcset="${portraitAvif}" type="image/avif" />
      <source srcset="${portraitWebp}" type="image/webp" />
      <img src="${portraitPng}" width="848" height="930" decoding="async"
           alt="Portrait of ${site.name}" />
    </picture>`;
}

function addScreenReaderDescription(): void {
  if (document.querySelector('.hero__portrait-desc')) return;
  const p = document.createElement('p');
  p.className = 'sr-only hero__portrait-desc';
  p.textContent = `Portrait of ${site.name}, ${site.tagline}.`;
  document.querySelector('.hero__inner')?.appendChild(p);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const dock = document.querySelector('.dock') as HTMLElement | null;
  const fallbackFigure = document.getElementById('portrait-fallback') as HTMLElement | null;

  if (dock) initDock(dock);

  const reducedMotion = resolveMotionPreference();
  if (reducedMotion) root.classList.add('reduced-motion');
  const mobile = isMobileLike();

  if (!canvas || !hasWebGL()) {
    root.classList.add('no-webgl');
    if (fallbackFigure) {
      buildFallbackPortrait(fallbackFigure);
      fallbackFigure.hidden = false;
    }
    return;
  }

  let scene: SceneManager;
  try {
    const [map, depth] = await Promise.all([
      loadTexture([portraitAvif, portraitWebp, portraitPng]),
      loadTexture([depthWebp, depthPng]),
    ]);

    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.needsUpdate = true;

    depth.colorSpace = THREE.NoColorSpace;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    depth.generateMipmaps = false;
    depth.needsUpdate = true;

    scene = new SceneManager(
      canvas,
      {
        portraitMap: map,
        portraitDepth: depth,
        portraitAspect: 848 / 930,
      },
      { name: site.name, tokens, mobile, reducedMotion },
    );

    await scene.init();
  } catch (error) {
    console.warn('WebGL initialization failed, falling back to static layout.', error);
    root.classList.add('no-webgl');
    if (fallbackFigure) {
      buildFallbackPortrait(fallbackFigure);
      fallbackFigure.hidden = false;
    }
    return;
  }

  root.classList.add('webgl');
  addScreenReaderDescription();

  if (fallbackFigure) fallbackFigure.remove();

  const tilt = new TiltController();
  tilt.attach();

  const requestOrientation = () => {
    void tilt.requestOrientationPermission();
  };
  window.addEventListener('pointerdown', requestOrientation, { once: true });
  window.addEventListener('touchstart', requestOrientation, { once: true });

  if (reducedMotion) {
    scene.applyTilt(0, 0);
    return;
  }

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tilt.update(dt);
    scene.applyTilt(tilt.valueX, tilt.valueY);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => scene.resize(), 120);
  };
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scene.stop();
    } else {
      last = performance.now();
      scene.start();
    }
  });

  scene.start();
}

void boot();
