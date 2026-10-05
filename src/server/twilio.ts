import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual } from './secret';

/**
 * Thin Twilio Messaging client (WhatsApp and SMS share one API).
 *
 * Credentials come from the server environment only. When they are missing,
 * `twilioConfigured()` is false and callers record outbound messages as
 * "not sent" instead of pretending they went out.
 */

const API = 'https://api.twilio.com/2010-04-01';

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

function auth() {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  return { sid, token, header: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` };
}

/** Public https origin Twilio calls, without a trailing slash. */
export function publicBaseUrl(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

/**
 * X-Twilio-Signature: base64 HMAC-SHA1 over the full URL Twilio called followed
 * by every POST parameter as name+value, sorted by name.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(url: string, params: Record<string, string>, token = process.env.TWILIO_AUTH_TOKEN ?? ''): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function validTwilioRequest(url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;
  return safeEqual(twilioSignature(url, params), signature);
}

/**
 * The URL Twilio signed. Behind a tunnel or proxy the request URL Next sees is
 * the local one, so PUBLIC_BASE_URL (when set) replaces the origin.
 */
export function signedUrl(req: Request): string {
  const u = new URL(req.url);
  const base = publicBaseUrl();
  return base ? `${base}${u.pathname}${u.search}` : u.toString();
}

export async function readForm(req: Request): Promise<Record<string, string>> {
  const form = new URLSearchParams(await req.text());
  const out: Record<string, string> = {};
  for (const [k, v] of form) out[k] = v;
  return out;
}

export interface SendResult {
  sid: string | null;
  status: string;
  error: string | null;
}

/** WhatsApp sessions allow at most 1600 characters per message. */
const MAX_BODY = 1600;

export async function sendMessage(input: { from: string; to: string; body: string }): Promise<SendResult> {
  if (!twilioConfigured()) return { sid: null, status: 'not_sent', error: 'Twilio is not configured on this server.' };
  const { sid, header } = auth();
  const form = new URLSearchParams({ From: input.from, To: input.to, Body: input.body.slice(0, MAX_BODY) });
  const base = publicBaseUrl();
  if (base) form.set('StatusCallback', `${base}/api/twilio/status`);
  try {
    const res = await fetch(`${API}/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: header, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    if (!res.ok) return { sid: null, status: 'failed', error: explainTwilioError(data.code, data.message) };
    return { sid: data.sid ?? null, status: data.status ?? 'queued', error: null };
  } catch (e) {
    return { sid: null, status: 'failed', error: `Could not reach Twilio: ${(e as Error).message}` };
  }
}

/** Downloads inbound media. Twilio media URLs need account auth. */
export async function fetchMedia(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!twilioConfigured()) return null;
  try {
    const res = await fetch(url, { headers: { Authorization: auth().header }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { bytes: buf, mime: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim() };
  } catch {
    return null;
  }
}

/** Plain-language versions of the errors operators will actually hit. */
export function explainTwilioError(code?: number, message?: string): string {
  switch (code) {
    case 63016:
      return 'Outside the 24-hour WhatsApp window. The customer must message first (or use an approved template).';
    case 63015:
    case 63007:
      return 'This number has not joined the WhatsApp Sandbox. Ask the customer to send the join code first.';
    case 21608:
    case 21211:
      return 'Trial account: this phone number is not verified in Twilio.';
    case 21610:
      return 'The customer replied STOP and has opted out.';
    case 21606:
    case 21659:
      return 'The From number cannot send this kind of message.';
    default:
      return code ? `Twilio error ${code}: ${message ?? ''}`.trim() : message ?? 'Twilio rejected the message.';
  }
}

/** Status-callback error codes into the same sentences. */
export function explainStatusError(code: string | undefined): string | null {
  if (!code) return null;
  return explainTwilioError(Number(code));
}
