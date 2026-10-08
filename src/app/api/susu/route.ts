import { body, deskRoute, query } from '@/server/http';
import { saverSchema } from '@/server/schemas';
import { listSavers, saveSaver, susuOverview } from '@/server/susu';
import { susuSmsPolicy } from '@/server/susu-sms';
import { sendSusuSmsAfterResponse } from '@/server/susu-sms-after';

export const GET = deskRoute(async ({ req, db, ctx }) => {
  const savers = await listSavers(db, ctx, query(req).get('q') ?? undefined);
  return { savers, overview: await susuOverview(db, ctx, query(req).get('q') ? undefined : savers), smsPolicy: await susuSmsPolicy(db, ctx) };
});

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const i = await body(req, saverSchema);
  const result = await saveSaver(db, ctx, { name: i.name, phone: i.phone, dailyMinor: i.daily, notes: i.notes, smsEnabled: i.smsEnabled, smsAutoSend: i.smsAutoSend });
  sendSusuSmsAfterResponse(db, ctx.orgId);
  return result;
});
