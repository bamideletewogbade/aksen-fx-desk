import { deskRoute, rateLimit } from '@/server/http';
import { deskBrief } from '@/server/brief';

export const POST = deskRoute(async ({ db, ctx }) => {
  await rateLimit(`brief:${ctx.orgId}`, 6);
  return { brief: await deskBrief(db, ctx) };
});
