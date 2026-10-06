import 'server-only';
import type { Db } from './db';
import { requirePermission, type Ctx } from './auth';
import { appendAudit } from './audit';
import { DomainError, fail } from './errors';
import { cancelFromChat, createChatQuote, MAX_EVIDENCE_BYTES, portalAccept, portalAddEvidence, portalToken, sweepExpired } from './trades';
import * as A from './assistant';
import { decideWithAi, type AiNote } from './ai/assist';
import { chatReader, loadDeskAi } from './ai/settings';
import { explainStatusError, fetchMedia, sendMessage } from './twilio';
import { parseRate, rateToString, type Corridor, type Currency } from '@/lib/money';
import type { Beneficiary, TradeStatus } from '@/lib/trades';

/**
 * Customer conversations over WhatsApp and SMS (Twilio).
 *
 * Inbound messages are stored first, then the desk's assistant may answer.
 * A conversation is in one of two modes:
 *   ASSISTANT: the assistant replies and can raise and accept quotes.
 *   HUMAN:     the assistant is silent; operators reply from the inbox.
 * The assistant hands over on its own (customer asks for a person, sends a
 * voice note, sounds upset, or it fails to understand twice). Any operator
 * reply takes over automatically, so the assistant never talks over a person.
 *
 * Nothing that arrives in a chat (text, screenshots) can mark money as
 * received: receipts are attached to the trade as customer evidence only.
 */

const N = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const WINDOW_MS = 24 * 3600 * 1000;
const MAX_MEDIA = 5 * 1024 * 1024;

// ---------------------------------------------------------------- per-conversation serialisation

type G = typeof globalThis & { __aksenConvLocks?: Map<string, Promise<void>> };
const locks = ((globalThis as G).__aksenConvLocks ??= new Map());

/**
 * Two quick messages from one customer must be answered in order. This lock
 * is per server instance; Twilio delivers one sender's messages in sequence,
 * so it covers the realistic case. Use an advisory lock if this scales out.
 */
async function serialised<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  locks.set(id, tail);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(id) === tail) locks.delete(id);
  }
}

// ---------------------------------------------------------------- loading

interface ConvRow {
  id: string;
  org_id: string;
  channel_id: string;
  channel_address: string;
  channel_kind: 'WHATSAPP' | 'SMS';
  assistant_enabled: boolean;
  address: string;
  phone: string;
  profile_name: string | null;
  customer_id: string | null;
  trade_id: string | null;
  mode: 'ASSISTANT' | 'HUMAN';
  needs_human: boolean;
  bot: A.BotState | string | null;
  is_test: boolean;
  last_inbound_at: string | null;
}

async function loadConv(db: Db, id: string, orgId?: string): Promise<ConvRow> {
  const [c] = await db.query<ConvRow & Record<string, unknown>>(
    `SELECT cv.*, ch.address AS channel_address, ch.kind AS channel_kind, ch.assistant_enabled
       FROM conversations cv JOIN channels ch ON ch.id = cv.channel_id
      WHERE cv.id = $1 ${orgId ? 'AND cv.org_id = $2' : ''}`,
    orgId ? [id, orgId] : [id],
  );
  if (!c) fail('NOT_FOUND', 'Conversation not found.');
  return c;
}

function botState(c: ConvRow): A.BotState {
  const raw = typeof c.bot === 'string' ? JSON.parse(c.bot) : c.bot;
  return raw && raw.step ? (raw as A.BotState) : { ...A.FRESH };
}

export async function loadTradeFact(db: Db, tradeId: string): Promise<A.TradeFact & { id: string; nonce: string; orgId: string }> {
  const [t] = await db.query<Record<string, unknown>>(
    `SELECT t.*, r.provider AS r_provider, r.account_number AS r_account_number, r.account_name AS r_account_name,
       (SELECT COUNT(*) FROM evidence e WHERE e.trade_id = t.id AND e.submitted_by = 'CUSTOMER') AS customer_evidence,
       (SELECT reference FROM payouts p WHERE p.trade_id = t.id AND p.kind = 'PAYOUT' LIMIT 1) AS payout_ref
     FROM trades t LEFT JOIN rails r ON r.id = t.collection_rail_id WHERE t.id = $1`,
    [tradeId],
  );
  if (!t) fail('NOT_FOUND', 'Trade not found.');
  const ben = (typeof t.beneficiary === 'string' ? JSON.parse(t.beneficiary) : t.beneficiary) as Beneficiary | null;
  return {
    id: t.id as string,
    orgId: t.org_id as string,
    nonce: t.portal_nonce as string,
    ref: t.ref as string,
    status: t.status as TradeStatus,
    corridor: t.corridor as Corridor,
    payCurrency: t.pay_currency as Currency,
    receiveCurrency: t.receive_currency as Currency,
    payMinor: N(t.pay_minor),
    receiveMinor: N(t.receive_minor),
    feeMinor: N(t.fee_minor),
    rate: rateToString(parseRate(String(t.rate))),
    quoteExpiresAt: iso(t.quote_expires_at)!,
    fundsDueAt: iso(t.funds_due_at),
    fundsReceivedMinor: N(t.funds_received_minor),
    refundedMinor: N(t.refunded_minor),
    beneficiary: ben,
    instructions: t.r_provider ? { provider: t.r_provider as string, accountNumber: t.r_account_number as string, accountName: t.r_account_name as string } : null,
    customerEvidence: N(t.customer_evidence),
    payoutReference: (t.payout_ref as string) ?? null,
  };
}

async function loadFacts(db: Db, c: ConvRow): Promise<A.Facts> {
  await sweepExpired(db, c.org_id);
  const [o] = await db.query<Record<string, unknown>>('SELECT name, timezone, quote_ttl_minutes, funds_window_minutes FROM organizations WHERE id = $1', [c.org_id]);
  const rates = await db.query<Record<string, unknown>>(
    'SELECT corridor, customer_rate, fee_minor, min_pay_minor, max_pay_minor FROM rate_board WHERE org_id = $1 AND active ORDER BY corridor DESC',
    [c.org_id],
  );
  const customer = c.customer_id ? (await db.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [c.customer_id]))[0] : null;
  const last = c.customer_id
    ? (await db.query<{ beneficiary: unknown }>(`SELECT beneficiary FROM trades WHERE customer_id = $1 AND status = 'COMPLETED' AND beneficiary IS NOT NULL ORDER BY completed_at DESC LIMIT 1`, [c.customer_id]))[0]
    : null;
  const [recent] = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM messages WHERE conversation_id = $1 AND direction = 'OUT' AND created_at > now() - interval '6 hours'`, [c.id]);
  return {
    deskName: o.name as string,
    timezone: (o.timezone as string) || 'Africa/Accra',
    now: new Date(),
    profileName: c.profile_name,
    customerName: customer?.name ?? null,
    rates: rates.map((r) => ({
      corridor: r.corridor as Corridor,
      rate: rateToString(parseRate(String(r.customer_rate))),
      feeMinor: N(r.fee_minor),
      minPayMinor: N(r.min_pay_minor),
      maxPayMinor: r.max_pay_minor === null ? null : N(r.max_pay_minor),
    })),
    quoteTtlMinutes: N(o.quote_ttl_minutes),
    fundsWindowMinutes: N(o.funds_window_minutes),
    trade: c.trade_id ? await loadTradeFact(db, c.trade_id) : null,
    lastPayout: last ? ((typeof last.beneficiary === 'string' ? JSON.parse(last.beneficiary) : last.beneficiary) as Beneficiary) : null,
    recentlyTalked: N(recent?.n) > 0,
    phone: c.phone,
  };
}

/** Matches a phone to an existing customer by its last nine digits (ignores +233/0 prefixes). */
async function matchCustomer(db: Db, orgId: string, phone: string): Promise<string | null> {
  const tail = phone.replace(/\D/g, '').slice(-9);
  if (tail.length < 9) return null;
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM customers WHERE org_id = $1 AND phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = $2 ORDER BY created_at LIMIT 2`,
    [orgId, tail],
  );
  return rows.length === 1 ? rows[0].id : null;
}

// ---------------------------------------------------------------- writing

const bump = `rev = nextval('inbox_rev_seq')`;

async function note(db: Db, c: Pick<ConvRow, 'id' | 'org_id'>, body: string) {
  await db.query(`INSERT INTO messages (org_id, conversation_id, direction, author, body, status) VALUES ($1,$2,'NOTE','SYSTEM',$3,'note')`, [c.org_id, c.id, body]);
  await db.query(`UPDATE conversations SET ${bump} WHERE id = $1`, [c.id]);
}

/** Records an outbound message, then sends it. Test conversations are never sent. */
async function sendOut(
  db: Db,
  c: ConvRow,
  m: { author: 'ASSISTANT' | 'OPERATOR'; label: string; body: string; userId?: string | null; tradeId?: string | null },
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO messages (org_id, conversation_id, direction, author, author_user_id, author_label, body, trade_id, status)
     VALUES ($1,$2,'OUT',$3,$4,$5,$6,$7,'queued') RETURNING id`,
    [c.org_id, c.id, m.author, m.userId ?? null, m.label, m.body, m.tradeId ?? null],
  );
  await db.query(`UPDATE conversations SET last_message_at = now(), last_preview = $2, ${bump} WHERE id = $1`, [c.id, m.body.slice(0, 140)]);
  const res = c.is_test ? { sid: null, status: 'simulated', error: null } : await sendMessage({ from: c.channel_address, to: c.address, body: m.body });
  await db.query(`UPDATE messages SET provider_sid = $2, status = $3, error = $4, ${bump} WHERE id = $1`, [row.id, res.sid, res.status, res.error]);
  return row.id;
}

async function setMode(db: Db, c: ConvRow, patch: { mode?: 'ASSISTANT' | 'HUMAN'; needsHuman?: boolean; reason?: string | null; assignedTo?: string | null }) {
  await db.query(
    `UPDATE conversations SET
       mode = COALESCE($2, mode),
       needs_human = COALESCE($3, needs_human),
       handoff_reason = CASE WHEN $4::boolean THEN $5 ELSE handoff_reason END,
       assigned_to = CASE WHEN $6::boolean THEN $7::uuid ELSE assigned_to END,
       ${bump}
     WHERE id = $1`,
    [c.id, patch.mode ?? null, patch.needsHuman ?? null, patch.reason !== undefined, patch.reason ?? null, patch.assignedTo !== undefined, patch.assignedTo ?? null],
  );
}

// ---------------------------------------------------------------- inbound

export interface InboundMessage {
  to: string;
  from: string;
  body: string;
  profileName?: string | null;
  sid?: string | null;
  media?: { url?: string; contentType: string; bytes?: Uint8Array }[];
  isTest?: boolean;
}

function mediaKind(mime: string | null | undefined): A.Media {
  if (!mime) return 'none';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'document';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'other';
}

export async function receiveInbound(db: Db, p: InboundMessage): Promise<{ status: 'ignored' | 'duplicate' | 'received'; conversationId?: string }> {
  const [channel] = await db.query<{ id: string; org_id: string }>('SELECT id, org_id FROM channels WHERE address = $1 AND active', [p.to]);
  if (!channel) return { status: 'ignored' };
  if (p.sid && (await db.query('SELECT 1 FROM messages WHERE provider_sid = $1', [p.sid])).length) return { status: 'duplicate' };

  const phone = p.from.replace(/^(whatsapp|test):/, '');
  const [conv] = await db.query<{ id: string; customer_id: string | null }>(
    `INSERT INTO conversations (org_id, channel_id, address, phone, profile_name, is_test)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (channel_id, address) DO UPDATE SET profile_name = COALESCE(EXCLUDED.profile_name, conversations.profile_name)
     RETURNING id, customer_id`,
    [channel.org_id, channel.id, p.from, phone, p.profileName?.trim() || null, Boolean(p.isTest)],
  );
  if (!conv.customer_id) {
    const match = await matchCustomer(db, channel.org_id, phone);
    if (match) await db.query('UPDATE conversations SET customer_id = $2 WHERE id = $1', [conv.id, match]);
  }

  const first = p.media?.[0];
  let media: { bytes: Uint8Array; mime: string } | null = null;
  if (first?.bytes) media = { bytes: first.bytes, mime: first.contentType };
  else if (first?.url) media = await fetchMedia(first.url, MAX_MEDIA);
  const mime = media?.mime ?? first?.contentType ?? null;

  const text = (p.body ?? '').slice(0, 4000);
  const [msg] = await db.query<{ id: string }>(
    `INSERT INTO messages (org_id, conversation_id, direction, author, author_label, body, media_mime, media_data, media_count, provider_sid, status)
     VALUES ($1,$2,'IN','CUSTOMER',$3,$4,$5,$6,$7,$8,'received') RETURNING id`,
    [channel.org_id, conv.id, p.profileName?.trim() || phone, text || null, mime, media ? Buffer.from(media.bytes) : null, p.media?.length ?? 0, p.sid ?? null],
  );
  const preview = text || (mime ? `[${mediaKind(mime) === 'audio' ? 'Voice note' : mediaKind(mime) === 'image' ? 'Photo' : 'Attachment'}]` : '');
  await db.query(
    `UPDATE conversations SET last_inbound_at = now(), last_message_at = now(), last_preview = $2, unread = unread + 1, ${bump} WHERE id = $1`,
    [conv.id, preview.slice(0, 140)],
  );

  await runAssistant(db, conv.id, { messageId: msg.id, text, media: mediaKind(mime), file: media });
  return { status: 'received', conversationId: conv.id };
}

// ---------------------------------------------------------------- assistant

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

async function runAssistant(db: Db, convId: string, input: { messageId: string; text: string; media: A.Media; file: { bytes: Uint8Array; mime: string } | null }) {
  await serialised(convId, async () => {
    const c = await loadConv(db, convId);
    if (c.mode !== 'ASSISTANT' || !c.assistant_enabled) return;
    const facts = await loadFacts(db, c);
    // Rules answer first; the desk's AI model only reads messages the rules couldn't follow.
    const ai = await loadDeskAi(db, c.org_id);
    const [last] = await db.query<{ body: string | null }>(
      `SELECT body FROM messages WHERE conversation_id = $1 AND direction = 'OUT' ORDER BY created_at DESC, rev DESC LIMIT 1`,
      [c.id],
    );
    const { decision, ai: aiNote } = await decideWithAi({ text: input.text, media: input.media, state: botState(c), facts, lastReply: last?.body ?? null }, chatReader(ai));
    if (aiNote) await db.query('UPDATE messages SET ai_note = $2::jsonb WHERE id = $1', [input.messageId, JSON.stringify(aiNote)]);
    let { replies, state, handoff } = decision;
    replies = [...replies];

    if (decision.effect) {
      try {
        const follow = await runEffect(db, c, facts, decision.effect, decision.state, input);
        replies.push(...follow.replies);
        state = follow.state;
        handoff = follow.handoff ?? handoff;
      } catch (e) {
        if (!(e instanceof DomainError)) console.error('[aksen] assistant effect failed', e);
        const err = e instanceof DomainError ? { code: e.code, message: e.message } : { code: 'INTERNAL', message: 'unexpected error' };
        const d = A.afterEffectError(decision.effect, err, decision.state, facts);
        replies.push(...d.replies);
        state = d.state;
        handoff = d.handoff ?? handoff;
      }
    }

    await db.query(`UPDATE conversations SET bot = $2::jsonb, ${bump} WHERE id = $1`, [c.id, JSON.stringify(state)]);
    if (handoff) await setMode(db, c, { mode: 'HUMAN', needsHuman: true, reason: handoff, assignedTo: null });
    const fresh = await loadConv(db, c.id);
    for (const body of replies) await sendOut(db, fresh, { author: 'ASSISTANT', label: 'Assistant', body, tradeId: fresh.trade_id });
    if (handoff) await note(db, c, `Handed to the team: ${handoff}`);
  });
}

async function runEffect(
  db: Db,
  c: ConvRow,
  facts: A.Facts,
  effect: A.Effect,
  state: A.BotState,
  input: { messageId: string; file: { bytes: Uint8Array; mime: string } | null },
): Promise<A.Decision> {
  const actorLabel = c.channel_kind === 'WHATSAPP' ? 'WhatsApp assistant' : 'SMS assistant';
  switch (effect.type) {
    case 'QUOTE': {
      let customerId = c.customer_id;
      if (!customerId) {
        customerId = await db.tx(async (q) => {
          const [o] = await q.query<{ customer_seq: number }>('UPDATE organizations SET customer_seq = customer_seq + 1 WHERE id = $1 RETURNING customer_seq', [c.org_id]);
          const ref = `C-${String(o.customer_seq).padStart(4, '0')}`;
          const [row] = await q.query<{ id: string }>(
            `INSERT INTO customers (org_id, ref, name, phone, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [c.org_id, ref, effect.customerName === 'WhatsApp customer' ? `WhatsApp ${c.phone}` : effect.customerName, c.phone, `Added from ${c.channel_kind === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}${c.profile_name ? ` (profile name “${c.profile_name}”)` : ''}. Not yet verified.`],
          );
          await appendAudit(q, { orgId: c.org_id, action: 'customer.added', actor: { type: 'SYSTEM', label: actorLabel }, data: { customerId: row.id, ref, name: effect.customerName, source: 'chat' } });
          return row.id;
        });
        await db.query(`UPDATE conversations SET customer_id = $2, ${bump} WHERE id = $1`, [c.id, customerId]);
      }
      const q = await createChatQuote(db, { orgId: c.org_id, conversationId: c.id, actorLabel, customerId, ...effect.draft });
      await db.query(`UPDATE conversations SET trade_id = $2, ${bump} WHERE id = $1`, [c.id, q.id]);
      await db.query('UPDATE messages SET trade_id = $2 WHERE id = $1', [input.messageId, q.id]);
      const trade = await loadTradeFact(db, q.id);
      return A.afterQuote(trade, { ...facts, customerName: facts.customerName ?? effect.customerName }, state);
    }
    case 'ACCEPT': {
      const t = await loadTradeFact(db, c.trade_id!);
      await portalAccept(db, portalToken(t.id, t.nonce), effect.beneficiary);
      return A.afterAccept(await loadTradeFact(db, t.id), facts, state);
    }
    case 'EVIDENCE': {
      const t = await loadTradeFact(db, c.trade_id!);
      const usable = input.file && EXT[input.file.mime] && input.file.bytes.length <= MAX_EVIDENCE_BYTES;
      await portalAddEvidence(db, portalToken(t.id, t.nonce), {
        note: effect.note ?? (usable ? 'Sent on WhatsApp' : 'Customer sent a receipt in chat; open the conversation to see it.'),
        file: usable ? { name: `chat-receipt.${EXT[input.file!.mime]}`, mime: input.file!.mime, bytes: input.file!.bytes } : null,
      });
      await db.query('UPDATE messages SET trade_id = $2 WHERE id = $1', [input.messageId, t.id]);
      return { replies: A.afterEvidence(t), state: { ...state, step: 'AWAITING_PAYMENT', misses: 0 } };
    }
    case 'CANCEL': {
      const t = await loadTradeFact(db, c.trade_id!);
      const [cust] = await db.query<{ name: string }>('SELECT name FROM customers WHERE id = (SELECT customer_id FROM trades WHERE id = $1)', [t.id]);
      await cancelFromChat(db, { orgId: c.org_id, tradeId: t.id, customerName: cust?.name ?? 'Customer' });
      return { replies: A.afterCancel(t.ref), state: { ...A.FRESH } };
    }
    case 'DROP_QUOTE': {
      // The customer changed the amount before accepting: close the old quote quietly; the new preview is already in the replies.
      if (c.trade_id) {
        const t = await loadTradeFact(db, c.trade_id);
        if (t.status === 'QUOTED') {
          const [cust] = await db.query<{ name: string }>('SELECT name FROM customers WHERE id = (SELECT customer_id FROM trades WHERE id = $1)', [t.id]);
          await cancelFromChat(db, { orgId: c.org_id, tradeId: t.id, customerName: cust?.name ?? 'Customer' });
        }
      }
      return { replies: [], state };
    }
    case 'NAME': {
      // Only a chat-created, still-unverified record is renamed; a desk-verified name is never overwritten from chat.
      if (c.customer_id) {
        await db.tx(async (q) => {
          const [before] = await q.query<{ name: string; kyc_status: string }>('SELECT name, kyc_status FROM customers WHERE id = $1 AND org_id = $2 FOR UPDATE', [c.customer_id, c.org_id]);
          if (!before || before.kyc_status !== 'UNVERIFIED' || before.name === effect.name) return;
          await q.query('UPDATE customers SET name = $3, updated_at = now() WHERE id = $1 AND org_id = $2', [c.customer_id, c.org_id, effect.name]);
          await appendAudit(q, { orgId: c.org_id, action: 'customer.updated', actor: { type: 'SYSTEM', label: actorLabel }, data: { customerId: c.customer_id, nameFrom: before.name, nameTo: effect.name, source: 'chat' } });
        });
      }
      return { replies: A.afterName(effect.name), state };
    }
  }
}

// ---------------------------------------------------------------- desk → customer

/**
 * Tells the customer what changed after an operator acts on a chat-originated
 * trade. Never throws: the trade action already succeeded.
 */
export async function notifyTradeChange(db: Db, ctx: Ctx, tradeId: string, action: string, result: unknown) {
  try {
    const [row] = await db.query<{ conversation_id: string | null }>('SELECT conversation_id FROM trades WHERE id = $1 AND org_id = $2', [tradeId, ctx.orgId]);
    if (!row?.conversation_id) return;
    const c = await loadConv(db, row.conversation_id, ctx.orgId);
    const t = await loadTradeFact(db, tradeId);
    const [o] = await db.query<{ name: string; timezone: string }>('SELECT name, timezone FROM organizations WHERE id = $1', [ctx.orgId]);
    const extra: Parameters<typeof A.tradeUpdateText>[3] = {};
    if (action === 'record_funds' && result && typeof result === 'object') {
      const r = result as { receivedMinor?: number; shortfallMinor?: number };
      Object.assign(extra, { receivedMinor: r.receivedMinor, shortfallMinor: r.shortfallMinor });
    }
    if (action === 'record_refund') {
      const [p] = await db.query<{ amount_minor: number; reference: string }>(`SELECT amount_minor, reference FROM payouts WHERE trade_id = $1 AND kind = 'REFUND' ORDER BY created_at DESC LIMIT 1`, [tradeId]);
      if (p) Object.assign(extra, { refundMinor: N(p.amount_minor), reference: p.reference });
    }
    const texts = A.tradeUpdateText(action, t, { deskName: o.name, timezone: o.timezone || 'Africa/Accra' }, extra);
    if (!texts.length) return;
    await serialised(c.id, async () => {
      for (const body of texts) await sendOut(db, c, { author: 'ASSISTANT', label: 'Trade update', body, tradeId });
      const state = botState(c);
      if (c.trade_id === tradeId) {
        if (action === 'accept' || action === 'requote') {
          const next = action === 'accept' ? 'AWAITING_PAYMENT' : 'ASK_PAYOUT';
          await db.query(`UPDATE conversations SET bot = $2::jsonb, ${bump} WHERE id = $1`, [c.id, JSON.stringify({ ...state, step: next, misses: 0 })]);
        }
        if (['record_payout', 'cancel', 'record_refund'].includes(action)) {
          await db.query(`UPDATE conversations SET bot = $2::jsonb, ${bump} WHERE id = $1`, [c.id, JSON.stringify(A.FRESH)]);
        }
      }
      if (action === 'hold') await setMode(db, c, { needsHuman: true, reason: 'Trade put on hold: tell the customer what happens next' });
    });
  } catch (e) {
    console.error('[aksen] could not notify customer of trade change', e);
  }
}

// ---------------------------------------------------------------- quotes raised by a person inside a chat

/** The chat's customer record, created from the chat (WhatsApp name and number) when there is none yet. */
export async function customerForChat(db: Db, ctx: Ctx, conversationId: string): Promise<string> {
  requirePermission(ctx, 'trade');
  const c = await loadConv(db, conversationId, ctx.orgId);
  if (c.customer_id) return c.customer_id;
  const name = c.profile_name?.trim() || `WhatsApp ${c.phone}`;
  return db.tx(async (q) => {
    const [o] = await q.query<{ customer_seq: number }>('UPDATE organizations SET customer_seq = customer_seq + 1 WHERE id = $1 RETURNING customer_seq', [ctx.orgId]);
    const ref = `C-${String(o.customer_seq).padStart(4, '0')}`;
    const [row] = await q.query<{ id: string }>('INSERT INTO customers (org_id, ref, name, phone, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [ctx.orgId, ref, name, c.phone, 'Added from a WhatsApp chat. Not yet verified.', ctx.userId]);
    await appendAudit(q, { orgId: ctx.orgId, action: 'customer.added', actor: { type: 'USER', id: ctx.userId, label: ctx.userName }, data: { customerId: row.id, ref, name, source: 'chat' } });
    await q.query(`UPDATE conversations SET customer_id = $2, ${bump} WHERE id = $1`, [conversationId, row.id]);
    return row.id;
  });
}

/**
 * Links a quote an operator built to the chat it was asked for, sends the
 * customer the locked rate in that chat, and leaves the conversation ready to
 * collect payout details (by the operator, or by the assistant once handed back).
 */
export async function attachQuoteToChat(db: Db, ctx: Ctx, tradeId: string, conversationId: string) {
  const c = await loadConv(db, conversationId, ctx.orgId);
  await db.query('UPDATE trades SET conversation_id = $2 WHERE id = $1 AND org_id = $3', [tradeId, c.id, ctx.orgId]);
  await db.query(`UPDATE conversations SET trade_id = $2, ${bump} WHERE id = $1`, [c.id, tradeId]);
  const facts = await loadFacts(db, { ...c, trade_id: tradeId });
  const t = await loadTradeFact(db, tradeId);
  const next = A.afterQuote(t, facts, { ...A.FRESH });
  await serialised(c.id, async () => {
    await note(db, c, `${ctx.userName} sent quote ${t.ref}`);
    for (const body of next.replies) await sendOut(db, c, { author: 'OPERATOR', label: ctx.userName, body, userId: ctx.userId, tradeId });
    await db.query(`UPDATE conversations SET bot = $2::jsonb, ${bump} WHERE id = $1`, [c.id, JSON.stringify(next.state)]);
  });
}

// ---------------------------------------------------------------- operator actions

async function convForOperator(db: Db, ctx: Ctx, id: string) {
  return loadConv(db, id, ctx.orgId);
}

export function windowClosesAt(c: { channel_kind: string; last_inbound_at: string | null }): string | null {
  if (c.channel_kind !== 'WHATSAPP' || !c.last_inbound_at) return null;
  return new Date(new Date(c.last_inbound_at).getTime() + WINDOW_MS).toISOString();
}

export async function operatorReply(db: Db, ctx: Ctx, id: string, text: string) {
  requirePermission(ctx, 'trade');
  const body = text.trim();
  if (!body) fail('INVALID', 'Write a message first.');
  if (body.length > 1600) fail('INVALID', 'Keep messages under 1,600 characters.');
  const c = await convForOperator(db, ctx, id);
  const closes = windowClosesAt(c);
  if (c.channel_kind === 'WHATSAPP' && !c.is_test && (!closes || new Date(closes) < new Date())) {
    fail('CONFLICT', 'WhatsApp only lets businesses reply within 24 hours of the customer’s last message. Wait for the customer to message again.');
  }
  await serialised(c.id, async () => {
    if (c.mode === 'ASSISTANT') await note(db, c, `${ctx.userName} took over from the assistant`);
    await setMode(db, c, { mode: 'HUMAN', needsHuman: false, reason: null, assignedTo: ctx.userId });
    await sendOut(db, c, { author: 'OPERATOR', label: ctx.userName, body, userId: ctx.userId, tradeId: c.trade_id });
  });
}

export async function takeOver(db: Db, ctx: Ctx, id: string) {
  requirePermission(ctx, 'trade');
  const c = await convForOperator(db, ctx, id);
  await setMode(db, c, { mode: 'HUMAN', needsHuman: false, reason: null, assignedTo: ctx.userId });
  await note(db, c, `${ctx.userName} took over the chat`);
}

export async function handBack(db: Db, ctx: Ctx, id: string) {
  requirePermission(ctx, 'trade');
  const c = await convForOperator(db, ctx, id);
  await setMode(db, c, { mode: 'ASSISTANT', needsHuman: false, reason: null, assignedTo: null });
  await db.query(`UPDATE conversations SET bot = jsonb_set(bot, '{misses}', '0'::jsonb, true), ${bump} WHERE id = $1`, [c.id]);
  await note(db, c, `${ctx.userName} handed the chat back to the assistant`);
}

export async function markRead(db: Db, ctx: Ctx, id: string) {
  const c = await convForOperator(db, ctx, id);
  await db.query(`UPDATE conversations SET unread = 0, ${bump} WHERE id = $1 AND unread > 0`, [c.id]);
}

export async function linkCustomer(db: Db, ctx: Ctx, id: string, customerId: string | null) {
  requirePermission(ctx, 'trade');
  const c = await convForOperator(db, ctx, id);
  if (customerId) {
    const [cu] = await db.query<{ name: string }>('SELECT name FROM customers WHERE id = $1 AND org_id = $2', [customerId, ctx.orgId]);
    if (!cu) fail('NOT_FOUND', 'Customer not found.');
    await db.query(`UPDATE conversations SET customer_id = $2, ${bump} WHERE id = $1`, [c.id, customerId]);
    await note(db, c, `${ctx.userName} linked this chat to ${cu.name}`);
  } else {
    await db.query(`UPDATE conversations SET customer_id = NULL, ${bump} WHERE id = $1`, [c.id]);
    await note(db, c, `${ctx.userName} unlinked the customer record`);
  }
}

// ---------------------------------------------------------------- reads

export interface ConversationSummary {
  id: string;
  channel: { id: string; kind: 'WHATSAPP' | 'SMS'; label: string; address: string };
  phone: string;
  profileName: string | null;
  displayName: string;
  customer: { id: string; ref: string; name: string; kycStatus: string } | null;
  mode: 'ASSISTANT' | 'HUMAN';
  needsHuman: boolean;
  handoffReason: string | null;
  assignedTo: { id: string; name: string } | null;
  unread: number;
  lastMessageAt: string;
  lastInboundAt: string | null;
  lastPreview: string | null;
  windowClosesAt: string | null;
  isTest: boolean;
  trade: { id: string; ref: string; status: TradeStatus } | null;
  step: A.Step;
}

export interface MessageView {
  id: string;
  direction: 'IN' | 'OUT' | 'NOTE';
  author: 'CUSTOMER' | 'ASSISTANT' | 'OPERATOR' | 'SYSTEM';
  authorLabel: string | null;
  body: string | null;
  mediaMime: string | null;
  hasMedia: boolean;
  mediaCount: number;
  status: string;
  error: string | null;
  tradeId: string | null;
  createdAt: string;
  /** What the AI model read in a customer message the rules couldn't follow. */
  ai: AiNote | null;
}

const SUMMARY_SQL = `
  SELECT cv.*, ch.kind AS channel_kind, ch.label AS channel_label, ch.address AS channel_address,
         cu.ref AS cu_ref, cu.name AS cu_name, cu.kyc_status AS cu_kyc,
         u.name AS assignee_name, t.ref AS t_ref, t.status AS t_status
    FROM conversations cv
    JOIN channels ch ON ch.id = cv.channel_id
    LEFT JOIN customers cu ON cu.id = cv.customer_id
    LEFT JOIN users u ON u.id = cv.assigned_to
    LEFT JOIN trades t ON t.id = cv.trade_id`;

function toSummary(r: Record<string, unknown>): ConversationSummary {
  const bot = (typeof r.bot === 'string' ? JSON.parse(r.bot) : r.bot) as A.BotState | null;
  return {
    id: r.id as string,
    channel: { id: r.channel_id as string, kind: r.channel_kind as 'WHATSAPP' | 'SMS', label: r.channel_label as string, address: r.channel_address as string },
    phone: r.phone as string,
    profileName: (r.profile_name as string) ?? null,
    displayName: (r.cu_name as string) ?? (r.profile_name as string) ?? (r.phone as string),
    customer: r.customer_id ? { id: r.customer_id as string, ref: r.cu_ref as string, name: r.cu_name as string, kycStatus: r.cu_kyc as string } : null,
    mode: r.mode as 'ASSISTANT' | 'HUMAN',
    needsHuman: Boolean(r.needs_human),
    handoffReason: (r.handoff_reason as string) ?? null,
    assignedTo: r.assigned_to ? { id: r.assigned_to as string, name: (r.assignee_name as string) ?? 'Former member' } : null,
    unread: N(r.unread),
    lastMessageAt: iso(r.last_message_at)!,
    lastInboundAt: iso(r.last_inbound_at),
    lastPreview: (r.last_preview as string) ?? null,
    windowClosesAt: windowClosesAt({ channel_kind: r.channel_kind as string, last_inbound_at: r.last_inbound_at as string | null }),
    isTest: Boolean(r.is_test),
    trade: r.trade_id ? { id: r.trade_id as string, ref: r.t_ref as string, status: r.t_status as TradeStatus } : null,
    step: bot?.step ?? 'IDLE',
  };
}

export async function listConversations(db: Db, ctx: Ctx, filter: 'all' | 'needs_you' | 'assistant' | 'human' = 'all', search?: string) {
  requirePermission(ctx, 'read');
  const where = ['cv.org_id = $1'];
  const params: unknown[] = [ctx.orgId];
  if (filter === 'needs_you') where.push('cv.needs_human');
  if (filter === 'assistant') where.push(`cv.mode = 'ASSISTANT'`);
  if (filter === 'human') where.push(`cv.mode = 'HUMAN'`);
  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    where.push(`(cv.phone ILIKE $${params.length} OR cv.profile_name ILIKE $${params.length} OR cu.name ILIKE $${params.length} OR t.ref ILIKE $${params.length})`);
  }
  const rows = await db.query(`${SUMMARY_SQL} WHERE ${where.join(' AND ')} ORDER BY cv.needs_human DESC, cv.last_message_at DESC LIMIT 200`, params);
  return { conversations: rows.map(toSummary), rev: await inboxRev(db, ctx.orgId) };
}

export async function getConversation(db: Db, ctx: Ctx, id: string): Promise<{ conversation: ConversationSummary; messages: MessageView[] }> {
  requirePermission(ctx, 'read');
  await sweepExpired(db, ctx.orgId);
  const [r] = await db.query(`${SUMMARY_SQL} WHERE cv.id = $1 AND cv.org_id = $2`, [id, ctx.orgId]);
  if (!r) fail('NOT_FOUND', 'Conversation not found.');
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM (
       SELECT id, direction, author, author_label, body, media_mime, (media_data IS NOT NULL) AS has_media, media_count, status, error, trade_id, created_at, rev, ai_note
         FROM messages WHERE conversation_id = $1 AND org_id = $2 ORDER BY created_at DESC, rev DESC LIMIT 400
     ) x ORDER BY created_at, rev`,
    [id, ctx.orgId],
  );
  return {
    conversation: toSummary(r),
    messages: rows.map((m) => ({
      id: m.id as string,
      direction: m.direction as MessageView['direction'],
      author: m.author as MessageView['author'],
      authorLabel: (m.author_label as string) ?? null,
      body: (m.body as string) ?? null,
      mediaMime: (m.media_mime as string) ?? null,
      hasMedia: Boolean(m.has_media),
      mediaCount: N(m.media_count),
      status: m.status as string,
      error: (m.error as string) ?? null,
      tradeId: (m.trade_id as string) ?? null,
      createdAt: iso(m.created_at)!,
      ai: m.ai_note ? ((typeof m.ai_note === 'string' ? JSON.parse(m.ai_note) : m.ai_note) as AiNote) : null,
    })),
  };
}

export async function getMessageMedia(db: Db, ctx: Ctx, messageId: string) {
  requirePermission(ctx, 'read');
  const [m] = await db.query<{ media_data: Uint8Array | null; media_mime: string | null }>('SELECT media_data, media_mime FROM messages WHERE id = $1 AND org_id = $2', [messageId, ctx.orgId]);
  if (!m?.media_data) fail('NOT_FOUND', 'No file on this message.');
  return { bytes: new Uint8Array(m!.media_data as Uint8Array), mime: m!.media_mime ?? 'application/octet-stream' };
}

/** Highest change number across the desk's inbox; the stream sends it when it moves. */
export async function inboxRev(db: Db, orgId: string): Promise<number> {
  const [r] = await db.query<{ rev: string | number }>(
    `SELECT GREATEST((SELECT COALESCE(MAX(rev),0) FROM conversations WHERE org_id = $1), (SELECT COALESCE(MAX(rev),0) FROM messages WHERE org_id = $1)) AS rev`,
    [orgId],
  );
  return N(r?.rev);
}

export async function inboxCounts(db: Db, ctx: Ctx) {
  const [r] = await db.query<{ needs: number; unread: number }>(
    `SELECT COUNT(*) FILTER (WHERE needs_human)::int AS needs, COALESCE(SUM(unread),0)::int AS unread FROM conversations WHERE org_id = $1`,
    [ctx.orgId],
  );
  return { needsYou: N(r?.needs), unread: N(r?.unread) };
}

// ---------------------------------------------------------------- delivery receipts

const RANK: Record<string, number> = { queued: 0, accepted: 0, sending: 1, sent: 2, delivered: 3, read: 4, failed: 5, undelivered: 5 };

/** Twilio status callback. Statuses only move forward (a late "sent" never overwrites "read"). */
export async function recordDeliveryStatus(db: Db, p: { sid: string; status: string; errorCode?: string }) {
  const [m] = await db.query<{ id: string; status: string; conversation_id: string }>('SELECT id, status, conversation_id FROM messages WHERE provider_sid = $1', [p.sid]);
  if (!m) return;
  if ((RANK[p.status] ?? 0) < (RANK[m.status] ?? 0)) return;
  await db.query(`UPDATE messages SET status = $2, error = COALESCE($3, error), ${bump} WHERE id = $1`, [m.id, p.status, explainStatusError(p.errorCode)]);
}

// ---------------------------------------------------------------- channels

export interface ChannelView {
  id: string;
  kind: 'WHATSAPP' | 'SMS';
  address: string;
  label: string;
  assistantEnabled: boolean;
  active: boolean;
  conversations: number;
}

export async function listChannels(db: Db, ctx: Ctx): Promise<ChannelView[]> {
  requirePermission(ctx, 'read');
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ch.*, (SELECT COUNT(*) FROM conversations cv WHERE cv.channel_id = ch.id AND NOT cv.is_test) AS n FROM channels ch WHERE ch.org_id = $1 ORDER BY ch.created_at`,
    [ctx.orgId],
  );
  return rows.map((r) => ({ id: r.id as string, kind: r.kind as ChannelView['kind'], address: r.address as string, label: r.label as string, assistantEnabled: Boolean(r.assistant_enabled), active: Boolean(r.active), conversations: N(r.n) }));
}

/** "whatsapp:+14155238886" for WhatsApp, "+16205269172" for SMS. */
export function channelAddress(kind: 'WHATSAPP' | 'SMS', number: string): string {
  const digits = number.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  const e164 = digits.startsWith('+') ? digits : `+${digits}`;
  if (!/^\+\d{8,15}$/.test(e164)) fail('INVALID', 'Enter the number in international format, like +14155238886.');
  return kind === 'WHATSAPP' ? `whatsapp:${e164}` : e164;
}

export async function saveChannel(db: Db, ctx: Ctx, input: { id?: string; kind?: 'WHATSAPP' | 'SMS'; number?: string; label?: string; assistantEnabled?: boolean; active?: boolean }) {
  requirePermission(ctx, 'configure');
  if (input.id) {
    const [ch] = await db.query<{ id: string }>('SELECT id FROM channels WHERE id = $1 AND org_id = $2', [input.id, ctx.orgId]);
    if (!ch) fail('NOT_FOUND', 'Channel not found.');
    await db.query(
      'UPDATE channels SET label = COALESCE($3, label), assistant_enabled = COALESCE($4, assistant_enabled), active = COALESCE($5, active) WHERE id = $1 AND org_id = $2',
      [input.id, ctx.orgId, input.label?.trim() || null, input.assistantEnabled ?? null, input.active ?? null],
    );
    return input.id;
  }
  if (!input.kind || !input.number) fail('INVALID', 'Choose WhatsApp or SMS and enter the number.');
  const address = channelAddress(input.kind!, input.number!);
  const [taken] = await db.query<{ org_id: string }>('SELECT org_id FROM channels WHERE address = $1', [address]);
  if (taken) fail('CONFLICT', taken.org_id === ctx.orgId ? 'This number is already connected.' : 'This number is connected to another desk.');
  const [row] = await db.query<{ id: string }>(
    'INSERT INTO channels (org_id, kind, address, label) VALUES ($1,$2,$3,$4) RETURNING id',
    [ctx.orgId, input.kind, address, input.label?.trim() || (input.kind === 'WHATSAPP' ? 'WhatsApp' : 'SMS')],
  );
  await db.tx((q) => appendAudit(q, { orgId: ctx.orgId, action: 'channel.connected', actor: { type: 'USER', id: ctx.userId, label: ctx.userName }, data: { kind: input.kind, address } }));
  return row.id;
}

// ---------------------------------------------------------------- test conversations

/** A 1×1 PNG, enough to exercise the receipt path without a real phone. */
const SAMPLE_RECEIPT = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

/**
 * Plays a customer message into the desk without a phone. Test chats are
 * flagged, use a "test:" address so they never merge with a real customer,
 * and their replies are recorded but never sent.
 */
export async function simulateInbound(db: Db, ctx: Ctx, input: { phone: string; name?: string | null; text?: string | null; sampleReceipt?: boolean; channelId?: string | null }) {
  requirePermission(ctx, 'trade');
  const [ch] = await db.query<{ address: string }>(
    `SELECT address FROM channels WHERE org_id = $1 AND active ${input.channelId ? 'AND id = $2' : ''} ORDER BY (kind = 'WHATSAPP') DESC, created_at LIMIT 1`,
    input.channelId ? [ctx.orgId, input.channelId] : [ctx.orgId],
  );
  if (!ch) fail('CONFLICT', 'Connect a WhatsApp or SMS number first.');
  const digits = input.phone.replace(/[^\d]/g, '');
  if (digits.length < 9) fail('INVALID', 'Enter a test phone number.');
  if (!input.text?.trim() && !input.sampleReceipt) fail('INVALID', 'Type a message or attach the sample receipt.');
  return receiveInbound(db, {
    to: ch.address,
    from: `test:+${digits}`,
    body: input.text?.trim() ?? '',
    profileName: input.name ?? null,
    sid: null,
    media: input.sampleReceipt ? [{ contentType: 'image/png', bytes: SAMPLE_RECEIPT }] : [],
    isTest: true,
  });
}
