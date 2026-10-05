import { getDb } from '@/server/db';
import { recordDeliveryStatus } from '@/server/inbox';
import { readForm, signedUrl, twilioConfigured, validTwilioRequest } from '@/server/twilio';

/** Twilio delivery status callback: queued → sent → delivered → read, or failed. */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!twilioConfigured()) return new Response('Twilio is not configured on this server.', { status: 503 });
  const params = await readForm(req);
  if (!validTwilioRequest(signedUrl(req), params, req.headers.get('x-twilio-signature'))) return new Response('Invalid signature.', { status: 403 });
  try {
    const sid = params.MessageSid ?? params.SmsSid;
    if (sid && params.MessageStatus) await recordDeliveryStatus(await getDb(), { sid, status: params.MessageStatus, errorCode: params.ErrorCode });
  } catch (e) {
    console.error('[aksen] failed to record Twilio status', e);
  }
  return new Response(null, { status: 204 });
}
