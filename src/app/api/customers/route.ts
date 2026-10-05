import { body, deskRoute, query } from '@/server/http';
import { customerSchema } from '@/server/schemas';
import { getCustomer, listCustomers, saveCustomer } from '@/server/desk';

export const GET = deskRoute(async ({ req, db, ctx }) => ({ customers: await listCustomers(db, ctx, query(req).get('q') ?? undefined) }));

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(req, customerSchema);
  const id = await saveCustomer(db, ctx, { ...input, perTradeLimitNgn: input.perTradeLimitNgn ?? null });
  return { customer: await getCustomer(db, ctx, id) };
});
