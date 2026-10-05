import { body, deskRoute } from '@/server/http';
import { floatSchema, railSchema } from '@/server/schemas';
import { adjustFloat, listRails, saveRail } from '@/server/desk';

type P = { id: string };

export const PUT = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const i = await body(req, railSchema);
  await saveRail(db, ctx, { ...i, id: params.id, dailySoftCapMinor: i.dailySoftCap ?? null, lowBalanceMinor: i.lowBalance ?? null });
  return { rails: await listRails(db, ctx) };
});

/** Float movements: top-up, withdrawal, or transfer to another account. */
export const POST = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const i = await body(req, floatSchema);
  await adjustFloat(db, ctx, { railId: params.id, amountMinor: i.amount, direction: i.direction, toRailId: i.toRailId ?? null, memo: i.memo });
  return { rails: await listRails(db, ctx) };
});
