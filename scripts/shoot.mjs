#!/usr/bin/env node
// Screenshot capture script
// Usage: node scripts/shoot.mjs [baseUrl] [outDir]

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.argv[2] ?? 'http://localhost:4173/';
const outDir = path.resolve(process.argv[3] ?? 'screenshots');

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900, dsf: 1 },
  { name: 'desktop-1920', width: 1920, height: 1080, dsf: 1 },
  { name: 'laptop-1280', width: 1280, height: 800, dsf: 1 },
  { name: 'tablet-834', width: 834, height: 1112, dsf: 1 },
  { name: 'mobile-375', width: 375, height: 667, dsf: 2, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, dsf: 2, mobile: true },
];

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function main() {
  await mkdir(outDir, { recursive: true });

  const executablePath = CHROME_PATHS.find((p) => existsSync(p));
  if (!executablePath) throw new Error('No local Chrome/Edge found.');

  const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });

  const errors = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      isMobile: Boolean(vp.mobile),
      hasTouch: Boolean(vp.mobile),
      reducedMotion: 'no-preference',
    });

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${vp.name}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`[${vp.name}] ${err.message}`));

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    await page.screenshot({ path: path.join(outDir, `${vp.name}.png`) });
    console.log(`  ${vp.name}  ${vp.width}x${vp.height}`);

    await context.close();
  }

  // Reduced-motion static variant
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, 'reduced-motion-1440.png') });
  console.log('  reduced-motion-1440');
  await context.close();

  await browser.close();

  if (errors.length) {
    console.log('\nconsole errors:');
    for (const e of errors) console.log('  ' + e);
    process.exitCode = 1;
  } else {
    console.log('\nno console errors.');
  }
}

await main();
