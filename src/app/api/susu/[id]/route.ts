import { body, deskRoute } from '@/server/http';
import { collectSchema, saverSchema, withdrawSchema } from '@/server/schemas';
import { getSaver, recordCollection, saveSaver, withdraw } from '@/server/susu';
import { sendSusuSmsAfterResponse } from '@/server/susu-sms-after';
import { z } from 'zod';

type P = { id: string };

export const GET = deskRoute<P>(async ({ db, ctx, params }) => getSaver(db, ctx, params.id));

export const PUT = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const i = await body(req, saverSchema);
  const res = await saveSaver(db, ctx, { id: params.id, name: i.name, phone: i.phone, dailyMinor: i.daily, notes: i.notes, status: i.status, smsEnabled: i.smsEnabled, smsAutoSend: i.smsAutoSend });
  sendSusuSmsAfterResponse(db, ctx.orgId);
  return { ...(await getSaver(db, ctx, params.id)), dailyChange: res.dailyChange };
});

/** Booklet actions: record a contribution or an early withdrawal. */
const action = z.discriminatedUnion('action', [
  collectSchema.extend({ action: z.literal('collect') }),
  withdrawSchema.extend({ action: z.literal('withdraw') }),
]);

export const POST = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const a = await body(req, action);
  let result;
  if (a.action === 'collect') {
    result = await recordCollection(db, ctx, { saverId: params.id, amountMinor: a.amount, note: a.note, requestId: a.requestId });
    sendSusuSmsAfterResponse(db, ctx.orgId);
  } else {
    result = await withdraw(db, ctx, { saverId: params.id, amountMinor: a.amount, method: a.method, reference: a.reference, requestId: a.requestId });
    sendSusuSmsAfterResponse(db, ctx.orgId);
  }
  return { result, ...(await getSaver(db, ctx, params.id)) };
});
