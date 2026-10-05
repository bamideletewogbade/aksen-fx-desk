import 'server-only';
import { redirect } from 'next/navigation';
import { getCtx } from './http';
import { clerkSignedIn } from './clerk';
import type { Session } from '@/lib/auth';

/**
 * For operator pages: returns the session, sends a signed-in person without a
 * desk to onboarding, or sends the visitor to sign in.
 */
export async function requireSession(next: string): Promise<Session> {
  const ctx = await getCtx();
  if (!ctx) {
    if (await clerkSignedIn()) redirect('/onboarding');
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const { sessionId: _s, ...session } = ctx!;
  return session;
}
