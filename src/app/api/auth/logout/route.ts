import { logout } from '@/server/auth';
import { clearSessionCookie, publicRoute, sessionToken } from '@/server/http';

export const POST = publicRoute(async ({ db }) => {
  await logout(db, await sessionToken());
  await clearSessionCookie();
  return { ok: true };
});
