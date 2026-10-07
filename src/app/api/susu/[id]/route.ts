import { body, deskRoute } from '@/server/http';
import { collectSchema, saverSchema, withdrawSchema } from '@/server/schemas';
import { getSaver, recordCollection, saveSaver, withdraw } from '@/server/susu';
import { z } from 'zod';

type P = { id: string };

export const GET = deskRoute<P>(async ({ db, ctx, params }) => getSaver(db, ctx, params.id));

export const PUT = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const i = await body(req, saverSchema);
  const res = await saveSaver(db, ctx, { id: params.id, name: i.name, phone: i.phone, dailyMinor: i.daily, notes: i.notes, status: i.status, smsEnabled: i.smsEnabled });
  return { ...(await getSaver(db, ctx, params.id)), dailyChange: res.dailyChange };
});

/** Booklet actions: record a collection, or withdraw everything now. */
const action = z.discriminatedUnion('action', [
  collectSchema.extend({ action: z.literal('collect') }),
  withdrawSchema.extend({ action: z.literal('withdraw') }),
]);

export const POST = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const a = await body(req, action);
  const result = a.action === 'collect'
    ? await recordCollection(db, ctx, { saverId: params.id, amountMinor: a.amount, note: a.note, requestId: a.requestId })
    : await withdraw(db, ctx, { saverId: params.id, method: a.method, reference: a.reference });
  return { result, ...(await getSaver(db, ctx, params.id)) };
});
