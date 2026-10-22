#!/usr/bin/env node
/**
 * Build-time image optimisation.
 *
 *   src/assets/portrait-cutout.png   →  .webp + .avif  (alpha preserved)
 *   src/assets/portrait-depth.webp    →  .png fallback
 *   (generated)                       →  src/assets/grain.png
 *   public/media/og-image.jpg         →  1200×630 social card
 *
 * Run with:  npm run optimize:images
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'src', 'assets');
const media = path.join(root, 'public', 'media');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function optimisePortrait() {
  const master = path.join(assets, 'portrait-cutout.png');
  if (!existsSync(master)) {
    console.warn('! src/assets/portrait-cutout.png missing — run scripts/portrait_cutout.py first');
    return;
  }

  const input = await readFile(master);

  const webp = await sharp(input)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 95, effort: 6 })
    .toBuffer();
  await writeFile(path.join(assets, 'portrait-cutout.webp'), webp);
  console.log(`  portrait-cutout.webp  ${kb(webp.length)}`);

  try {
    const avif = await sharp(input)
      .resize({ width: 1200, withoutEnlargement: true })
      .avif({ quality: 62, effort: 6, chromaSubsampling: '4:4:4' })
      .toBuffer();
    await writeFile(path.join(assets, 'portrait-cutout.avif'), avif);
    console.log(`  portrait-cutout.avif  ${kb(avif.length)}`);
  } catch (error) {
    console.warn('! AVIF encoding unavailable:', error.message);
  }

  const depth = path.join(assets, 'portrait-depth.webp');
  if (existsSync(depth)) {
    // The depth map only feeds vertex displacement + normal estimation, so a
    // smaller, slightly smoothed version is indistinguishable and far lighter.
    const normalised = await sharp(await readFile(depth))
      .resize({ width: 512 })
      .blur(0.7)
      .toColourspace('b-w')
      .toBuffer();

    const webp = await sharp(normalised)
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    await writeFile(path.join(assets, 'portrait-depth.webp'), webp);
    console.log(`  portrait-depth.webp   ${kb(webp.length)}`);

    const png = await sharp(normalised)
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    await writeFile(path.join(assets, 'portrait-depth.png'), png);
    console.log(`  portrait-depth.png    ${kb(png.length)}`);
  }
}

/** Film grain: a small tileable RGBA noise patch. */
async function generateGrain() {
  const size = 128;
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(Math.random() * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const png = await sharp(data, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(assets, 'grain.png'), png);
  console.log(`  grain.png             ${kb(png.length)}`);
}

/** 1200×630 social card: dark gradient, outlined name, cut-out portrait. */
async function generateOgImage(site) {
  const width = 1200;
  const height = 630;

  // Embed the real typefaces so the card matches the site.
  const fonts = await embedFonts();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      ${fonts}
      <radialGradient id="glow" cx="50%" cy="42%" r="52%">
        <stop offset="0%" stop-color="#00e5ff" stop-opacity="0.30"/>
        <stop offset="45%" stop-color="#7c4dff" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#05060a" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#7defff"/>
        <stop offset="50%" stop-color="#00e5ff"/>
        <stop offset="100%" stop-color="#9d7bff"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#05060a"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <g stroke="#00e5ff" stroke-opacity="0.10" stroke-width="1">
      ${Array.from({ length: 19 }, (_, i) => `<line x1="${i * 68}" y1="0" x2="${i * 68}" y2="${height}"/>`).join('')}
      ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 68}" x2="${width}" y2="${i * 68}"/>`).join('')}
    </g>
    <text x="70" y="152" font-family="Space Grotesk" font-size="44" font-weight="700" fill="none" stroke="url(#stroke)" stroke-width="2.4" letter-spacing="-1">${escapeXml(site.name)}${site.nickname ? ` (${escapeXml(site.nickname)})` : ''}</text>
    <text x="70" y="212" font-family="JetBrains Mono" font-size="23" fill="#00e5ff" letter-spacing="4">${escapeXml(site.tagline.toUpperCase())}</text>
    <text x="70" y="300" font-family="Space Grotesk" font-size="24" fill="#8b93a7">${escapeXml(truncate(site.shortLine, 58))}</text>
    <g font-family="JetBrains Mono" font-size="20" fill="#f2f4f8" opacity="0.92">
      <text x="70" y="470">t.me/${escapeXml(site.links.telegram.split('/').pop())}</text>
      <text x="70" y="512">linkedin.com/in/${escapeXml(site.links.linkedin.split('/').pop())}</text>
      <text x="70" y="554">github.com/${escapeXml(site.links.github.split('/').pop())}</text>
    </g>
  </svg>`;

  const base = sharp(Buffer.from(svg));

  const portraitPath = path.join(assets, 'portrait-cutout.png');
  let pipeline = base;

  if (existsSync(portraitPath)) {
    const meta = await sharp(portraitPath).metadata();
    const targetHeight = 620;
    const targetWidth = Math.round((meta.width / meta.height) * targetHeight);
    const portrait = await sharp(portraitPath).resize({ height: targetHeight }).ensureAlpha().toBuffer();
    pipeline = sharp(await base.png().toBuffer()).composite([
      { input: portrait, left: width - targetWidth + 40, top: height - targetHeight },
    ]);
  }

  const jpeg = await pipeline.jpeg({ quality: 88, progressive: true }).toBuffer();
  await mkdir(media, { recursive: true });
  await writeFile(path.join(media, 'og-image.jpg'), jpeg);
  console.log(`  og-image.jpg          ${kb(jpeg.length)}`);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(value, max) {
  const text = String(value);
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** Embed the real typefaces as base64 so the card renders identically. */
async function embedFonts() {
  const families = [
    { file: 'SpaceGrotesk.ttf', family: 'Space Grotesk' },
    { file: 'JetBrainsMono.ttf', family: 'JetBrains Mono' },
  ];

  const blocks = [];
  for (const { file, family } of families) {
    const filePath = path.join(root, 'scripts', 'fonts', file);
    if (!existsSync(filePath)) continue;
    const base64 = (await readFile(filePath)).toString('base64');
    blocks.push(
      `<style>@font-face{font-family:'${family}';font-style:normal;font-weight:400 700;src:url(data:font/ttf;base64,${base64}) format('truetype');}</style>`,
    );
  }
  return blocks.join('');
}

const site = JSON.parse(await readFile(path.join(root, 'src', 'site.json'), 'utf8'));

await mkdir(assets, { recursive: true });
await mkdir(media, { recursive: true });

console.log('optimising images…');
await optimisePortrait();
await generateGrain();
await generateOgImage(site);
console.log('done.');
