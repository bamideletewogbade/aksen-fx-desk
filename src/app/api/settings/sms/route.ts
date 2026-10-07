import { z } from 'zod';
import { body, deskRoute } from '@/server/http';
import { manageSusuSms, retrySusuSms, setSusuSmsEnabled, susuSmsOverview } from '@/server/susu-sms';
import { sendSusuSmsAfterResponse } from '@/server/susu-sms-after';

export const GET = deskRoute(async ({db,ctx}) => susuSmsOverview(db,ctx));
export const POST = deskRoute(async ({req,db,ctx}) => {
  const input = await body(req,z.union([
    z.object({enabled:z.boolean()}),
    z.object({retryId:z.string().uuid()}),
    z.object({messageId:z.string().uuid(),action:z.enum(['save','send','cancel']),message:z.string().trim().min(1).max(480).optional()}),
  ]));
  if ('enabled' in input) await setSusuSmsEnabled(db,ctx,input.enabled);
  else if ('retryId' in input) await retrySusuSms(db,ctx,input.retryId);
  else await manageSusuSms(db,ctx,{id:input.messageId,action:input.action,message:input.message});
  if ('retryId' in input || ('action' in input && input.action === 'send')) sendSusuSmsAfterResponse(db,ctx.orgId);
  return susuSmsOverview(db,ctx);
});
