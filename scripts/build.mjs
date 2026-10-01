import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve('dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy primary assets
copyFileSync('fx-swap-desk-demo.html', resolve(distDir, 'index.html'));
copyFileSync('fx-swap-desk-demo.html', resolve(distDir, 'fx-swap-desk-demo.html'));

if (existsSync('tnell-order-desk-demo.html')) {
  copyFileSync('tnell-order-desk-demo.html', resolve(distDir, 'tnell-order-desk-demo.html'));
}
if (existsSync('pipeline.html')) {
  copyFileSync('pipeline.html', resolve(distDir, 'pipeline.html'));
}

// Security and caching headers for Cloudflare Assets
const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Access-Control-Allow-Origin: *
`;

writeFileSync(resolve(distDir, '_headers'), headers);

console.log('Build complete: dist/ successfully populated with index.html, fx-swap-desk-demo.html, tnell-order-desk-demo.html, pipeline.html');
