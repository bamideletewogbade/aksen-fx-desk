import { z } from 'zod';
import { body, deskRoute } from '@/server/http';
import { getSaver } from '@/server/susu';
import { manageSusuSms } from '@/server/susu-sms';
import { sendSusuSmsAfterResponse } from '@/server/susu-sms-after';

type P = { id: string };
const action = z.object({
  messageId: z.string().uuid(),
  action: z.enum(['save', 'send', 'cancel']),
  message: z.string().trim().min(1).max(480).optional(),
});

export const POST = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const input = await body(req, action);
  await manageSusuSms(db, ctx, { id: input.messageId, saverId: params.id, action: input.action, message: input.message });
  if (input.action === 'send') sendSusuSmsAfterResponse(db, ctx.orgId);
  return getSaver(db, ctx, params.id);
});
