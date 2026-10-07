/**
 * Builds and deploys the app to Cloudflare Workers from a clean copy of the
 * source, so that local secrets in .env.local are never compiled into the
 * Worker (OpenNext bundles .env* files) and the running dev server's .next
 * folder is left alone.
 *
 *   node scripts/deploy-cloudflare.mjs
 *
 * Only NEXT_PUBLIC_* values are read from .env.local (they are public and
 * must be present at build time). Runtime secrets live in Cloudflare:
 *   npx wrangler secret put DATABASE_URL   (and APP_SECRET, CLERK_SECRET_KEY, ...)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(tmpdir(), 'aksen-otc-cloudflare-build');
const skip = new Set(['node_modules', '.next', '.open-next', '.wrangler', '.data', '.audit', '.git', 'cloudflare-app', 'coverage']);

console.log(`Copying source to ${out}`);
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(root, out, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(root, src);
    const top = rel.split(path.sep)[0];
    if (skip.has(top) || top.startsWith('.next-')) return false;
    const base = path.basename(src);
    return !(base.startsWith('.env') && base !== '.env.example') && !base.startsWith('.dev.vars');
  },
});

// A flat node_modules (no symlinks) in the build copy: OpenNext can't read pnpm's linked layout on Windows.
const ws = path.join(out, 'pnpm-workspace.yaml');
writeFileSync(ws, `${existsSync(ws) ? readFileSync(ws, 'utf8').trimEnd() + '\n' : ''}nodeLinker: hoisted\n`);

const publicEnv = {};
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) publicEnv[m[1]] = m[2];
  }
}
console.log(`Public build values: ${Object.keys(publicEnv).join(', ') || 'none'}`);

const env = { ...process.env, ...publicEnv, NEXT_TELEMETRY_DISABLED: '1' };
for (const k of Object.keys(env)) if (/^(DATABASE_URL|TWILIO_|CLERK_SECRET|OPENROUTER_API_KEY|APP_SECRET|DINEROYARD_|ARKESEL_|SUSU_SMS_)/.test(k)) delete env[k];
const run = (cmd) => execSync(cmd, { cwd: out, stdio: 'inherit', env });

run('pnpm install --frozen-lockfile --config.confirmModulesPurge=false');
run('npx opennextjs-cloudflare build');
if (process.argv.includes('--build-only')) process.exit(0);
run('npx opennextjs-cloudflare deploy');
