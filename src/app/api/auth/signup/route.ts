import { openSession, signup } from '@/server/auth';
import { body, publicRoute, rateLimit, setSessionCookie } from '@/server/http';
import { signupSchema } from '@/server/schemas';

export const POST = publicRoute(async ({ req, db }) => {
  await rateLimit('signup', 5);
  const input = await body(req, signupSchema);
  const { orgId, userId } = await signup(db, input);
  const { token, expiresAt } = await openSession(db, userId, orgId, req.headers.get('user-agent'));
  await setSessionCookie(token, expiresAt);
  return { ok: true };
});
