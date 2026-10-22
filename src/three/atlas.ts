import * as THREE from 'three';

// Texture atlas generator for background token particles
export interface AtlasEntry {
  /** u0, vTop, u1, vBottom (texture space, v measured from the canvas top). */
  uv: [number, number, number, number];
  /** width / height of the glyph in world units. */
  aspect: number;
}

export interface TokenAtlas {
  texture: THREE.Texture;
  entries: AtlasEntry[];
  /** Aspect ratio (w/h) of the whole atlas canvas. */
  aspect: number;
}

const ATLAS_WIDTH = 2048;
const WORD_HEIGHT = 60;
const FONT_SIZE = 36;
const PAD_X = 16;
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

type DrawFn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) => void;

interface Item {
  width: number;
  height: number;
  draw: DrawFn;
  /** Filled in by the packer. */
  __y: number;
}

// Procedural glyphs
const drawDescentCurve: DrawFn = (ctx, x, y, w, h) => {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x + t * w;
    const py = y + h - (0.88 * Math.pow(1 - t, 1.8) + 0.05) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(x + w * 0.97, y + h - 0.06 * h, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawLossCurve: DrawFn = (ctx, x, y, w, h) => {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const steps = 52;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const noise = (Math.sin(i * 2.7) + Math.sin(i * 1.13)) * 0.05;
    const v = 0.82 * Math.exp(-t * 2.1) + noise;
    const px = x + t * w;
    const py = y + h - Math.max(0.06, Math.min(0.97, v)) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  ctx.restore();
};

export function buildTokenAtlas(
  words: readonly string[],
  extras: Record<string, DrawFn>,
): TokenAtlas {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.font = `600 ${FONT_SIZE}px ${MONO}`;

  const items: Item[] = words.map((word) => {
    const w = Math.ceil(ctx.measureText(word).width) + PAD_X * 2;
    return {
      width: w,
      height: WORD_HEIGHT,
      __y: 0,
      draw: (c, x, y, _w, hh) => {
        c.save();
        c.font = `600 ${FONT_SIZE}px ${MONO}`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillStyle = '#ffffff';
        c.fillText(word, x + PAD_X, y + hh / 2);
        c.restore();
      },
    };
  });

  const graphicSizes: Record<string, [number, number]> = {
    descentCurve: [210, 104],
    lossCurve: [210, 104],
  };

  for (const [name, draw] of Object.entries(extras)) {
    const [width, height] = graphicSizes[name] ?? [180, 100];
    items.push({ width, height, __y: 0, draw });
  }

  // --- shelf pack with variable row heights --------------------------------
  type Row = { items: Array<{ item: Item; x: number }>; height: number };
  const rows: Row[] = [];
  let current: Row = { items: [], height: 0 };
  let cursorX = 0;

  for (const item of items) {
    if (cursorX + item.width > ATLAS_WIDTH && current.items.length > 0) {
      rows.push(current);
      current = { items: [], height: 0 };
      cursorX = 0;
    }
    current.items.push({ item, x: cursorX });
    current.height = Math.max(current.height, item.height);
    cursorX += item.width;
  }
  if (current.items.length) rows.push(current);

  // Vertical offsets
  let cursorY = 0;
  for (const row of rows) {
    row.items.forEach(({ item }) => {
      item.__y = cursorY + (row.height - item.height) / 2;
    });
    cursorY += row.height;
  }

  const atlasHeight = Math.max(WORD_HEIGHT, cursorY);
  canvas.width = ATLAS_WIDTH;
  canvas.height = atlasHeight;

  const ctx2 = canvas.getContext('2d');
  if (!ctx2) throw new Error('2D canvas context unavailable');
  ctx2.clearRect(0, 0, canvas.width, canvas.height);

  const entries: AtlasEntry[] = [];
  for (const row of rows) {
    for (const { item, x } of row.items) {
      item.draw(ctx2, x, item.__y, item.width, item.height);      entries.push({
        uv: [x / ATLAS_WIDTH, item.__y / atlasHeight, (x + item.width) / ATLAS_WIDTH, (item.__y + item.height) / atlasHeight],
        aspect: item.width / item.height,
      });
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return { texture, entries, aspect: ATLAS_WIDTH / atlasHeight };
}

export const extraGlyphs: Record<string, DrawFn> = {
  descentCurve: drawDescentCurve,
  lossCurve: drawLossCurve,
};
