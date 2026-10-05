import type { Db, Queryable } from './db';
import { actorOf, can, requirePermission, type Ctx } from './auth';
import { appendAudit, type Actor } from './audit';
import { fail } from './errors';
import { hmac, safeEqual } from './secret';
import { humanCode, newToken, sha256 } from './crypto';
import { post, railAccount } from './ledger';
import { computeQuote, CORRIDORS, formatMinor, parseRate, rateToString, type Corridor, type Currency } from '@/lib/money';
import {
  OPEN_STATUSES,
  type Beneficiary,
  type RailRef,
  type Signal,
  type TradeDetail,
  type TradeStatus,
  type TradeSummary,
} from '@/lib/trades';

// ---------------------------------------------------------------- helpers

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const N = (v: unknown) => Number(v ?? 0);

type TradeRow = Record<string, unknown> & {
  id: string;
  org_id: string;
  ref: string;
  status: TradeStatus;
  version: number;
  corridor: Corridor;
  pay_currency: Currency;
  receive_currency: Currency;
  pay_minor: number;
  receive_minor: number;
  fee_minor: number;
  funds_received_minor: number;
  refunded_minor: number;
  customer_id: string;
  portal_nonce: string;
};

function normaliseRow(r: Record<string, unknown>): TradeRow {
  return {
    ...r,
    version: N(r.version),
    pay_minor: N(r.pay_minor),
    receive_minor: N(r.receive_minor),
    fee_minor: N(r.fee_minor),
    funds_received_minor: N(r.funds_received_minor),
    refunded_minor: N(r.refunded_minor),
  } as TradeRow;
}

async function lockTrade(q: Queryable, orgId: string, id: string, expectedVersion?: number): Promise<TradeRow> {
  const [row] = await q.query('SELECT * FROM trades WHERE id = $1 AND org_id = $2 FOR UPDATE', [id, orgId]);
  if (!row) fail('NOT_FOUND', 'Trade not found.');
  const t = normaliseRow(row);
  if (expectedVersion !== undefined && t.version !== expectedVersion) {
    fail('STALE', 'Someone else updated this trade while you had it open. Review the latest version and try again.', { version: t.version });
  }
  return t;
}

function requireStatus(t: TradeRow, allowed: TradeStatus[], action: string) {
  if (!allowed.includes(t.status)) {
    fail('CONFLICT', `You can’t ${action} a trade that is ${t.status.replace(/_/g, ' ').toLowerCase()}.`);
  }
}

async function setStatus(q: Queryable, t: TradeRow, status: TradeStatus, extra: Record<string, unknown> = {}) {
  const cols = Object.keys(extra);
  const sets = cols.map((c, i) => `${c} = $${i + 4}`).join(', ');
  await q.query(
    `UPDATE trades SET status = $3, version = version + 1, updated_at = now()${sets ? `, ${sets}` : ''} WHERE id = $1 AND org_id = $2`,
    [t.id, t.org_id, status, ...cols.map((c) => extra[c])],
  );
}

export function portalToken(tradeId: string, nonce: string): string {
  const idPart = Buffer.from(tradeId.replace(/-/g, ''), 'hex').toString('base64url');
  return `${idPart}.${hmac(`trade-link:${tradeId}:${nonce}`)}`;
}

function parsePortalToken(token: string): { tradeId: string; sig: string } | null {
  const [idPart, sig] = token.split('.');
  if (!idPart || !sig || idPart.length !== 22) return null;
  const hex = Buffer.from(idPart, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  return { tradeId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, sig };
}

export function validateBeneficiary(b: Beneficiary, currency: Currency): Beneficiary {
  const accountNumber = b.accountNumber.replace(/[\s-]/g, '');
  const accountName = b.accountName.trim().replace(/\s+/g, ' ');
  if (accountName.length < 3) fail('INVALID', 'Enter the full name on the receiving account.');
  if (!b.provider.trim()) fail('INVALID', 'Choose the bank or mobile money network.');
  if (b.kind === 'MOMO') {
    if (currency !== 'GHS') fail('INVALID', 'Mobile money payouts are only available for cedis.');
    if (!/^0[235]\d{8}$/.test(accountNumber)) fail('INVALID', 'Ghana mobile money numbers have 10 digits, like 0244123456.');
  } else if (currency === 'NGN' && !/^\d{10}$/.test(accountNumber)) {
    fail('INVALID', 'Nigerian account numbers (NUBAN) have 10 digits.');
  } else if (currency === 'GHS' && !/^\d{8,16}$/.test(accountNumber)) {
    fail('INVALID', 'Enter a valid Ghana bank account number.');
  }
  return { kind: b.kind, provider: b.provider.trim(), accountNumber, accountName, relationship: b.relationship ?? 'SELF' };
}

function namesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true;
  const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((x) => x.length >= 3 && !['ltd', 'limited', 'ventures', 'enterprise', 'enterprises', 'and', 'the', 'mrs', 'miss', 'alhaji', 'chief'].includes(x)));
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return true;
  for (const x of ta) if (tb.has(x)) return true;
  return false;
}

async function pickCollectionRail(q: Queryable, orgId: string, currency: Currency): Promise<string | null> {
  const rows = await q.query<{ id: string; cap: string | number | null; load: string | number }>(
    `SELECT r.id, r.daily_soft_cap_minor AS cap,
       (SELECT COALESCE(SUM(f.amount_minor),0) FROM funds_receipts f
          WHERE f.rail_id = r.id AND f.created_at >= (date_trunc('day', now() AT TIME ZONE o.timezone) AT TIME ZONE o.timezone))
     + (SELECT COALESCE(SUM(t.pay_minor - t.funds_received_minor),0) FROM trades t
          WHERE t.collection_rail_id = r.id AND t.status = 'AWAITING_FUNDS') AS load
     FROM rails r JOIN organizations o ON o.id = r.org_id
     WHERE r.org_id = $1 AND r.currency = $2 AND r.can_collect AND r.status = 'ACTIVE'`,
    [orgId, currency],
  );
  if (!rows.length) return null;
  const scored = rows.map((r) => ({ id: r.id, headroom: r.cap === null ? Number.MAX_SAFE_INTEGER - N(r.load) : N(r.cap) - N(r.load), load: N(r.load) }));
  scored.sort((a, b) => b.headroom - a.headroom || a.load - b.load);
  return scored[0].id;
}

async function orgPolicy(q: Queryable, orgId: string) {
  const [o] = await q.query<Record<string, unknown>>('SELECT * FROM organizations WHERE id = $1', [orgId]);
  return {
    quoteTtl: N(o.quote_ttl_minutes),
    fundsWindow: N(o.funds_window_minutes),
    thresholds: { NGN: N(o.approval_threshold_ngn), GHS: N(o.approval_threshold_ghs) } as Record<Currency, number>,
  };
}

// ---------------------------------------------------------------- expiry

/** Moves stale quotes and unpaid trades to EXPIRED. Safe to call on every read. */
export async function sweepExpired(db: Db, orgId: string) {
  const due = await db.query<{ id: string }>(
    `SELECT id FROM trades WHERE org_id = $1 AND (
       (status = 'QUOTED' AND quote_expires_at < now()) OR
       (status = 'AWAITING_FUNDS' AND funds_received_minor = 0 AND funds_due_at < now()))
     LIMIT 50`,
    [orgId],
  );
  for (const { id } of due) {
    await db.tx(async (q) => {
      const t = await lockTrade(q, orgId, id);
      const quoteStale = t.status === 'QUOTED' && new Date(t.quote_expires_at as string) < new Date();
      const fundsStale = t.status === 'AWAITING_FUNDS' && t.funds_received_minor === 0 && t.funds_due_at && new Date(t.funds_due_at as string) < new Date();
      if (!quoteStale && !fundsStale) return;
      const stage = quoteStale ? 'QUOTE' : 'FUNDS';
      await setStatus(q, t, 'EXPIRED', { closed_reason: stage === 'QUOTE' ? 'Quote expired before it was accepted.' : 'No payment arrived within the payment window.' });
      await appendAudit(q, { orgId, tradeId: t.id, action: 'trade.expired', actor: { type: 'SYSTEM', label: 'Aksen' }, data: { stage } });
    });
  }
}

// ---------------------------------------------------------------- quoting

export interface QuoteInput {
  customerId: string;
  corridor: Corridor;
  mode: 'PAY' | 'RECEIVE';
  amountMinor: number;
  customRate?: string | null;
  feeMinor?: number | null;
  ttlMinutes?: number | null;
  beneficiary?: Beneficiary | null;
  note?: string | null;
}

async function boardFor(q: Queryable, orgId: string, corridor: Corridor) {
  const [rate] = await q.query<Record<string, unknown>>('SELECT * FROM rate_board WHERE org_id = $1 AND corridor = $2', [orgId, corridor]);
  if (!rate || !rate.active) fail('INVALID', `There is no active ${CORRIDORS[corridor].short} rate. Set one on the Rates page first.`);
  return {
    rate: parseRate(String(rate.customer_rate)),
    reference: rate.reference_rate ? parseRate(String(rate.reference_rate)) : null,
    feeMinor: N(rate.fee_minor),
    minPay: N(rate.min_pay_minor),
    maxPay: rate.max_pay_minor === null ? null : N(rate.max_pay_minor),
  };
}

async function quoteInTx(
  q: Queryable,
  orgId: string,
  actor: Actor,
  createdBy: string | null,
  input: QuoteInput,
  conversationId: string | null = null,
): Promise<{ id: string; ref: string; token: string }> {
  const { pay, receive } = CORRIDORS[input.corridor];
  const [customer] = await q.query<{ id: string; kyc_status: string; name: string }>('SELECT id, kyc_status, name FROM customers WHERE id = $1 AND org_id = $2', [input.customerId, orgId]);
  if (!customer) fail('NOT_FOUND', 'Customer not found.');
  if (customer.kyc_status === 'REJECTED') fail('FORBIDDEN', `${customer.name} is marked as rejected. You can’t quote for them.`);
  const board = await boardFor(q, orgId, input.corridor);
  const rate = input.customRate ? parseRate(input.customRate) : board.rate;
  const feeMinor = input.feeMinor ?? board.feeMinor;
  const math = computeQuote({ corridor: input.corridor, mode: input.mode, amountMinor: input.amountMinor, rate, feeMinor });
  if (math.payMinor < board.minPay) fail('INVALID', `The minimum for this corridor is ${formatMinor(board.minPay, pay)}.`);
  if (board.maxPay !== null && math.payMinor > board.maxPay) fail('INVALID', `The maximum for this corridor is ${formatMinor(board.maxPay, pay)}.`);
  const beneficiary = input.beneficiary ? validateBeneficiary(input.beneficiary, receive) : null;
  const policy = await orgPolicy(q, orgId);
  const ttl = Math.min(Math.max(input.ttlMinutes ?? policy.quoteTtl, 1), 1440);

  const [o] = await q.query<{ trade_seq: number }>('UPDATE organizations SET trade_seq = trade_seq + 1 WHERE id = $1 RETURNING trade_seq', [orgId]);
  const ref = `AK-${humanCode(4)}${String(N(o.trade_seq) % 100).padStart(2, '0')}`;
  const nonce = newToken(9);
  const [row] = await q.query<{ id: string }>(
    `INSERT INTO trades (org_id, ref, customer_id, corridor, pay_currency, receive_currency, pay_minor, receive_minor, fee_minor,
       rate, reference_rate, quote_mode, status, quote_expires_at, beneficiary, portal_nonce, note, created_by, conversation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'QUOTED', now() + ($13 || ' minutes')::interval, $14::jsonb, $15, $16, $17, $18)
     RETURNING id`,
    [orgId, ref, customer.id, input.corridor, pay, receive, math.payMinor, math.receiveMinor, math.feeMinor, rateToString(rate), board.reference ? rateToString(board.reference) : null, input.mode, String(ttl), beneficiary ? JSON.stringify(beneficiary) : null, nonce, input.note?.trim() || null, createdBy, conversationId],
  );
  await appendAudit(q, {
    orgId,
    tradeId: row.id,
    action: 'trade.quoted',
    actor,
    data: { ref, corridor: input.corridor, payMinor: math.payMinor, receiveMinor: math.receiveMinor, feeMinor: math.feeMinor, rate: rateToString(rate), customRate: Boolean(input.customRate), ttlMinutes: ttl, ...(conversationId ? { channel: 'chat' } : {}) },
  });
  return { id: row.id, ref, token: portalToken(row.id, nonce) };
}

export async function createQuote(db: Db, ctx: Ctx, input: QuoteInput): Promise<{ id: string; ref: string; token: string }> {
  requirePermission(ctx, 'trade');
  if (input.customRate) requirePermission(ctx, 'approve');
  return db.tx((q) => quoteInTx(q, ctx.orgId, actorOf(ctx), ctx.userId, input));
}

/**
 * A quote the customer asked for in a chat, raised by the desk's assistant.
 * Always at the board rate and fee with the desk's default validity; custom
 * pricing stays an operator decision.
 */
export async function createChatQuote(
  db: Db,
  input: { orgId: string; conversationId: string; actorLabel: string; customerId: string; corridor: Corridor; mode: 'PAY' | 'RECEIVE'; amountMinor: number },
): Promise<{ id: string; ref: string; token: string }> {
  const { orgId, conversationId, actorLabel, ...quote } = input;
  return db.tx((q) => quoteInTx(q, orgId, { type: 'SYSTEM', label: actorLabel }, null, { ...quote, customRate: null, feeMinor: null, ttlMinutes: null }, conversationId));
}

/** The customer called the trade off in chat before any money was recorded. */
export async function cancelFromChat(db: Db, input: { orgId: string; tradeId: string; customerName: string }) {
  await db.tx(async (q) => {
    const t = await lockTrade(q, input.orgId, input.tradeId);
    requireStatus(t, ['QUOTED', 'AWAITING_FUNDS'], 'cancel');
    if (t.funds_received_minor > 0) fail('CONFLICT', 'Money has already been recorded for this trade.');
    await setStatus(q, t, 'CANCELLED', { closed_reason: 'Customer cancelled in chat.' });
    await appendAudit(q, { orgId: input.orgId, tradeId: t.id, action: 'trade.cancelled', actor: customerActor(input.customerName), data: { reason: 'Customer cancelled in chat.' } });
  });
}

export async function requote(db: Db, ctx: Ctx, id: string, version: number) {
  requirePermission(ctx, 'trade');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, id, version);
    requireStatus(t, ['QUOTED', 'EXPIRED'], 'refresh the quote on');
    if (t.funds_received_minor > 0) fail('CONFLICT', 'Money has already arrived for this trade. Put it on hold or refund instead.');
    const board = await boardFor(q, ctx.orgId, t.corridor);
    const policy = await orgPolicy(q, ctx.orgId);
    const math = computeQuote({
      corridor: t.corridor,
      mode: t.quote_mode as 'PAY' | 'RECEIVE',
      amountMinor: t.quote_mode === 'PAY' ? t.pay_minor : t.receive_minor,
      rate: board.rate,
      feeMinor: board.feeMinor,
    });
    await setStatus(q, t, 'QUOTED', {
      pay_minor: math.payMinor,
      receive_minor: math.receiveMinor,
      fee_minor: math.feeMinor,
      rate: rateToString(board.rate),
      reference_rate: board.reference ? rateToString(board.reference) : null,
      quote_expires_at: new Date(Date.now() + policy.quoteTtl * 60_000),
      accepted_at: null,
      accepted_by: null,
      funds_due_at: null,
      collection_rail_id: null,
      closed_reason: null,
    });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.requoted', actor: actorOf(ctx), data: { rate: rateToString(board.rate), payMinor: math.payMinor, receiveMinor: math.receiveMinor } });
  });
}

// ---------------------------------------------------------------- acceptance

async function acceptInTx(q: Queryable, t: TradeRow, actor: Actor, by: 'CUSTOMER' | 'OPERATOR', beneficiary?: Beneficiary | null) {
  requireStatus(t, ['QUOTED'], 'accept');
  if (new Date(t.quote_expires_at as string) < new Date()) fail('EXPIRED', 'This quote has expired. Ask the desk for a fresh quote.');
  const ben = beneficiary ? validateBeneficiary(beneficiary, t.receive_currency) : (t.beneficiary as Beneficiary | null);
  if (!ben) fail('INVALID', 'Add the payout details (who receives the money) before accepting.');
  const railId = await pickCollectionRail(q, t.org_id, t.pay_currency);
  if (!railId) {
    fail('CONFLICT', by === 'CUSTOMER'
      ? 'The desk is not ready to receive payments right now. Please contact them.'
      : `Add an active ${t.pay_currency} collection account before accepting trades.`);
  }
  const policy = await orgPolicy(q, t.org_id);
  await setStatus(q, t, 'AWAITING_FUNDS', {
    accepted_at: new Date(),
    accepted_by: by,
    beneficiary: JSON.stringify(ben),
    collection_rail_id: railId,
    funds_due_at: new Date(Date.now() + policy.fundsWindow * 60_000),
  });
  if (beneficiary) await appendAudit(q, { orgId: t.org_id, tradeId: t.id, action: 'trade.beneficiary_set', actor, data: { kind: ben!.kind, provider: ben!.provider, relationship: ben!.relationship } });
  await appendAudit(q, { orgId: t.org_id, tradeId: t.id, action: 'trade.accepted', actor, data: { by, railId } });
}

export async function acceptForCustomer(db: Db, ctx: Ctx, input: { id: string; version: number; beneficiary?: Beneficiary | null }) {
  requirePermission(ctx, 'trade');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    await acceptInTx(q, t, actorOf(ctx), 'OPERATOR', input.beneficiary);
  });
}

export async function setBeneficiary(db: Db, ctx: Ctx, input: { id: string; version: number; beneficiary: Beneficiary }) {
  requirePermission(ctx, 'trade');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['QUOTED', 'AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'ON_HOLD'], 'change payout details on');
    const ben = validateBeneficiary(input.beneficiary, t.receive_currency);
    await q.query('UPDATE trades SET beneficiary = $3::jsonb, version = version + 1, updated_at = now() WHERE id = $1 AND org_id = $2', [t.id, t.org_id, JSON.stringify(ben)]);
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.beneficiary_set', actor: actorOf(ctx), data: { kind: ben.kind, provider: ben.provider, accountNumber: ben.accountNumber, accountName: ben.accountName, relationship: ben.relationship } });
  });
}

// ---------------------------------------------------------------- evidence

const ALLOWED_MIME: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export interface EvidenceInput {
  note?: string | null;
  file?: { name: string; mime: string; bytes: Uint8Array } | null;
}

async function addEvidenceInTx(q: Queryable, t: TradeRow, actor: Actor, by: 'CUSTOMER' | 'OPERATOR', input: EvidenceInput) {
  const note = input.note?.trim().slice(0, 500) || null;
  if (!note && !input.file) fail('INVALID', 'Attach a file or write a short note.');
  let hash: string | null = null;
  if (input.file) {
    const { bytes, mime } = input.file;
    if (bytes.length > MAX_EVIDENCE_BYTES) fail('INVALID', 'Files must be 4 MB or smaller.');
    const check = ALLOWED_MIME[mime];
    if (!check || !check(bytes)) fail('INVALID', 'Upload a JPG, PNG, WebP image or a PDF.');
    hash = sha256(bytes);
  }
  const [count] = await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM evidence WHERE trade_id = $1', [t.id]);
  if (N(count.n) >= 10) fail('CONFLICT', 'This trade already has 10 attachments. Contact the desk directly.');
  await q.query(
    `INSERT INTO evidence (org_id, trade_id, submitted_by, note, file_name, mime, size_bytes, sha256, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [t.org_id, t.id, by, note, input.file?.name.slice(0, 120) ?? null, input.file?.mime ?? null, input.file?.bytes.length ?? null, hash, input.file ? Buffer.from(input.file.bytes) : null],
  );
  await q.query('UPDATE trades SET updated_at = now() WHERE id = $1', [t.id]);
  await appendAudit(q, { orgId: t.org_id, tradeId: t.id, action: 'trade.evidence_added', actor, data: { submittedBy: by, hasFile: Boolean(input.file), sha256: hash, note } });
}

export async function addEvidence(db: Db, ctx: Ctx, id: string, input: EvidenceInput) {
  requirePermission(ctx, 'trade');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, id);
    requireStatus(t, ['AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'APPROVED', 'ON_HOLD', 'REFUND_DUE', 'COMPLETED', 'EXPIRED'], 'attach evidence to');
    await addEvidenceInTx(q, t, actorOf(ctx), 'OPERATOR', input);
  });
}

export async function getEvidenceFile(db: Db, orgId: string, tradeId: string, evidenceId: string) {
  const [row] = await db.query<{ data: Uint8Array | null; mime: string | null; file_name: string | null }>(
    'SELECT data, mime, file_name FROM evidence WHERE id = $1 AND trade_id = $2 AND org_id = $3',
    [evidenceId, tradeId, orgId],
  );
  if (!row || !row.data) fail('NOT_FOUND', 'File not found.');
  return { bytes: new Uint8Array(row.data as Uint8Array), mime: row.mime ?? 'application/octet-stream', name: row.file_name ?? 'evidence' };
}

// ---------------------------------------------------------------- funds

export async function recordFunds(
  db: Db,
  ctx: Ctx,
  input: { id: string; version: number; railId: string; amountMinor: number; bankReference: string; payerName?: string | null },
) {
  requirePermission(ctx, 'trade');
  const reference = input.bankReference.trim();
  if (reference.length < 4) fail('INVALID', 'Enter the bank or MoMo transaction reference from the statement.');
  if (!(input.amountMinor > 0)) fail('INVALID', 'Enter the amount that arrived.');
  return db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    if (t.status === 'QUOTED') fail('CONFLICT', 'Accept the quote first so the customer gets payment instructions.');
    const [rail] = await q.query<{ id: string; currency: string; can_collect: boolean; status: string; label: string }>('SELECT id, currency, can_collect, status, label FROM rails WHERE id = $1 AND org_id = $2', [input.railId, ctx.orgId]);
    if (!rail) fail('NOT_FOUND', 'Collection account not found.');
    if (rail.currency !== t.pay_currency) fail('INVALID', `This trade is paid in ${t.pay_currency}; ${rail.label} holds ${rail.currency}.`);
    const [dupe] = await q.query<{ ref: string }>(
      'SELECT t.ref FROM funds_receipts f JOIN trades t ON t.id = f.trade_id WHERE f.org_id = $1 AND f.rail_id = $2 AND f.bank_reference = $3',
      [ctx.orgId, rail.id, reference],
    );
    if (dupe) fail('CONFLICT', `Reference ${reference} on ${rail.label} is already recorded against ${dupe.ref}. One credit can only pay for one trade.`);

    await q.query(
      `INSERT INTO funds_receipts (org_id, trade_id, rail_id, currency, amount_minor, bank_reference, payer_name, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ctx.orgId, t.id, rail.id, t.pay_currency, input.amountMinor, reference, input.payerName?.trim() || null, ctx.userId],
    );
    await post(q, {
      orgId: ctx.orgId,
      tradeId: t.id,
      kind: 'funds_received',
      memo: `${t.ref} credit ${reference}`,
      userId: ctx.userId,
      lines: [
        { account: railAccount(rail.id), currency: t.pay_currency, amountMinor: input.amountMinor },
        { account: 'payable:customer', currency: t.pay_currency, amountMinor: -input.amountMinor },
      ],
    });
    const received = t.funds_received_minor + input.amountMinor;
    const full = received >= t.pay_minor;
    const extra: Record<string, unknown> = { funds_received_minor: received };
    let next: TradeStatus = t.status;

    if (t.status === 'AWAITING_FUNDS') {
      if (full) {
        next = 'FUNDS_CONFIRMED';
        Object.assign(extra, { funds_confirmed_at: new Date(), funds_confirmed_by: ctx.userId });
      }
    } else if (t.status === 'EXPIRED' || t.status === 'CANCELLED') {
      next = 'ON_HOLD';
      Object.assign(extra, {
        status_before_hold: full ? 'FUNDS_CONFIRMED' : 'AWAITING_FUNDS',
        hold_reason: `Money arrived after the trade was ${t.status.toLowerCase()}. Confirm the rate with the customer, then release or refund.`,
        ...(full ? { funds_confirmed_at: new Date(), funds_confirmed_by: ctx.userId } : {}),
      });
    } else if (t.status === 'ON_HOLD' && t.status_before_hold === 'AWAITING_FUNDS' && full) {
      Object.assign(extra, { status_before_hold: 'FUNDS_CONFIRMED', funds_confirmed_at: new Date(), funds_confirmed_by: ctx.userId });
    }
    await setStatus(q, t, next, extra);
    await appendAudit(q, {
      orgId: ctx.orgId,
      tradeId: t.id,
      action: 'trade.funds_recorded',
      actor: actorOf(ctx),
      data: { amount: formatMinor(input.amountMinor, t.pay_currency), amountMinor: input.amountMinor, railId: rail.id, reference, payerName: input.payerName ?? null, totalReceivedMinor: received },
    });
    if (next === 'FUNDS_CONFIRMED' || (next === 'ON_HOLD' && full)) {
      await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.funds_confirmed', actor: actorOf(ctx), data: { receivedMinor: received, dueMinor: t.pay_minor } });
    }
    if (next === 'ON_HOLD' && t.status !== 'ON_HOLD') {
      await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.held', actor: { type: 'SYSTEM', label: 'Aksen' }, data: { reason: extra.hold_reason } });
    }
    return { status: next, receivedMinor: received, shortfallMinor: Math.max(0, t.pay_minor - received), excessMinor: Math.max(0, received - t.pay_minor) };
  });
}

// ---------------------------------------------------------------- approval & payout

export async function approvePayout(db: Db, ctx: Ctx, input: { id: string; version: number; acknowledged: string[] }) {
  requirePermission(ctx, 'approve');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['FUNDS_CONFIRMED'], 'approve');
    if (!t.beneficiary) fail('INVALID', 'Add the payout details before approving.');
    const policy = await orgPolicy(q, ctx.orgId);
    if (t.receive_minor >= policy.thresholds[t.receive_currency] && t.funds_confirmed_by === ctx.userId) {
      fail('FOUR_EYES', `Payouts of ${formatMinor(policy.thresholds[t.receive_currency], t.receive_currency)} or more need a second person. You confirmed the funds, so another admin must approve.`);
    }
    const signals = await computeSignals(q, ctx.orgId, t);
    if (signals.some((s) => s.code === 'KYC_REJECTED')) fail('FORBIDDEN', 'This customer is marked as rejected. Refund instead of paying out.');
    const mustAck = signals.filter((s) => s.level !== 'info').map((s) => s.code);
    const missing = mustAck.filter((c) => !input.acknowledged.includes(c));
    if (missing.length) fail('INVALID', 'Review and tick every warning before approving.', { missing });
    await setStatus(q, t, 'APPROVED', { approved_at: new Date(), approved_by: ctx.userId });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.approved', actor: actorOf(ctx), data: { acknowledged: mustAck } });
  });
}

export async function recordPayout(db: Db, ctx: Ctx, input: { id: string; version: number; railId: string; reference: string }) {
  requirePermission(ctx, 'trade');
  const reference = input.reference.trim();
  if (reference.length < 4) fail('INVALID', 'Enter the payout transaction reference.');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['APPROVED'], 'record a payout for');
    const [rail] = await q.query<{ id: string; currency: string; can_pay: boolean; status: string; label: string }>('SELECT id, currency, can_pay, status, label FROM rails WHERE id = $1 AND org_id = $2', [input.railId, ctx.orgId]);
    if (!rail) fail('NOT_FOUND', 'Payout account not found.');
    if (rail.currency !== t.receive_currency || !rail.can_pay) fail('INVALID', `Choose a ${t.receive_currency} account that can pay out.`);
    if (rail.status !== 'ACTIVE') fail('INVALID', `${rail.label} is paused. Choose an active account.`);
    // Desks keep account balances private: Aksen records which account paid, not how much is left in it.
    const [dupe] = await q.query<{ ref: string }>('SELECT t.ref FROM payouts p JOIN trades t ON t.id = p.trade_id WHERE p.org_id = $1 AND p.rail_id = $2 AND p.reference = $3', [ctx.orgId, rail.id, reference]);
    if (dupe) fail('CONFLICT', `Payout reference ${reference} is already used on ${dupe.ref}.`);
    await q.query(
      `INSERT INTO payouts (org_id, trade_id, rail_id, kind, currency, amount_minor, reference, recorded_by)
       VALUES ($1,$2,$3,'PAYOUT',$4,$5,$6,$7)`,
      [ctx.orgId, t.id, rail.id, t.receive_currency, t.receive_minor, reference, ctx.userId],
    );
    await post(q, {
      orgId: ctx.orgId,
      tradeId: t.id,
      kind: 'payout',
      memo: `${t.ref} payout ${reference}`,
      userId: ctx.userId,
      lines: [
        { account: 'payable:customer', currency: t.pay_currency, amountMinor: t.pay_minor },
        { account: 'fx:position', currency: t.pay_currency, amountMinor: -(t.pay_minor - t.fee_minor) },
        { account: 'revenue:fees', currency: t.pay_currency, amountMinor: -t.fee_minor },
        { account: 'fx:position', currency: t.receive_currency, amountMinor: t.receive_minor },
        { account: railAccount(rail.id), currency: t.receive_currency, amountMinor: -t.receive_minor },
      ],
    });
    await setStatus(q, t, 'COMPLETED', { paid_out_at: new Date(), paid_out_by: ctx.userId, completed_at: new Date() });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.paid_out', actor: actorOf(ctx), data: { reference, railId: rail.id, amountMinor: t.receive_minor } });
  });
}

// ---------------------------------------------------------------- holds, cancel, refunds, notes

export async function holdTrade(db: Db, ctx: Ctx, input: { id: string; version: number; reason: string }) {
  requirePermission(ctx, 'trade');
  if (input.reason.trim().length < 5) fail('INVALID', 'Say why the trade is on hold.');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'APPROVED'], 'hold');
    await setStatus(q, t, 'ON_HOLD', { status_before_hold: t.status, hold_reason: input.reason.trim() });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.held', actor: actorOf(ctx), data: { reason: input.reason.trim(), from: t.status } });
  });
}

export async function releaseHold(db: Db, ctx: Ctx, input: { id: string; version: number }) {
  requirePermission(ctx, 'approve');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['ON_HOLD'], 'release');
    const back = (t.status_before_hold as TradeStatus) || 'AWAITING_FUNDS';
    const policy = await orgPolicy(q, ctx.orgId);
    const extra: Record<string, unknown> = { status_before_hold: null, hold_reason: null };
    if (back === 'AWAITING_FUNDS') extra.funds_due_at = new Date(Date.now() + policy.fundsWindow * 60_000);
    // Approval is never carried through a hold: a released trade must be approved again.
    const target: TradeStatus = back === 'APPROVED' ? 'FUNDS_CONFIRMED' : back;
    if (back === 'APPROVED') Object.assign(extra, { approved_at: null, approved_by: null });
    await setStatus(q, t, target, extra);
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.released', actor: actorOf(ctx), data: { to: target } });
  });
}

export async function cancelTrade(db: Db, ctx: Ctx, input: { id: string; version: number; reason: string }) {
  requirePermission(ctx, 'trade');
  if (input.reason.trim().length < 3) fail('INVALID', 'Give a short reason.');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['QUOTED', 'AWAITING_FUNDS', 'ON_HOLD', 'EXPIRED'], 'cancel');
    if (t.funds_received_minor > 0) fail('CONFLICT', 'Money has arrived for this trade. Mark it for refund instead of cancelling.');
    await setStatus(q, t, 'CANCELLED', { closed_reason: input.reason.trim(), hold_reason: null, status_before_hold: null });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.cancelled', actor: actorOf(ctx), data: { reason: input.reason.trim() } });
  });
}

export async function markRefundDue(db: Db, ctx: Ctx, input: { id: string; version: number; reason: string }) {
  requirePermission(ctx, 'approve');
  if (input.reason.trim().length < 5) fail('INVALID', 'Say why the money is going back.');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'APPROVED', 'ON_HOLD'], 'refund');
    if (t.funds_received_minor - t.refunded_minor <= 0) fail('CONFLICT', 'No money has been received for this trade. Cancel it instead.');
    await setStatus(q, t, 'REFUND_DUE', { closed_reason: input.reason.trim(), hold_reason: null, status_before_hold: null, approved_at: null, approved_by: null });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.refund_due', actor: actorOf(ctx), data: { reason: input.reason.trim() } });
  });
}

export async function recordRefund(db: Db, ctx: Ctx, input: { id: string; version: number; railId: string; amountMinor: number; reference: string }) {
  requirePermission(ctx, 'trade');
  const reference = input.reference.trim();
  if (reference.length < 4) fail('INVALID', 'Enter the refund transaction reference.');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    requireStatus(t, ['REFUND_DUE', 'COMPLETED'], 'record a refund for');
    const refundable = t.status === 'COMPLETED' ? t.funds_received_minor - t.pay_minor - t.refunded_minor : t.funds_received_minor - t.refunded_minor;
    if (refundable <= 0) fail('CONFLICT', 'Nothing is owed back to the customer on this trade.');
    if (!(input.amountMinor > 0) || input.amountMinor > refundable) fail('INVALID', `You can refund up to ${formatMinor(refundable, t.pay_currency)}.`);
    const [rail] = await q.query<{ id: string; currency: string; can_pay: boolean; label: string }>('SELECT id, currency, can_pay, label FROM rails WHERE id = $1 AND org_id = $2', [input.railId, ctx.orgId]);
    if (!rail || rail.currency !== t.pay_currency || !rail.can_pay) fail('INVALID', `Choose a ${t.pay_currency} account that can pay out.`);
    await q.query(
      `INSERT INTO payouts (org_id, trade_id, rail_id, kind, currency, amount_minor, reference, recorded_by)
       VALUES ($1,$2,$3,'REFUND',$4,$5,$6,$7)`,
      [ctx.orgId, t.id, rail.id, t.pay_currency, input.amountMinor, reference, ctx.userId],
    ).catch((e: Error) => {
      if (/unique/i.test(e.message)) fail('CONFLICT', `Reference ${reference} is already recorded on ${rail.label}.`);
      throw e;
    });
    await post(q, {
      orgId: ctx.orgId,
      tradeId: t.id,
      kind: 'refund',
      memo: `${t.ref} refund ${reference}`,
      userId: ctx.userId,
      lines: [
        { account: 'payable:customer', currency: t.pay_currency, amountMinor: input.amountMinor },
        { account: railAccount(rail.id), currency: t.pay_currency, amountMinor: -input.amountMinor },
      ],
    });
    const refunded = t.refunded_minor + input.amountMinor;
    const done = t.status === 'REFUND_DUE' && refunded >= t.funds_received_minor;
    await setStatus(q, t, done ? 'REFUNDED' : t.status, { refunded_minor: refunded });
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.refunded', actor: actorOf(ctx), data: { reference, amountMinor: input.amountMinor, railId: rail.id, totalRefundedMinor: refunded } });
  });
}

export async function addNote(db: Db, ctx: Ctx, id: string, note: string) {
  requirePermission(ctx, 'trade');
  const text = note.trim().slice(0, 1000);
  if (!text) fail('INVALID', 'Write a note first.');
  await db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, id);
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.note', actor: actorOf(ctx), data: { note: text } });
  });
}

export async function reissueLink(db: Db, ctx: Ctx, input: { id: string; version: number }) {
  requirePermission(ctx, 'trade');
  return db.tx(async (q) => {
    const t = await lockTrade(q, ctx.orgId, input.id, input.version);
    const nonce = newToken(9);
    await q.query('UPDATE trades SET portal_nonce = $3, version = version + 1, updated_at = now() WHERE id = $1 AND org_id = $2', [t.id, t.org_id, nonce]);
    await appendAudit(q, { orgId: ctx.orgId, tradeId: t.id, action: 'trade.link_reissued', actor: actorOf(ctx), data: {} });
    return portalToken(t.id, nonce);
  });
}

// ---------------------------------------------------------------- signals

/**
 * Deterministic checks shown to the operator. They are prompts to look
 * closer, never verdicts: a different payer or beneficiary is common and
 * legitimate in remittance. Anything at 'warn' or 'critical' must be
 * explicitly acknowledged before approval, and the acknowledgement is audited.
 */
export async function computeSignals(q: Queryable, orgId: string, t: TradeRow): Promise<Signal[]> {
  const out: Signal[] = [];
  const [c] = await q.query<{ name: string; kyc_status: string; per_trade_limit_ngn: string | number | null }>('SELECT name, kyc_status, per_trade_limit_ngn FROM customers WHERE id = $1', [t.customer_id]);
  const ngnSide = t.pay_currency === 'NGN' ? t.pay_minor : t.receive_minor;

  if (c.kyc_status === 'REJECTED') out.push({ code: 'KYC_REJECTED', level: 'critical', title: 'Customer is marked rejected', detail: 'Your desk previously rejected this customer.' });
  else if (c.kyc_status !== 'VERIFIED') out.push({ code: 'KYC_UNVERIFIED', level: 'warn', title: 'Customer not verified', detail: 'Complete your desk’s customer checks before paying out.' });

  if (c.per_trade_limit_ngn !== null && ngnSide > N(c.per_trade_limit_ngn)) {
    out.push({ code: 'OVER_LIMIT', level: 'warn', title: 'Above this customer’s limit', detail: `Trade is ${formatMinor(ngnSide, 'NGN')}; the customer’s limit is ${formatMinor(N(c.per_trade_limit_ngn), 'NGN')}.` });
  }

  const [hist] = await q.query<{ n: number; median: string | number | null }>(
    `SELECT COUNT(*)::int AS n,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN pay_currency='NGN' THEN pay_minor ELSE receive_minor END) AS median
       FROM trades WHERE customer_id = $1 AND status = 'COMPLETED' AND id <> $2`,
    [t.customer_id, t.id],
  );
  if (N(hist.n) === 0) out.push({ code: 'FIRST_TRADE', level: 'info', title: 'First trade with this customer', detail: 'No completed trades on record yet.' });
  else if (hist.median && ngnSide > N(hist.median) * 5) {
    out.push({ code: 'UNUSUAL_SIZE', level: 'warn', title: 'Much larger than usual', detail: `About ${Math.round(ngnSide / N(hist.median))}× this customer’s typical trade of ${formatMinor(N(hist.median), 'NGN')}.` });
  }

  const ben = t.beneficiary as Beneficiary | null;
  if (ben && !namesMatch(c.name, ben.accountName)) {
    out.push(ben.relationship === 'SELF'
      ? { code: 'BENEFICIARY_NAME', level: 'warn', title: 'Payout name differs from customer', detail: `Payout account is in the name “${ben.accountName}” but marked as the customer’s own account.` }
      : { code: 'THIRD_PARTY_PAYOUT', level: 'info', title: 'Paying a third party', detail: `Payout goes to “${ben.accountName}” (${ben.relationship.toLowerCase()}).` });
  }

  const receipts = await q.query<{ payer_name: string | null; rail_id: string }>('SELECT payer_name, rail_id FROM funds_receipts WHERE trade_id = $1', [t.id]);
  const otherPayers = receipts.filter((r) => r.payer_name && !namesMatch(c.name, r.payer_name));
  if (otherPayers.length) {
    out.push({ code: 'THIRD_PARTY_PAYER', level: 'warn', title: 'Paid by someone else', detail: `Credit came from “${otherPayers[0].payer_name}”, not ${c.name}. Confirm the relationship before paying out.` });
  }
  if (t.collection_rail_id && receipts.some((r) => r.rail_id !== t.collection_rail_id)) {
    out.push({ code: 'OTHER_ACCOUNT', level: 'info', title: 'Paid into a different account', detail: 'Part of the payment arrived in an account other than the one on the instructions.' });
  }

  if (t.funds_received_minor > t.pay_minor) {
    out.push({ code: 'OVERPAID', level: 'warn', title: 'Customer overpaid', detail: `${formatMinor(t.funds_received_minor - t.pay_minor, t.pay_currency)} more than due. Refund the excess after payout.` });
  } else if (t.funds_received_minor > 0 && t.funds_received_minor < t.pay_minor) {
    out.push({ code: 'UNDERPAID', level: 'warn', title: 'Partial payment', detail: `${formatMinor(t.pay_minor - t.funds_received_minor, t.pay_currency)} still outstanding.` });
  }

  const dupes = await q.query<{ ref: string }>(
    `SELECT DISTINCT t2.ref FROM evidence e1
       JOIN evidence e2 ON e2.org_id = e1.org_id AND e2.sha256 = e1.sha256 AND e2.trade_id <> e1.trade_id
       JOIN trades t2 ON t2.id = e2.trade_id
      WHERE e1.trade_id = $1 AND e1.sha256 IS NOT NULL`,
    [t.id],
  );
  if (dupes.length) {
    out.push({ code: 'REUSED_PROOF', level: 'critical', title: 'Same proof used on another trade', detail: `An identical file was submitted for ${dupes.map((d) => d.ref).join(', ')}. Check the bank statement directly.` });
  }

  const [board] = await q.query<{ customer_rate: string }>('SELECT customer_rate FROM rate_board WHERE org_id = $1 AND corridor = $2', [orgId, t.corridor]);
  const [quoted] = await q.query<{ data: { customRate?: boolean } }>(`SELECT data FROM audit_events WHERE trade_id = $1 AND action = 'trade.quoted' LIMIT 1`, [t.id]);
  if (quoted?.data?.customRate) out.push({ code: 'CUSTOM_RATE', level: 'info', title: 'Custom rate', detail: `Quoted at ${t.rate} instead of the board rate${board ? ` (${rateToString(parseRate(String(board.customer_rate)))} now)` : ''}.` });

  const [late] = await q.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM audit_events WHERE trade_id = $1 AND action = 'trade.expired'`, [t.id]);
  if (N(late.n) > 0 && t.funds_received_minor > 0) out.push({ code: 'LATE_FUNDS', level: 'warn', title: 'Funds arrived late', detail: 'Payment came after the window closed. Confirm the customer still accepts this rate.' });

  return out;
}

// ---------------------------------------------------------------- reads

const SUMMARY_SELECT = `
  SELECT t.*, c.ref AS c_ref, c.name AS c_name, c.phone AS c_phone, c.kyc_status AS c_kyc,
    (SELECT COUNT(*) FROM evidence e WHERE e.trade_id = t.id) AS evidence_count,
    EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test) AS is_test
  FROM trades t JOIN customers c ON c.id = t.customer_id`;

function toSummary(r: Record<string, unknown>): TradeSummary {
  const t = normaliseRow(r);
  return {
    id: t.id,
    ref: t.ref,
    status: t.status,
    version: t.version,
    corridor: t.corridor,
    payCurrency: t.pay_currency,
    receiveCurrency: t.receive_currency,
    payMinor: t.pay_minor,
    receiveMinor: t.receive_minor,
    feeMinor: t.fee_minor,
    rate: rateToString(parseRate(String(r.rate))),
    quoteExpiresAt: iso(r.quote_expires_at)!,
    fundsDueAt: iso(r.funds_due_at),
    customer: { id: t.customer_id, ref: r.c_ref as string, name: r.c_name as string, phone: (r.c_phone as string) ?? null, kycStatus: r.c_kyc as TradeSummary['customer']['kycStatus'] },
    beneficiary: (typeof r.beneficiary === 'string' ? JSON.parse(r.beneficiary) : r.beneficiary) as Beneficiary | null,
    fundsReceivedMinor: t.funds_received_minor,
    refundedMinor: t.refunded_minor,
    evidenceCount: N(r.evidence_count),
    holdReason: (r.hold_reason as string) ?? null,
    isTest: Boolean(r.is_test),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

export interface TradeFilter {
  status?: TradeStatus[] | 'OPEN' | 'ALL';
  q?: string;
  customerId?: string;
  corridor?: Corridor;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listTrades(db: Db, ctx: Ctx, f: TradeFilter = {}): Promise<TradeSummary[]> {
  await sweepExpired(db, ctx.orgId);
  const where = ['t.org_id = $1'];
  const params: unknown[] = [ctx.orgId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.status === 'OPEN') add('t.status = ANY(?::text[])', OPEN_STATUSES);
  else if (Array.isArray(f.status) && f.status.length) add('t.status = ANY(?::text[])', f.status);
  if (f.customerId) add('t.customer_id = ?', f.customerId);
  if (f.corridor) add('t.corridor = ?', f.corridor);
  if (f.from) add('t.created_at >= ?::timestamptz', f.from);
  if (f.to) add('t.created_at < ?::timestamptz', f.to);
  if (f.q?.trim()) {
    params.push(`%${f.q.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(t.ref ILIKE ${p} OR c.name ILIKE ${p} OR c.phone ILIKE ${p} OR t.beneficiary->>'accountName' ILIKE ${p} OR t.beneficiary->>'accountNumber' ILIKE ${p}
      OR EXISTS (SELECT 1 FROM funds_receipts fr WHERE fr.trade_id = t.id AND fr.bank_reference ILIKE ${p})
      OR EXISTS (SELECT 1 FROM payouts po WHERE po.trade_id = t.id AND po.reference ILIKE ${p}))`);
  }
  params.push(Math.min(f.limit ?? 200, 1000));
  const rows = await db.query(`${SUMMARY_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC LIMIT $${params.length}`, params);
  return rows.map(toSummary);
}

export async function getTrade(db: Db, ctx: Ctx, id: string): Promise<TradeDetail> {
  await sweepExpired(db, ctx.orgId);
  const [r] = await db.query(`${SUMMARY_SELECT} WHERE t.org_id = $1 AND t.id = $2`, [ctx.orgId, id]);
  if (!r) fail('NOT_FOUND', 'Trade not found.');
  const t = normaliseRow(r);
  const names = await db.query<{ id: string; name: string }>('SELECT u.id, u.name FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.org_id = $1', [ctx.orgId]);
  const who = (uid: unknown) => (uid ? names.find((n) => n.id === uid)?.name ?? 'Former member' : null);

  const rails = await db.query<Record<string, unknown>>('SELECT * FROM rails WHERE org_id = $1', [ctx.orgId]);
  const railRef = (rid: unknown): RailRef | null => {
    const x = rails.find((rr) => rr.id === rid);
    return x ? { id: x.id as string, label: x.label as string, currency: x.currency as Currency, kind: x.kind as 'BANK' | 'MOMO', provider: x.provider as string, accountNumber: x.account_number as string, accountName: x.account_name as string } : null;
  };

  const receipts = await db.query<Record<string, unknown>>('SELECT * FROM funds_receipts WHERE trade_id = $1 AND org_id = $2 ORDER BY created_at', [t.id, ctx.orgId]);
  const payouts = await db.query<Record<string, unknown>>('SELECT * FROM payouts WHERE trade_id = $1 AND org_id = $2 ORDER BY created_at', [t.id, ctx.orgId]);
  const evidence = await db.query<Record<string, unknown>>('SELECT id, submitted_by, note, file_name, mime, size_bytes, sha256, created_at FROM evidence WHERE trade_id = $1 AND org_id = $2 ORDER BY created_at', [t.id, ctx.orgId]);
  const events = await db.query<Record<string, unknown>>('SELECT seq, action, actor_type, actor_label, data, at_iso, hash FROM audit_events WHERE trade_id = $1 AND org_id = $2 ORDER BY seq', [t.id, ctx.orgId]);
  const signals = OPEN_STATUSES.includes(t.status) || t.status === 'COMPLETED' ? await computeSignals(db, ctx.orgId, t) : [];
  const policy = await orgPolicy(db, ctx.orgId);

  return {
    ...toSummary(r),
    referenceRate: r.reference_rate ? rateToString(parseRate(String(r.reference_rate))) : null,
    quoteMode: r.quote_mode as 'PAY' | 'RECEIVE',
    acceptedAt: iso(r.accepted_at),
    acceptedBy: (r.accepted_by as string) ?? null,
    collectionRail: railRef(r.collection_rail_id),
    fundsConfirmedAt: iso(r.funds_confirmed_at),
    fundsConfirmedBy: who(r.funds_confirmed_by),
    approvedAt: iso(r.approved_at),
    approvedBy: who(r.approved_by),
    paidOutAt: iso(r.paid_out_at),
    paidOutBy: who(r.paid_out_by),
    completedAt: iso(r.completed_at),
    closedReason: (r.closed_reason as string) ?? null,
    statusBeforeHold: (r.status_before_hold as TradeStatus) ?? null,
    note: (r.note as string) ?? null,
    createdBy: who(r.created_by),
    receipts: receipts.map((x) => ({ id: x.id as string, amountMinor: N(x.amount_minor), currency: x.currency as Currency, bankReference: x.bank_reference as string, payerName: (x.payer_name as string) ?? null, rail: railRef(x.rail_id)?.label ?? '—', recordedBy: who(x.recorded_by) ?? '—', at: iso(x.created_at)! })),
    payouts: payouts.map((x) => ({ id: x.id as string, kind: x.kind as 'PAYOUT' | 'REFUND', amountMinor: N(x.amount_minor), currency: x.currency as Currency, reference: x.reference as string, rail: railRef(x.rail_id)?.label ?? '—', recordedBy: who(x.recorded_by) ?? '—', at: iso(x.created_at)! })),
    evidence: evidence.map((x) => ({ id: x.id as string, submittedBy: x.submitted_by as 'CUSTOMER' | 'OPERATOR', note: (x.note as string) ?? null, fileName: (x.file_name as string) ?? null, mime: (x.mime as string) ?? null, sizeBytes: x.size_bytes === null ? null : N(x.size_bytes), sha256: (x.sha256 as string) ?? null, at: iso(x.created_at)! })),
    events: events.map((e) => ({ seq: N(e.seq), action: e.action as string, actorType: e.actor_type as 'USER', actorLabel: e.actor_label as string, data: (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as Record<string, unknown>, at: e.at_iso as string, hash: e.hash as string })),
    signals,
    needsSecondPerson: t.receive_minor >= policy.thresholds[t.receive_currency],
    portalPath: `/t/${portalToken(t.id, t.portal_nonce)}`,
    conversationId: (r.conversation_id as string) ?? null,
  };
}

/** Counts for the desk's work queue. */
export async function queueCounts(db: Db, ctx: Ctx) {
  await sweepExpired(db, ctx.orgId);
  const rows = await db.query<{ status: TradeStatus; n: number; with_evidence: number }>(
    `SELECT status, COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM evidence e WHERE e.trade_id = t.id AND e.submitted_by = 'CUSTOMER'))::int AS with_evidence
       FROM trades t WHERE org_id = $1 AND status = ANY($2::text[]) GROUP BY status`,
    [ctx.orgId, OPEN_STATUSES],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, { n: N(r.n), withEvidence: N(r.with_evidence) }]));
  return by as Partial<Record<TradeStatus, { n: number; withEvidence: number }>>;
}

// ---------------------------------------------------------------- customer portal

export interface PortalView {
  desk: { name: string; supportPhone: string | null; customerNote: string | null; isDemo: boolean };
  trade: {
    ref: string;
    status: TradeStatus;
    corridor: Corridor;
    payCurrency: Currency;
    receiveCurrency: Currency;
    payMinor: number;
    receiveMinor: number;
    feeMinor: number;
    rate: string;
    quoteExpiresAt: string;
    fundsDueAt: string | null;
    fundsReceivedMinor: number;
    refundedMinor: number;
    customerName: string;
    beneficiary: Beneficiary | null;
    paymentInstructions: { provider: string; accountNumber: string; accountName: string; kind: 'BANK' | 'MOMO'; reference: string } | null;
    payoutReference: string | null;
    evidenceCount: number;
    holdReasonPublic: string | null;
    closedReason: string | null;
    updatedAt: string;
  };
  timeline: { action: string; at: string; actor: 'YOU' | 'DESK' | 'SYSTEM' }[];
  proof: { events: number; head: string } | null;
}

async function loadPortalTrade(q: Queryable, token: string, forUpdate = false): Promise<TradeRow> {
  const parsed = parsePortalToken(token);
  const invalid = () => fail('NOT_FOUND', 'This trade link is not valid. Ask the desk to send it again.');
  if (!parsed) return invalid();
  const [row] = await q.query(`SELECT * FROM trades WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [parsed.tradeId]);
  if (!row) return invalid();
  const t = normaliseRow(row);
  if (!safeEqual(portalToken(t.id, t.portal_nonce), token)) return invalid();
  return t;
}

export async function getPortalView(db: Db, token: string): Promise<PortalView> {
  const parsedId = parsePortalToken(token)?.tradeId;
  const pre = parsedId ? await db.query<{ org_id: string }>('SELECT org_id FROM trades WHERE id = $1', [parsedId]) : [];
  if (pre[0]) await sweepExpired(db, pre[0].org_id);
  const t = await loadPortalTrade(db, token);
  const [o] = await db.query<Record<string, unknown>>('SELECT name, support_phone, customer_note, is_demo FROM organizations WHERE id = $1', [t.org_id]);
  const [c] = await db.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [t.customer_id]);
  const rail = t.collection_rail_id ? (await db.query<Record<string, unknown>>('SELECT * FROM rails WHERE id = $1', [t.collection_rail_id]))[0] : null;
  const [payout] = await db.query<{ reference: string }>(`SELECT reference FROM payouts WHERE trade_id = $1 AND kind = 'PAYOUT'`, [t.id]);
  const [ev] = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM evidence WHERE trade_id = $1 AND submitted_by = 'CUSTOMER'`, [t.id]);
  const events = await db.query<{ action: string; at_iso: string; actor_type: string }>(
    `SELECT action, at_iso, actor_type FROM audit_events WHERE trade_id = $1 AND action = ANY($2::text[]) ORDER BY seq`,
    [t.id, ['trade.quoted', 'trade.requoted', 'trade.accepted', 'trade.evidence_added', 'trade.funds_confirmed', 'trade.approved', 'trade.paid_out', 'trade.held', 'trade.released', 'trade.cancelled', 'trade.expired', 'trade.refund_due', 'trade.refunded']],
  );
  const showInstructions = rail && (t.status === 'AWAITING_FUNDS' || (t.status === 'ON_HOLD' && t.status_before_hold === 'AWAITING_FUNDS'));
  const done = t.status === 'COMPLETED' || t.status === 'REFUNDED';
  const proof = done ? (await db.query<{ seq: number; hash: string }>('SELECT seq, hash FROM audit_events WHERE trade_id = $1 ORDER BY seq DESC LIMIT 1', [t.id]))[0] : null;
  const ben = (typeof t.beneficiary === 'string' ? JSON.parse(t.beneficiary) : t.beneficiary) as Beneficiary | null;
  return {
    desk: { name: o.name as string, supportPhone: (o.support_phone as string) ?? null, customerNote: (o.customer_note as string) ?? null, isDemo: Boolean(o.is_demo) },
    trade: {
      ref: t.ref,
      status: t.status,
      corridor: t.corridor,
      payCurrency: t.pay_currency,
      receiveCurrency: t.receive_currency,
      payMinor: t.pay_minor,
      receiveMinor: t.receive_minor,
      feeMinor: t.fee_minor,
      rate: rateToString(parseRate(String(t.rate))),
      quoteExpiresAt: iso(t.quote_expires_at)!,
      fundsDueAt: iso(t.funds_due_at),
      fundsReceivedMinor: t.funds_received_minor,
      refundedMinor: t.refunded_minor,
      customerName: c.name,
      beneficiary: ben ? { ...ben, accountNumber: `•••• ${ben.accountNumber.slice(-4)}` } : null,
      paymentInstructions: showInstructions ? { provider: rail!.provider as string, accountNumber: rail!.account_number as string, accountName: rail!.account_name as string, kind: rail!.kind as 'BANK' | 'MOMO', reference: t.ref } : null,
      payoutReference: payout?.reference ?? null,
      evidenceCount: N(ev.n),
      holdReasonPublic: t.status === 'ON_HOLD' ? 'The desk is reviewing this trade. They will contact you if anything is needed.' : null,
      closedReason: t.status === 'EXPIRED' || t.status === 'CANCELLED' ? ((t.closed_reason as string) ?? null) : null,
      updatedAt: iso(t.updated_at)!,
    },
    timeline: events.map((e) => ({ action: e.action, at: e.at_iso, actor: e.actor_type === 'CUSTOMER' ? 'YOU' : e.actor_type === 'SYSTEM' ? 'SYSTEM' : 'DESK' })),
    proof: proof ? { events: N(proof.seq), head: proof.hash } : null,
  };
}

const customerActor = (name: string): Actor => ({ type: 'CUSTOMER', label: name });

export async function portalAccept(db: Db, token: string, beneficiary: Beneficiary | null) {
  await db.tx(async (q) => {
    const t = await loadPortalTrade(q, token, true);
    const [c] = await q.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [t.customer_id]);
    await acceptInTx(q, t, customerActor(c.name), 'CUSTOMER', beneficiary);
  });
}

export async function portalAddEvidence(db: Db, token: string, input: EvidenceInput) {
  await db.tx(async (q) => {
    const t = await loadPortalTrade(q, token, true);
    if (!['AWAITING_FUNDS', 'ON_HOLD'].includes(t.status)) fail('CONFLICT', 'This trade is no longer waiting for payment proof.');
    const [c] = await q.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [t.customer_id]);
    await addEvidenceInTx(q, t, customerActor(c.name), 'CUSTOMER', input);
  });
}

export async function canSeeTrade(ctx: Ctx) {
  return can(ctx, 'read');
}
