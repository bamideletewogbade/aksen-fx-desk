import { body, deskRoute } from '@/server/http';
import { customerSchema } from '@/server/schemas';
import { getCustomer, saveCustomer } from '@/server/desk';
import { listTrades } from '@/server/trades';

type P = { id: string };

export const GET = deskRoute<P>(async ({ db, ctx, params }) => ({
  customer: await getCustomer(db, ctx, params.id),
  trades: await listTrades(db, ctx, { customerId: params.id, limit: 100 }),
}));

export const PUT = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const input = await body(req, customerSchema);
  await saveCustomer(db, ctx, { ...input, id: params.id, perTradeLimitNgn: input.perTradeLimitNgn ?? null });
  return { customer: await getCustomer(db, ctx, params.id) };
});
