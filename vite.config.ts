import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import site from './src/site.json';


const icons = {
  telegram:
    '<path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4" />',
  github:
    '<path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />',
  linkedin:
    '<path d="M8 11v5" /><path d="M8 8v.01" /><path d="M12 16v-5" /><path d="M16 16v-3a2 2 0 1 0 -4 0" /><path d="M3 7a4 4 0 0 1 4 -4h10a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4l0 -10" />',
};

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function dockMarkup(): string {
  const items: Array<{ key: keyof typeof site.links; label: string }> = [
    { key: 'telegram', label: 'Telegram' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'github', label: 'GitHub' },
  ];

  const buttons = items
    .map(
      ({ key, label }) => `
        <a class="dock__btn" href="${escapeHtml(site.links[key])}" target="_blank" rel="noopener noreferrer"
           aria-label="${label} — opens in a new tab" data-magnetic data-label="${label}">
          ${svg(icons[key])}
          <span class="dock__tip" aria-hidden="true">${label}</span>
        </a>`,
    )
    .join('');

  return `<nav class="dock" aria-label="Social links">
        <div class="dock__pill">
          ${buttons}
        </div>
      </nav>`;
}

function copyMarkup(): string {
  const availability = site.available
    ? `<span class="status" aria-label="Available for new work">
         <span class="status__dot" aria-hidden="true"></span>
         <span class="status__text">Available</span>
       </span>`
    : '';

  const nicknameBadge = (site as Record<string, unknown>).nickname
    ? `<span class="hero__nickname" aria-label="Nickname: ${(site as Record<string, unknown>).nickname}">“${escapeHtml(String((site as Record<string, unknown>).nickname))}”</span>`
    : '';

  return `<header class="hero__copy">
        <p class="eyebrow">
          <span class="eyebrow__rule" aria-hidden="true"></span>
          ${escapeHtml(site.tagline)}
          ${availability}
        </p>
        <h1 class="hero__title">${escapeHtml(site.name)}${nicknameBadge ? ` <span class="hero__alias">${nicknameBadge}</span>` : ''}</h1>
        <p class="hero__line">${escapeHtml(site.shortLine)}</p>
      </header>`;
}

function seoMarkup(): string {
  const title = (site as Record<string, unknown>).nickname
    ? `${site.name} (${(site as Record<string, unknown>).nickname}) — ${site.tagline}`
    : `${site.name} — ${site.tagline}`;
  const description = site.shortLine;
  const url = site.url.replace(/\/$/, '');

  return `
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="author" content="${escapeHtml(site.name)}" />
    <link rel="canonical" href="${escapeHtml(url)}/" />

    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="${escapeHtml(site.name)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}/" />
    <meta property="og:image" content="${escapeHtml(url)}/media/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(`${site.name} — ${site.tagline}`)}" />
    <meta property="profile:first_name" content="${escapeHtml(site.name.split(' ')[0])}" />
    <meta property="profile:last_name" content="${escapeHtml(site.name.split(' ').slice(1).join(' '))}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(url)}/media/og-image.jpg" />`;
}

function jsonLdContent(): string {
  const url = site.url.replace(/\/$/, '');
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    ...((site as Record<string, unknown>).nickname ? { alternateName: (site as Record<string, unknown>).nickname } : {}),
    jobTitle: site.tagline,
    description: site.shortLine,
    url: `${url}/`,
    image: `${url}/media/og-image.jpg`,
    sameAs: [site.links.telegram, site.links.linkedin, site.links.github],
    knowsAbout: [
      'Computer Vision',
      'Machine Learning',
      'Deep Learning',
      'Neural Networks',
      'Object Detection & Segmentation',
      'Image Processing & OpenCV',
      'PyTorch & ONNX',
      'MLOps',
    ],
    ...(site.available ? { availableForWork: true } : {}),
  };

  return JSON.stringify(data);
}

function jsonLdMarkup(): string {
  return `<script type="application/ld+json">${jsonLdContent()}</script>`;
}

// Cloudflare security and caching headers
function headersFile(): string {
  const hash = createHash('sha256').update(jsonLdContent()).digest('base64');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${hash}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  return `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(self), camera=(), geolocation=(), gyroscope=(self), magnetometer=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Robots-Tag: index, follow
  Content-Security-Policy: ${csp}

/assets/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=31536000, immutable

/media/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

/favicon.svg
  Cache-Control: public, max-age=604800

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/404.html
  Cache-Control: public, max-age=0, must-revalidate
`;
}

function sitePlugin(): Plugin {
  return {
    name: 'personal-site-seo',
    transformIndexHtml(html) {
      return html
        .replace('<!--@SEO-->', seoMarkup())
        .replace('<!--@JSONLD-->', jsonLdMarkup())
        .replace('<!--@COPY-->', copyMarkup())
        .replace('<!--@DOCK-->', dockMarkup())
        .replace(/__TITLE__/g, escapeHtml(site.name));
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}

export default defineConfig({
  plugins: [sitePlugin()],
  build: {
    target: 'es2020',
    cssTarget: 'chrome90',
    sourcemap: false,
    assetsInlineLimit: 4096,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/@fontsource')) return 'fonts';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
