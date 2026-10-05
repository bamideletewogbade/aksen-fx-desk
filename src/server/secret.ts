import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

let cached: string | null = null;

/**
 * Server secret used to sign customer trade links.
 * Production requires APP_SECRET (32+ chars). Development generates one into
 * .data/dev-secret so links survive restarts.
 */
export function appSecret(): string {
  if (cached) return cached;
  const env = process.env.APP_SECRET;
  if (env && env.length >= 32) return (cached = env);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_SECRET must be set to at least 32 characters in production.');
  }
  const dir = path.join(process.cwd(), '.data');
  const file = path.join(dir, 'dev-secret');
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64url'));
  }
  return (cached = readFileSync(file, 'utf8').trim());
}

export function hmac(input: string, bytes = 18): string {
  return createHmac('sha256', appSecret()).update(input).digest().subarray(0, bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
