import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/server/db';
import { dispatchSusuSms, refreshSusuSmsDelivery } from '@/server/susu-sms';

export async function POST(req: Request) {
  const secret = process.env.SUSU_SMS_CRON_SECRET;
  const supplied = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return new Response('Unauthorized',{status:401});
  const db = await getDb();
  const result = await dispatchSusuSms(db,undefined,fetch,10);
  await refreshSusuSmsDelivery(db);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}
