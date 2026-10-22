#!/usr/bin/env node
/**
 * Lighthouse audit (mobile + desktop) against a running preview server.
 *
 *   node scripts/lighthouse.mjs [url]
 */

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = process.argv[2] ?? 'http://localhost:4173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const chrome = await launch({
  chromePath: CHROME,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const configs = [
  { name: 'mobile', options: { formFactor: 'mobile', screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } } },
  { name: 'desktop', options: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false } } },
];

try {
  for (const { name, options } of configs) {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: ['json'],
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      ...options,
    });

    const lhr = runnerResult.lhr;
    console.log(`\n=== ${name} — ${url} ===`);
    for (const [id, cat] of Object.entries(lhr.categories)) {
      console.log(`  ${cat.title.padEnd(16)} ${Math.round(cat.score * 100)}`);
    }

    const a = lhr.audits;
    const metric = (id) => a[id]?.displayValue ?? '—';
    console.log(`  FCP              ${metric('first-contentful-paint')}`);
    console.log(`  LCP              ${metric('largest-contentful-paint')}`);
    console.log(`  TBT              ${metric('total-blocking-time')}`);
    console.log(`  CLS              ${metric('cumulative-layout-shift')}`);
    console.log(`  Speed Index      ${metric('speed-index')}`);

    const problems = Object.values(a)
      .filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === 'binary')
      .map((x) => `    - ${x.id}: ${x.title}`);
    if (problems.length) {
      console.log('  failing audits:');
      for (const p of problems) console.log(p);
    }
  }
} finally {
  await chrome.kill();
}
