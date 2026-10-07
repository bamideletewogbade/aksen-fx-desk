import { z } from 'zod';
import { body, deskRoute } from '@/server/http';
import { retrySusuSms, setSusuSmsEnabled, susuSmsOverview } from '@/server/susu-sms';
import { sendSusuSmsAfterResponse } from '@/server/susu-sms-after';

export const GET = deskRoute(async ({db,ctx}) => susuSmsOverview(db,ctx));
export const POST = deskRoute(async ({req,db,ctx}) => {
  const input = await body(req,z.union([z.object({enabled:z.boolean()}),z.object({retryId:z.string().uuid()})]));
  if ('enabled' in input) await setSusuSmsEnabled(db,ctx,input.enabled);
  else await retrySusuSms(db,ctx,input.retryId);
  sendSusuSmsAfterResponse(db,ctx.orgId);
  return susuSmsOverview(db,ctx);
});
