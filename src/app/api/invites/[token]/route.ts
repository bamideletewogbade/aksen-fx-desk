import { z } from 'zod';
import { acceptInvite, getInvite } from '@/server/auth';
import { fail } from '@/server/errors';
import { body, publicRoute, rateLimit, setSessionCookie } from '@/server/http';
import { clerkEnabled } from '@/server/clerk';

export const GET = publicRoute<{ token: string }>(async ({ db, params }) => {
  const invite = await getInvite(db, params.token);
  if (!invite) fail('EXPIRED', 'This invite link has expired or was already used. Ask your desk admin for a new one.');
  return { invite };
});

export const POST = publicRoute<{ token: string }>(async ({ req, db, params }) => {
  if (clerkEnabled()) fail('FORBIDDEN', 'Sign in and accept this invite from onboarding.');
  await rateLimit('invite', 10);
  const input = await body(req, z.object({ name: z.string().trim().min(2).max(80), password: z.string().min(1).max(200) }));
  const { token, expiresAt } = await acceptInvite(db, { token: params.token, ...input, userAgent: req.headers.get('user-agent') });
  await setSessionCookie(token, expiresAt);
  return { ok: true };
});
