import { body, deskRoute, query } from '@/server/http';
import { quoteSchema } from '@/server/schemas';
import { createQuote, listTrades, queueCounts } from '@/server/trades';
import { attachQuoteToChat, customerForChat } from '@/server/inbox';
import { fail } from '@/server/errors';
import type { TradeStatus } from '@/lib/trades';
import type { Corridor } from '@/lib/money';

export const GET = deskRoute(async ({ req, db, ctx }) => {
  const q = query(req);
  const status = q.get('status');
  const trades = await listTrades(db, ctx, {
    status: status === 'OPEN' || status === 'ALL' ? status : status ? (status.split(',') as TradeStatus[]) : 'ALL',
    q: q.get('q') ?? undefined,
    customerId: q.get('customerId') ?? undefined,
    corridor: (q.get('corridor') as Corridor) || undefined,
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
    limit: Number(q.get('limit') ?? 200),
  });
  const counts = q.get('counts') ? await queueCounts(db, ctx) : undefined;
  return { trades, counts, at: new Date().toISOString() };
});

/**
 * A quote raised by a person. Usually from inside a chat they have taken over
 * (conversationId), in which case it is linked to that chat and the customer
 * gets the confirmation there; otherwise for a phone or walk-in customer.
 */
export const POST = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(req, quoteSchema);
  const customerId = input.customerId ?? (input.conversationId ? await customerForChat(db, ctx, input.conversationId) : null);
  if (!customerId) fail('INVALID', 'Choose a customer first.');
  const res = await createQuote(db, ctx, {
    customerId: customerId!,
    corridor: input.corridor,
    mode: input.mode,
    amountMinor: input.amount,
    customRate: input.customRate ?? null,
    feeMinor: input.fee ?? null,
    ttlMinutes: input.ttlMinutes ?? null,
    beneficiary: input.beneficiary ?? null,
    note: input.note ?? null,
  });
  if (input.conversationId) await attachQuoteToChat(db, ctx, res.id, input.conversationId);
  return { ...res, portalPath: `/t/${res.token}` };
});
