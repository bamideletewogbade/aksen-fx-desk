import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * WhatsApp Cloud API webhook (preview).
 *
 * - GET answers Meta's verification challenge using WHATSAPP_VERIFY_TOKEN.
 * - POST verifies the X-Hub-Signature-256 HMAC with WHATSAPP_APP_SECRET over
 *   the raw body, then acknowledges. It deliberately creates no trades and
 *   never marks anything as paid: messages are channel input, and payments are
 *   confirmed by an operator in the trade room.
 * Next step when this channel goes live: store each message in an inbox table
 * keyed by its WhatsApp message id (to ignore Meta's retries) and route it to
 * the desk that owns the phone number id.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) return NextResponse.json({ error: 'WHATSAPP_VERIFY_TOKEN is not configured.' }, { status: 503 });
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === expected) {
    return new Response(searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(raw, 'utf8').digest('hex'));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  const isPreview = process.env.NODE_ENV !== 'production' && !secret;
  if (!isPreview) {
    if (!secret) return NextResponse.json({ error: 'WHATSAPP_APP_SECRET is not configured.' }, { status: 503 });
    if (!validSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    }
  }
  let body: { object?: string; entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: { id: string; from: string; type: string; text?: { body?: string } }[]; statuses?: unknown[] } }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (body.object !== 'whatsapp_business_account') return NextResponse.json({ status: 'ignored' });

  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => (c.value?.messages ?? []).map((m) => ({ ...m, phoneNumberId: c.value?.metadata?.phone_number_id }))));
  const statuses = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? [])).length;

  return NextResponse.json({
    status: 'received',
    preview: isPreview,
    messages: messages.map((m) => ({ id: m.id, from: m.from, type: m.type, text: m.text?.body?.slice(0, 200) ?? null, phoneNumberId: m.phoneNumberId ?? null })),
    statuses,
    note: 'Preview: messages are acknowledged but not stored, and never create or clear trades.',
  });
}
