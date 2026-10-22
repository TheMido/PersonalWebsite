#!/usr/bin/env node
// Sync font files to public/fonts for local static serving
// Usage: node scripts/sync-fonts.mjs

import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'fonts');

const FONTS = [
  ['@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2', 'space-grotesk-latin-400-normal.woff2'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2', 'space-grotesk-latin-500-normal.woff2'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2', 'space-grotesk-latin-700-normal.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2'],
  ['@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'jetbrains-mono-latin-500-normal.woff2'],
];

await mkdir(outDir, { recursive: true });

let copied = 0;
for (const [from, to] of FONTS) {
  const source = path.join(root, 'node_modules', from);
  if (!existsSync(source)) {
    console.warn(`! missing ${from} — run "npm install" first`);
    continue;
  }
  await copyFile(source, path.join(outDir, to));
  copied++;
}

console.log(`synced ${copied}/${FONTS.length} font files -> public/fonts/`);
