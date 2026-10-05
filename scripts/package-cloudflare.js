const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'cloudflare-app');

console.log('Packaging Next.js static build for Cloudflare Pages...');

// Clean and create target directory
if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
}
fs.mkdirSync(target, { recursive: true });

// 1. Copy public directory
const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, target, { recursive: true });
  console.log('✓ Copied public assets');
}

// 2. Copy .next/static to _next/static
const nextStatic = path.join(root, '.next', 'static');
const targetNextStatic = path.join(target, '_next', 'static');
if (fs.existsSync(nextStatic)) {
  fs.mkdirSync(path.dirname(targetNextStatic), { recursive: true });
  fs.cpSync(nextStatic, targetNextStatic, { recursive: true });
  console.log('✓ Copied .next/static chunks');
}

// 3. Copy prerendered HTML pages
const serverAppDir = path.join(root, '.next', 'server', 'app');
const pages = ['index', 'desk', 'login', 'settings', 'analytics', 'history', 'treasury', 'whatsapp', 'syndicates', '_not-found'];

pages.forEach(p => {
  const srcHtml = path.join(serverAppDir, `${p}.html`);
  if (fs.existsSync(srcHtml)) {
    if (p === 'index') {
      fs.copyFileSync(srcHtml, path.join(target, 'index.html'));
    } else if (p === '_not-found') {
      fs.copyFileSync(srcHtml, path.join(target, '404.html'));
    } else {
      fs.copyFileSync(srcHtml, path.join(target, `${p}.html`));
      const subDir = path.join(target, p);
      fs.mkdirSync(subDir, { recursive: true });
      fs.copyFileSync(srcHtml, path.join(subDir, 'index.html'));
    }
    console.log(`✓ Copied ${p} route`);
  } else {
    console.warn(`! Warning: ${srcHtml} not found`);
  }
});

// Also create 200.html as fallback for client-side routing if requested
const indexHtml = path.join(target, 'index.html');
if (fs.existsSync(indexHtml)) {
  fs.copyFileSync(indexHtml, path.join(target, '200.html'));
}

console.log('✨ Cloudflare package ready at cloudflare-app/');
