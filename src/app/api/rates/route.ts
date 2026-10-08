import { body, deskRoute } from '@/server/http';
import { rateSchema } from '@/server/schemas';
import { getRates, rateHistory, setRate } from '@/server/desk';

export const GET = deskRoute(async ({ db, ctx }) => ({ rates: await getRates(db, ctx), history: await rateHistory(db, ctx) }));

export const PUT = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(req, rateSchema);
  await setRate(db, ctx, {
    corridor: input.corridor,
    customerRate: input.customerRate,
  });
  return { rates: await getRates(db, ctx), history: await rateHistory(db, ctx) };
});
