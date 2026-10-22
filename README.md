# Mohammad Taheri (Mido) — Personal Website

Interactive portfolio website showcasing Computer Vision and Machine Learning engineering work.

Built with TypeScript, Three.js, and Vite. Designed for deployment on Cloudflare Pages / Workers with custom domain support.

## Features

- **2.5D Depth-Displaced Portrait**: Real-time vertex displacement and normal estimation driven by neural depth maps.
- **Interactive 3D Scene**: Procedural neural network structure, equatorial loss halo, and floating ML token stream responsive to pointer and gyroscope tilt.
- **Performance Optimized**: Sub-second load times with self-hosted fonts, responsive pixel ratio scaling, and lightweight assets.
- **Hardened Security**: Strict Content Security Policy (CSP) with JSON-LD SHA-256 integrity, HSTS, anti-clickjacking frame guards, and isolated permissions policy.

## Tech Stack

- **Core**: TypeScript, Three.js, Vite
- **Styling**: Vanilla CSS (Dark mode design system)
- **Deployment**: Cloudflare Pages / Workers static assets

## Getting Started

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Deployment

Deploy directly to Cloudflare Pages or Cloudflare Workers:

```bash
# Deploy with Wrangler
npm run deploy
```

## License

MIT
