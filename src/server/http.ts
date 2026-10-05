import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getDb, type Db } from './db';
import { resolveSession, SESSION_TTL_DAYS, type Ctx } from './auth';
import { DomainError, fail } from './errors';
import { clerkCtx } from './clerk';

export const SESSION_COOKIE = 'aksen_sid';

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Desk session from the built-in cookie first, then from a Clerk sign-in. */
async function resolveCtx(db: Db): Promise<Ctx | null> {
  const token = await sessionToken();
  const legacy = token ? await resolveSession(db, token) : null;
  return legacy ?? (await clerkCtx(db));
}

/** The signed-in operator, or null. Safe to call from server components and route handlers. */
export async function getCtx(): Promise<Ctx | null> {
  return resolveCtx(await getDb());
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

// ---------------- rate limiting (per instance; use a shared store when scaling out) ----------------

type Bucket = { tokens: number; at: number };
const g = globalThis as typeof globalThis & { __aksenBuckets?: Map<string, Bucket> };
const buckets = (g.__aksenBuckets ??= new Map());

export async function rateLimit(name: string, perMinute: number) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  const key = `${name}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) fail('RATE_LIMITED', 'Too many requests. Wait a minute and try again.');
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.at > 600_000) buckets.delete(k);
}

// ---------------- handler wrapper ----------------

async function checkOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return; // same-origin fetches from some browsers omit it; cookies are SameSite=Lax
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host || new URL(origin).host !== host) fail('FORBIDDEN', 'Cross-site request blocked.');
}

export function errorResponse(e: unknown) {
  if (e instanceof DomainError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const field = first?.path?.join('.');
    return NextResponse.json(
      { error: { code: 'INVALID', message: first ? `${field ? `${field}: ` : ''}${first.message}` : 'Invalid request.', details: { issues: e.issues } } },
      { status: 422 },
    );
  }
  console.error('[aksen] unhandled error', e);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Nothing was changed; try again.' } }, { status: 500 });
}

type Handler<P> = (args: { req: Request; db: Db; params: P }) => Promise<Response | unknown>;
type AuthedHandler<P> = (args: { req: Request; db: Db; ctx: Ctx; params: P }) => Promise<Response | unknown>;

function toResponse(result: unknown) {
  if (result instanceof Response) return result;
  return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Public endpoint (customer links, sign in, demo requests). */
export function publicRoute<P = Record<string, string>>(fn: Handler<P>) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      await checkOrigin(req);
      const db = await getDb();
      return toResponse(await fn({ req, db, params: await context.params }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Operator endpoint: requires a valid session; the desk comes from the session, never the request. */
export function deskRoute<P = Record<string, string>>(fn: AuthedHandler<P>) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      await checkOrigin(req);
      const db = await getDb();
      const ctx = await resolveCtx(db);
      if (!ctx) fail('UNAUTHENTICATED', 'Your session has ended. Sign in again.');
      return toResponse(await fn({ req, db, ctx: ctx!, params: await context.params }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    fail('INVALID', 'Request body must be JSON.');
  }
  return schema.parse(raw);
}

export function query(req: Request) {
  return new URL(req.url).searchParams;
}
