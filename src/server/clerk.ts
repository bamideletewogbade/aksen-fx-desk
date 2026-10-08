import 'server-only';
import type { Db } from './db';
import { ctxForClerkUser, linkClerkUser, type Ctx } from './auth';

/**
 * Bridge from a Clerk sign-in to an Aksen desk session.
 *
 * Clerk is optional: without its keys the app keeps working with the built-in
 * password sessions (tests, scripts and the sample desk still use them).
 */

export function clerkEnabled(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

async function clerkAuth(): Promise<{ userId: string; sessionId: string | null } | null> {
  if (!clerkEnabled()) return null;
  try {
    const { auth } = await import('@clerk/nextjs/server');
    const a = await auth();
    return a.userId ? { userId: a.userId, sessionId: a.sessionId ?? null } : null;
  } catch {
    // Routes the middleware did not run on (or a broken Clerk session) are simply signed out.
    return null;
  }
}

/** The person Clerk says is signed in, linked to (or created as) a local user. Null when signed out. */
export async function clerkPerson(db: Db): Promise<{ userId: string; email: string; name: string; clerkUserId: string; clerkSessionId: string | null } | null> {
  const a = await clerkAuth();
  if (!a) return null;
  const [known] = await db.query<{ id: string; email: string; name: string }>('SELECT id, email, name FROM users WHERE clerk_user_id = $1', [a.userId]);
  if (known) return { userId: known.id, email: known.email, name: known.name, clerkUserId: a.userId, clerkSessionId: a.sessionId };
  const { currentUser } = await import('@clerk/nextjs/server');
  const u = await currentUser();
  if (!u) return null;
  const primary = u.emailAddresses.find((e: { id: string }) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
  const linked = await linkClerkUser(db, {
    clerkUserId: a.userId,
    email: primary?.emailAddress ?? null,
    emailVerified: primary?.verification?.status === 'verified',
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '',
  });
  return { ...linked, clerkUserId: a.userId, clerkSessionId: a.sessionId };
}

/** Desk session for a Clerk sign-in, or null (signed out, or signed in without a desk yet). */
export async function clerkCtx(db: Db): Promise<Ctx | null> {
  const a = await clerkAuth();
  if (!a) return null;
  const ctx = await ctxForClerkUser(db, a.userId, a.sessionId);
  if (ctx) return ctx;
  const person = await clerkPerson(db);
  return person ? ctxForClerkUser(db, a.userId, a.sessionId) : null;
}

/** True when someone is signed in to Clerk, whether or not they have a desk yet. */
export async function clerkSignedIn(): Promise<boolean> {
  return Boolean(await clerkAuth());
}
