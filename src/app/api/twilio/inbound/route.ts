import { getDb } from '@/server/db';
import { receiveInbound } from '@/server/inbox';
import { readForm, signedUrl, twilioConfigured, validTwilioRequest } from '@/server/twilio';

/**
 * Twilio "A message comes in" webhook for WhatsApp and SMS.
 *
 * Every request must carry a valid X-Twilio-Signature. Replies are sent through
 * the REST API (so each one gets a delivery status), and this answers Twilio
 * with empty TwiML. Processing errors are logged, never echoed to the customer.
 */
export const dynamic = 'force-dynamic';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () => new Response(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });

export async function POST(req: Request) {
  if (!twilioConfigured()) return new Response('Twilio is not configured on this server.', { status: 503 });
  const params = await readForm(req);
  const url = signedUrl(req);
  if (!validTwilioRequest(url, params, req.headers.get('x-twilio-signature'))) {
    console.warn(`[aksen] rejected Twilio webhook: bad signature for ${url}. Check PUBLIC_BASE_URL matches the URL set in Twilio.`);
    return new Response('Invalid signature.', { status: 403 });
  }
  try {
    const db = await getDb();
    const count = Math.min(Number(params.NumMedia ?? 0) || 0, 10);
    const media = Array.from({ length: count }, (_, i) => ({ url: params[`MediaUrl${i}`], contentType: params[`MediaContentType${i}`] ?? 'application/octet-stream' })).filter((m) => m.url);
    const result = await receiveInbound(db, {
      to: params.To ?? '',
      from: params.From ?? '',
      body: params.Body ?? '',
      profileName: params.ProfileName ?? null,
      sid: params.MessageSid ?? params.SmsMessageSid ?? null,
      media,
    });
    if (result.status === 'ignored') console.warn(`[aksen] Twilio message to ${params.To} ignored: no desk has connected that number.`);
  } catch (e) {
    console.error('[aksen] failed to process inbound Twilio message', e);
  }
  return twiml();
}
