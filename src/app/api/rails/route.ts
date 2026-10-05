import { body, deskRoute, query } from '@/server/http';
import { railSchema } from '@/server/schemas';
import { listRails, saveRail } from '@/server/desk';

export const GET = deskRoute(async ({ req, db, ctx }) => ({ rails: await listRails(db, ctx, { includeArchived: query(req).get('archived') === '1' }) }));

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const i = await body(req, railSchema);
  await saveRail(db, ctx, { ...i, dailySoftCapMinor: i.dailySoftCap ?? null, lowBalanceMinor: i.lowBalance ?? null, openingBalanceMinor: i.openingBalance ?? 0 });
  return { rails: await listRails(db, ctx) };
});
