import * as THREE from 'three';

/**
 * Loads the first URL that decodes successfully. Used for the portrait so we
 * can ship AVIF → WebP → PNG without a build-time format negotiation.
 */
export function loadTexture(urls: readonly string[]): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    let index = 0;

    const attempt = () => {
      if (index >= urls.length) {
        reject(new Error(`Could not load any of: ${urls.join(', ')}`));
        return;
      }
      const url = urls[index++];
      new THREE.TextureLoader().load(
        url,
        (texture) => resolve(texture),
        undefined,
        () => attempt(),
      );
    };

    attempt();
  });
}

/** Small helper: build a soft radial sprite texture (used for nodes & particles). */
export function createRadialSprite(
  size = 64,
  inner = 'rgba(255,255,255,1)',
  outer = 'rgba(255,255,255,0)',
  power = 1,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(Math.min(0.9, 0.35 * power), 'rgba(255,255,255,0.35)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Deterministic pseudo-random generator so the layout is stable across reloads. */
export function makeRandom(seed = 1337): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
