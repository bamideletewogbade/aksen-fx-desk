import { login } from '@/server/auth';
import { body, publicRoute, rateLimit, setSessionCookie } from '@/server/http';
import { loginSchema } from '@/server/schemas';

export const POST = publicRoute(async ({ req, db }) => {
  await rateLimit('login', 10);
  const input = await body(req, loginSchema);
  const { token, expiresAt } = await login(db, { ...input, userAgent: req.headers.get('user-agent') });
  await setSessionCookie(token, expiresAt);
  return { ok: true };
});
