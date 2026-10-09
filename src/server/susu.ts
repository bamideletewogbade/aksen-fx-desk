import { createHash, randomUUID } from 'node:crypto';
import type { Db, Queryable } from './db';
import { actorOf, requirePermission, type Ctx } from './auth';
import { appendAudit } from './audit';
import { fail } from './errors';
import { todayIn } from './day-close';
import { closeMath, daysInMonth, dueToday, expectedByToday, nextPeriod, periodLabel, periodOf, splitCash, standing, streak, type Period, type Standing } from '@/lib/susu';
import { formatMinor, type Currency } from '@/lib/money';
import { queueSusuSms, saverSusuSms, smsDate, smsMoney, smsPhone, smsText } from './susu-sms';

/**
 * Susu (daily savings) for a desk. Desk staff record cash they collect; the
 * booklet rules live in src/lib/susu.ts. Savers have no login or app.
 */

const N = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const MAX_PAGES_AHEAD = 24;
const smsBrand = () => smsText(process.env.SUSU_SMS_BRAND?.trim() || 'Dinero-Yard');

// ---------------------------------------------------------------- types

export interface SusuPage {
  id: string;
  pageNo: number;
  period: Period;
  startDay: number;
  capacity: number;
  dailyMinor: number;
  broughtForwardMinor: number;
  daysPaid: number;
  status: 'OPEN' | 'CLOSED';
  closeKind: 'PAYOUT' | 'ROLLOVER' | 'WITHDRAWAL' | null;
  feeMinor: number | null;
  paidOutMinor: number | null;
  carriedMinor: number | null;
  payoutMethod: string | null;
  payoutReference: string | null;
  closedAt: string | null;
}

export interface SaverSummary {
  id: string;
  ref: string;
  name: string;
  phone: string | null;
  smsEnabled: boolean;
  smsAutoSend: boolean;
  notes: string | null;
  currency: Currency;
  dailyMinor: number;
  nextDailyMinor: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  createdAt: string;
  page: (SusuPage & { expected: number; standing: Standing; balanceIfClosedMinor: number; availableIfClosedMinor: number; feeMinor: number; savedMinor: number }) | null;
  /** Everything held for this saver right now: brought forward plus all boxes on open pages. */
  heldMinor: number;
  /** Repayable cash taken against savings. It never creates or removes calendar days. */
  advanceOutstandingMinor: number;
  prepaidDays: number;
  streak: number;
  lastPaidAt: string | null;
}

// ---------------------------------------------------------------- helpers

function mapPage(r: Record<string, unknown>): SusuPage {
  return {
    id: r.id as string,
    pageNo: N(r.page_no),
    period: r.period as string,
    startDay: N(r.start_day),
    capacity: N(r.capacity),
    dailyMinor: N(r.daily_minor),
    broughtForwardMinor: N(r.brought_forward_minor),
    daysPaid: N(r.days_paid),
    status: r.status as SusuPage['status'],
    closeKind: (r.close_kind as SusuPage['closeKind']) ?? null,
    feeMinor: r.fee_minor === null || r.fee_minor === undefined ? null : N(r.fee_minor),
    paidOutMinor: r.paid_out_minor === null || r.paid_out_minor === undefined ? null : N(r.paid_out_minor),
    carriedMinor: r.carried_minor === null || r.carried_minor === undefined ? null : N(r.carried_minor),
    payoutMethod: (r.payout_method as string) ?? null,
    payoutReference: (r.payout_reference as string) ?? null,
    closedAt: iso(r.closed_at),
  };
}

async function orgToday(q: Queryable, orgId: string): Promise<string> {
  const [o] = await q.query<{ timezone: string }>('SELECT timezone FROM organizations WHERE id = $1', [orgId]);
  return todayIn(o?.timezone || 'Africa/Accra');
}

type SaverRow = { id: string; org_id: string; name: string; daily_minor: string | number; next_daily_minor: string | number | null; status: string; currency: Currency; sms_enabled: boolean; sms_auto_send: boolean };

async function lockSaver(q: Queryable, orgId: string, id: string): Promise<SaverRow> {
  const [s] = await q.query<SaverRow>('SELECT * FROM susu_savers WHERE id = $1 AND org_id = $2 FOR UPDATE', [id, orgId]);
  if (!s) fail('NOT_FOUND', 'Saver not found.');
  return s;
}

async function advanceOutstanding(q: Queryable, orgId: string, saverId: string): Promise<number> {
  const [r] = await q.query<{ total: string | number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind='ADVANCE' THEN amount_minor ELSE -amount_minor END),0) AS total
       FROM susu_advance_transactions WHERE org_id=$1 AND saver_id=$2`,
    [orgId, saverId],
  );
  return Math.max(0, N(r?.total));
}

/** Client-requested numeric sequence, unique within one desk. */
async function nextSusuTransactionRef(q: Queryable, orgId: string): Promise<string> {
  const [row] = await q.query<{ susu_transaction_seq: string }>(
    'UPDATE organizations SET susu_transaction_seq = susu_transaction_seq + 1 WHERE id = $1 RETURNING susu_transaction_seq',
    [orgId],
  );
  if (!row) fail('NOT_FOUND', 'Desk not found.');
  return String(row.susu_transaction_seq);
}

/** Opens a new page. The saver's pending daily-amount change (if any) takes effect here. */
async function openPage(q: Queryable, saver: SaverRow, input: { period: Period; startDay: number; capacity: number; broughtForwardMinor?: number }): Promise<SusuPage> {
  const [{ n }] = await q.query<{ n: number }>('SELECT COALESCE(MAX(page_no), 0) + 1 AS n FROM susu_pages WHERE saver_id = $1', [saver.id]);
  const daily = saver.next_daily_minor !== null ? N(saver.next_daily_minor) : N(saver.daily_minor);
  if (saver.next_daily_minor !== null) {
    await q.query('UPDATE susu_savers SET daily_minor = next_daily_minor, next_daily_minor = NULL WHERE id = $1', [saver.id]);
    saver.daily_minor = daily;
    saver.next_daily_minor = null;
  }
  const [row] = await q.query<Record<string, unknown>>(
    `INSERT INTO susu_pages (org_id, saver_id, page_no, period, start_day, capacity, daily_minor, brought_forward_minor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [saver.org_id, saver.id, N(n), input.period, input.startDay, input.capacity, daily, input.broughtForwardMinor ?? 0],
  );
  return mapPage(row);
}

function fullMonth(period: Period) {
  return { period, startDay: 1, capacity: daysInMonth(period) };
}

// ---------------------------------------------------------------- savers

export async function saveSaver(
  db: Db,
  ctx: Ctx,
  input: { id?: string; name: string; phone?: string | null; dailyMinor: number; notes?: string | null; status?: SaverSummary['status']; smsEnabled?: boolean; smsAutoSend?: boolean },
): Promise<{ id: string; dailyChange: 'now' | 'next_page' | null }> {
  requirePermission(ctx, 'trade');
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) fail('INVALID', 'Enter the saver’s name.');
  if (!(input.dailyMinor > 0)) fail('INVALID', 'Enter the amount they save each day.');
  const phone = input.phone?.replace(/[^\d+]/g, '') || null;
  if (input.smsEnabled && !smsPhone(phone)) fail('INVALID', 'Enter a valid mobile number for SMS, such as 0244123456 or +233244123456.');
  return db.tx(async (q) => {
    const today = await orgToday(q, ctx.orgId);
    if (input.id) {
      const s = await lockSaver(q, ctx.orgId, input.id);
      const smsEnabled = !!smsPhone(phone) && (input.smsEnabled ?? s.sms_enabled);
      const smsAutoSend = smsEnabled && (input.smsAutoSend ?? s.sms_auto_send);
      await q.query('UPDATE susu_savers SET name = $3, phone = $4, notes = $5, status = COALESCE($6, status) WHERE id = $1 AND org_id = $2', [s.id, ctx.orgId, name, phone, input.notes?.trim() || null, input.status ?? null]);
      await q.query('UPDATE susu_savers SET sms_enabled=$2, sms_auto_send=$3 WHERE id=$1', [s.id, smsEnabled, smsAutoSend]);
      // Never deliver a queued financial receipt to an edited number later.
      await q.query(`UPDATE susu_sms SET status='CANCELLED',error_code='recipient_or_preference_changed',updated_at=now() WHERE saver_id=$1 AND status IN ('DRAFT','QUEUED','FAILED') AND (recipient IS DISTINCT FROM $2 OR NOT (SELECT sms_enabled FROM susu_savers WHERE id=$1))`, [s.id, smsPhone(phone)]);
      let dailyChange: 'now' | 'next_page' | null = null;
      if (input.dailyMinor === N(s.daily_minor) && s.next_daily_minor !== null) {
        // Choosing the current amount again cancels a change queued for a future page.
        await q.query('UPDATE susu_savers SET next_daily_minor = NULL WHERE id = $1', [s.id]);
      } else if (input.dailyMinor !== N(s.daily_minor)) {
        // An untouched page can switch now; otherwise the new amount starts on the next page so filled boxes keep their value.
        const [cur] = await q.query<{ id: string; days_paid: number }>(
          `SELECT id, days_paid FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN' AND period = $2 ORDER BY page_no LIMIT 1`,
          [s.id, periodOf(today)],
        );
        if (cur && N(cur.days_paid) === 0) {
          await q.query('UPDATE susu_pages SET daily_minor = $2 WHERE id = $1', [cur.id, input.dailyMinor]);
          await q.query('UPDATE susu_savers SET daily_minor = $2, next_daily_minor = NULL WHERE id = $1', [s.id, input.dailyMinor]);
          dailyChange = 'now';
        } else {
          await q.query('UPDATE susu_savers SET next_daily_minor = $2 WHERE id = $1', [s.id, input.dailyMinor]);
          dailyChange = 'next_page';
        }
      }
      await appendAudit(q, { orgId: ctx.orgId, action: 'susu.saver_updated', actor: actorOf(ctx), data: { saverId: s.id, name, dailyMinor: input.dailyMinor, dailyChange, status: input.status ?? null } });
      if (dailyChange || (input.status && input.status !== s.status)) {
        const changes = [dailyChange ? `Daily saving ${smsMoney(input.dailyMinor, s.currency)} ${dailyChange === 'next_page' ? 'from your next new page' : 'from now'}.` : '', input.status && input.status !== s.status ? `Booklet ${input.status.toLowerCase()}.` : ''].filter(Boolean).join(' ');
        await queueSusuSms(q,ctx,s.id,`update:${randomUUID()}`,'ACCOUNT_UPDATE',`${smsBrand()}: ${changes} Contact your collector for questions.`);
      }
      return { id: s.id, dailyChange };
    }
    const [o] = await q.query<{ susu_seq: number; susu_sms_auto_send: boolean }>(
      'UPDATE organizations SET susu_seq = susu_seq + 1 WHERE id = $1 RETURNING susu_seq, COALESCE(susu_sms_auto_send, false) AS susu_sms_auto_send',
      [ctx.orgId],
    );
    const ref = `S-${String(N(o.susu_seq)).padStart(4, '0')}`;
    const [row] = await q.query<SaverRow>(
      `INSERT INTO susu_savers (org_id, ref, name, phone, notes, daily_minor, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.orgId, ref, name, phone, input.notes?.trim() || null, input.dailyMinor, ctx.userId],
    );
    // First page starts on today's box: a saver joining on the 20th of a 31-day month has 12 boxes.
    const period = periodOf(today);
    const day = Number(today.slice(8, 10));
    await openPage(q, row, { period, startDay: day, capacity: daysInMonth(period) - day + 1 });
    const autoSend = input.smsAutoSend !== undefined ? input.smsAutoSend : o.susu_sms_auto_send;
    await q.query('UPDATE susu_savers SET sms_enabled=$2, sms_auto_send=$3 WHERE id=$1',[row.id,input.smsEnabled ?? false,(input.smsEnabled ?? false) && autoSend]);
    await queueSusuSms(q,ctx,row.id,`welcome:${row.id}`,'WELCOME',`${smsBrand()}: Welcome, ${smsText(name,20)}. Saver ${ref}. Save ${smsMoney(input.dailyMinor)} daily. Each closed page has a one-day contribution fee. Keep your receipts.`);
    await appendAudit(q, { orgId: ctx.orgId, action: 'susu.saver_added', actor: actorOf(ctx), data: { saverId: row.id, ref, name, dailyMinor: input.dailyMinor } });
    return { id: row.id, dailyChange: null };
  });
}

// ---------------------------------------------------------------- collections

export interface CollectionResult {
  saverId: string;
  name: string;
  receivedMinor: number;
  days: number;
  changeMinor: number;
  pages: { period: Period; days: number }[];
}

async function oncePerRequest<T>(q: Queryable, ctx: Ctx, requestId: string | undefined, payload: unknown, record: () => Promise<T>): Promise<T> {
  if (!requestId) return record(); // Direct domain calls and older test fixtures.
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  // The unique key is the concurrency gate: an identical retry waits for the
  // first transaction, then reads its committed result instead of collecting again.
  await q.query(
    `INSERT INTO susu_collection_requests (org_id, request_id, payload_hash)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ctx.orgId, requestId, hash],
  );
  const [saved] = await q.query<{ payload_hash: string; result: T | string | null }>(
    'SELECT payload_hash, result FROM susu_collection_requests WHERE org_id = $1 AND request_id = $2 FOR UPDATE',
    [ctx.orgId, requestId],
  );
  if (saved.payload_hash !== hash) fail('CONFLICT', 'This request was already used for different details. Refresh and try again.');
  if (saved.result !== null) return (typeof saved.result === 'string' ? JSON.parse(saved.result) : saved.result) as T;
  const result = await record();
  await q.query('UPDATE susu_collection_requests SET result = $3::jsonb WHERE org_id = $1 AND request_id = $2', [ctx.orgId, requestId, JSON.stringify(result)]);
  return result;
}

/**
 * Records cash a saver handed over. Fills whole boxes from this month onward
 * (missed boxes this month are caught up first), spills extra days onto the
 * next months, and returns the change that doesn't make a whole day.
 */
export async function recordCollection(db: Db, ctx: Ctx, input: { saverId: string; amountMinor: number; note?: string | null; requestId?: string }): Promise<CollectionResult> {
  requirePermission(ctx, 'trade');
  if (!(input.amountMinor > 0)) fail('INVALID', 'Enter the amount collected.');
  return db.tx((q) => oncePerRequest(q, ctx, input.requestId, { kind: 'single', saverId: input.saverId, amountMinor: input.amountMinor, note: input.note?.trim() || null }, () => collectInTx(q, ctx, input)));
}

async function collectInTx(q: Queryable, ctx: Ctx, input: { saverId: string; amountMinor: number; note?: string | null }): Promise<CollectionResult> {
  const saver = await lockSaver(q, ctx.orgId, input.saverId);
  if (saver.status !== 'ACTIVE') fail('CONFLICT', `${saver.name}’s booklet is ${saver.status.toLowerCase()}. Reopen it before collecting.`);
  const today = await orgToday(q, ctx.orgId);
  const current = periodOf(today);

  // Money only goes onto this month's page or later ones; boxes of a month that has ended can't be filled.
  const open = (await q.query<Record<string, unknown>>(
    `SELECT * FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN' AND period >= $2 ORDER BY period, page_no`,
    [saver.id, current],
  )).map(mapPage);
  if (!open.length || open[0].period !== current) open.unshift(await openPage(q, saver, fullMonth(current)));

  if (input.amountMinor < open[0].dailyMinor) {
    fail('INVALID', `${formatMinor(input.amountMinor, saver.currency)} is less than one day for ${saver.name} (${formatMinor(open[0].dailyMinor, saver.currency)}).`);
  }

  let remaining = input.amountMinor;
  const credited: { page: SusuPage; days: number }[] = [];
  for (let i = 0; i < MAX_PAGES_AHEAD + 1; i++) {
    let page = open[i];
    if (!page) {
      if (remaining < (saver.next_daily_minor !== null ? N(saver.next_daily_minor) : N(saver.daily_minor))) break;
      const last = open[open.length - 1];
      page = await openPage(q, saver, fullMonth(nextPeriod(last.period)));
      open.push(page);
    }
    const free = page.capacity - page.daysPaid;
    if (free <= 0) continue;
    const d = Math.min(splitCash(remaining, page.dailyMinor).days, free);
    if (d === 0) break;
    credited.push({ page, days: d });
    remaining -= d * page.dailyMinor;
    if (remaining < page.dailyMinor && d < free) break;
  }
  const days = credited.reduce((s, c) => s + c.days, 0);
  if (!days) fail('INVALID', 'That amount doesn’t cover a whole day.');

  const paymentId = randomUUID();
  for (const [k, c] of credited.entries()) {
    await q.query('UPDATE susu_pages SET days_paid = days_paid + $2 WHERE id = $1', [c.page.id, c.days]);
    await q.query(
      `INSERT INTO susu_collections (org_id, saver_id, page_id, payment_id, days, amount_minor, received_minor, change_minor, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [ctx.orgId, saver.id, c.page.id, paymentId, c.days, c.days * c.page.dailyMinor, k === 0 ? input.amountMinor : 0, k === 0 ? remaining : 0, k === 0 ? input.note?.trim() || null : null, ctx.userId],
    );
  }
  await appendAudit(q, {
    orgId: ctx.orgId,
    action: 'susu.collected',
    actor: actorOf(ctx),
    data: { saverId: saver.id, receivedMinor: input.amountMinor, days, changeMinor: remaining, pages: credited.map((c) => ({ period: c.page.period, days: c.days })) },
  });
  const [held] = await q.query<{ total: string; subtotal: string }>(
    `SELECT
       COALESCE(SUM(brought_forward_minor + days_paid*daily_minor),0) AS total,
       COALESCE(SUM(brought_forward_minor + days_paid*daily_minor - CASE WHEN days_paid>0 THEN daily_minor ELSE 0 END),0) AS subtotal
     FROM susu_pages WHERE saver_id=$1 AND status='OPEN'`,
    [saver.id],
  );
  await queueSusuSms(q,ctx,saver.id,`collection:${paymentId}`,'COLLECTION',`${smsBrand()}: Receipt: ${smsMoney(input.amountMinor-remaining,saver.currency)}, ${smsDate(today)}, Total: ${smsMoney(N(held.total),saver.currency)}, Sub-total saving: ${smsMoney(N(held.subtotal),saver.currency)}.`);
  return { saverId: saver.id, name: saver.name, receivedMinor: input.amountMinor, days, changeMinor: remaining, pages: credited.map((c) => ({ period: c.page.period, days: c.days })) };
}

// ---------------------------------------------------------------- closing pages

export type CloseKind = 'PAYOUT' | 'ROLLOVER' | 'WITHDRAWAL';

/**
 * Closes a page with the one-day fee.
 * - PAYOUT / ROLLOVER: once the month is over (or on its last day).
 * - WITHDRAWAL: any time; the month's remaining boxes continue on a fresh page.
 */
export async function closePage(
  db: Db,
  ctx: Ctx,
  input: { pageId: string; kind: CloseKind; amountMinor?: number; method?: string | null; reference?: string | null },
): Promise<{ feeMinor: number; balanceMinor: number; advanceSettledMinor: number; settlementTransactionRef: string | null; paidOutMinor: number; carriedMinor: number; kind: CloseKind; name: string; period: Period }> {
  requirePermission(ctx, 'trade');
  return db.tx((q) => closeInTx(q, ctx, input));
}

async function closeInTx(q: Queryable, ctx: Ctx, input: { pageId: string; kind: CloseKind; amountMinor?: number; method?: string | null; reference?: string | null }) {
  // A rollover stays on the desk; a payout or withdrawal releases saver funds.
  if (input.kind !== 'ROLLOVER') requirePermission(ctx, 'approve');
  const [identity] = await q.query<{ saver_id: string }>('SELECT saver_id FROM susu_pages WHERE id = $1 AND org_id = $2', [input.pageId, ctx.orgId]);
  if (!identity) fail('NOT_FOUND', 'Page not found.');
  // Collections and edits lock the saver first. Keep that order for closes too.
  const saver = await lockSaver(q, ctx.orgId, identity.saver_id);
  const [raw] = await q.query<Record<string, unknown>>('SELECT * FROM susu_pages WHERE id = $1 AND org_id = $2 FOR UPDATE', [input.pageId, ctx.orgId]);
  if (!raw) fail('NOT_FOUND', 'Page not found.');
  const page = mapPage(raw);
  if (page.status !== 'OPEN') fail('CONFLICT', 'This page is already closed.');
  const today = await orgToday(q, ctx.orgId);
  const current = periodOf(today);
  const lastDay = Number(today.slice(8, 10)) === daysInMonth(current);
  if (page.period > current) fail('CONFLICT', 'This page is for a future month (prepaid days). Close it when that month ends.');
  if (input.kind !== 'WITHDRAWAL' && page.period === current && !lastDay) {
    fail('CONFLICT', `${periodLabel(page.period)} isn’t over yet. To pay out before month end, record a withdrawal.`);
  }
  const m = closeMath(page);
  const advanceBefore = await advanceOutstanding(q, ctx.orgId, saver.id);
  const advanceSettled = Math.min(advanceBefore, m.balanceMinor);
  const availableBalance = m.balanceMinor - advanceSettled;
  if (input.kind === 'WITHDRAWAL' && availableBalance <= 0) fail('CONFLICT', `${saver.name} has nothing to withdraw after the collection fee and outstanding advance.`);
  const requested = input.kind === 'WITHDRAWAL' ? input.amountMinor ?? availableBalance : availableBalance;
  if (input.kind === 'WITHDRAWAL' && !(requested > 0)) fail('INVALID', 'Enter an amount to withdraw.');
  if (input.kind === 'WITHDRAWAL' && requested > availableBalance) fail('INVALID', `The most ${saver.name} can withdraw is ${formatMinor(availableBalance, saver.currency)} after the collection fee and outstanding advance.`);
  if (input.kind === 'WITHDRAWAL' && saver.status === 'CLOSED' && requested < availableBalance) fail('CONFLICT', `Withdraw the full ${formatMinor(availableBalance, saver.currency)} balance because this booklet is closed.`);
  const paidOut = input.kind === 'ROLLOVER' ? 0 : requested;
  const carried = input.kind === 'ROLLOVER' ? availableBalance : input.kind === 'WITHDRAWAL' ? availableBalance - paidOut : 0;

  let settlementTransactionRef: string | null = null;
  if (advanceSettled > 0) {
    settlementTransactionRef = await nextSusuTransactionRef(q, ctx.orgId);
    await q.query(
      `INSERT INTO susu_advance_transactions (org_id,saver_id,kind,amount_minor,transaction_ref,note,recorded_by)
       VALUES ($1,$2,'SETTLEMENT',$3,$4,$5,$6)`,
      [ctx.orgId, saver.id, advanceSettled, settlementTransactionRef, `Deducted when ${page.period} page ${page.pageNo} closed`, ctx.userId],
    );
  }

  await q.query(
    `UPDATE susu_pages SET status = 'CLOSED', close_kind = $2, fee_minor = $3, paid_out_minor = $4, carried_minor = $5,
       payout_method = $6, payout_reference = $7, closed_at = now(), closed_by = $8,
       capacity = CASE WHEN $2 = 'WITHDRAWAL' THEN days_paid ELSE capacity END
     WHERE id = $1`,
    [page.id, input.kind, m.feeMinor, paidOut, carried, paidOut ? input.method?.trim() || 'Cash' : null, paidOut ? input.reference?.trim() || null : null, ctx.userId],
  );

  if (input.kind === 'WITHDRAWAL') {
    const left = page.capacity - page.daysPaid;
    if (left > 0 && saver.status !== 'CLOSED') {
      await openPage(q, saver, { period: page.period, startDay: page.startDay + page.daysPaid, capacity: left, broughtForwardMinor: carried });
    } else if (carried > 0) {
      const [next] = await q.query<{ id: string }>(
        `SELECT id FROM susu_pages WHERE saver_id=$1 AND status='OPEN' ORDER BY period,page_no LIMIT 1`,
        [saver.id],
      );
      if (next) await q.query('UPDATE susu_pages SET brought_forward_minor=brought_forward_minor+$2 WHERE id=$1', [next.id, carried]);
      else if (saver.status !== 'CLOSED') await openPage(q, saver, { ...fullMonth(nextPeriod(page.period)), broughtForwardMinor: carried });
    }
  } else if (input.kind === 'ROLLOVER') {
    // Carry onto the saver's next page: one they've already prepaid into, or a fresh one for next month.
    const [next] = await q.query<{ id: string }>(
      `SELECT id FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN' AND (period > $2 OR (period = $2 AND page_no > $3)) ORDER BY period, page_no LIMIT 1`,
      [saver.id, page.period, page.pageNo],
    );
    if (next) await q.query('UPDATE susu_pages SET brought_forward_minor = brought_forward_minor + $2 WHERE id = $1', [next.id, carried]);
    else await openPage(q, saver, { ...fullMonth(nextPeriod(page.period)), broughtForwardMinor: carried });
  }

  await appendAudit(q, {
    orgId: ctx.orgId,
    action: 'susu.page_closed',
    actor: actorOf(ctx),
    data: { saverId: saver.id, pageId: page.id, period: page.period, kind: input.kind, daysPaid: page.daysPaid, feeMinor: m.feeMinor, advanceSettledMinor: advanceSettled, settlementTransactionRef, paidOutMinor: paidOut, carriedMinor: carried },
  });
  const action = input.kind === 'ROLLOVER' ? 'Carried forward' : input.kind === 'WITHDRAWAL' ? 'Withdrawal recorded' : 'Payout recorded';
  const remaining = input.kind === 'WITHDRAWAL' ? ` Remaining saved: ${smsMoney(carried,saver.currency)}.` : '';
  const advanceLine = advanceSettled > 0 ? ` Borrowed money settled: ${smsMoney(advanceSettled,saver.currency)} (Ref ${settlementTransactionRef}).` : '';
  await queueSusuSms(q,ctx,saver.id,`close:${page.id}`,input.kind,`${smsBrand()}: ${page.period} page ${page.pageNo}. ${action}: ${smsMoney(input.kind === 'ROLLOVER' ? carried : paidOut,saver.currency)}. Fee: ${smsMoney(m.feeMinor,saver.currency)}.${advanceLine}${remaining}${input.kind === 'ROLLOVER' ? ' No cash paid out.' : ` Method: ${smsText(input.method?.trim() || 'Cash',20)}. Contact your collector if not received.`}`);
  return { feeMinor: m.feeMinor, balanceMinor: m.balanceMinor, advanceSettledMinor: advanceSettled, settlementTransactionRef, paidOutMinor: paidOut, carriedMinor: carried, kind: input.kind, name: saver.name, period: page.period };
}

/** Month end: close several pages at once. All succeed or none do. */
export async function closePages(db: Db, ctx: Ctx, rows: { pageId: string; kind: CloseKind; method?: string | null; reference?: string | null }[]) {
  requirePermission(ctx, 'trade');
  if (!rows.length) fail('INVALID', 'Choose at least one page to close.');
  return db.tx(async (q) => {
    // Two operators may close overlapping batches in different UI orders.
    // Acquire all saver locks in one stable order before touching any pages.
    const ids = [...new Set((await q.query<{ saver_id: string }>(
      'SELECT saver_id FROM susu_pages WHERE org_id = $1 AND id = ANY($2::uuid[])',
      [ctx.orgId, rows.map((r) => r.pageId)],
    )).map((r) => r.saver_id))].sort();
    for (const id of ids) await lockSaver(q, ctx.orgId, id);
    const out = [];
    for (const r of rows) out.push(await closeInTx(q, ctx, r));
    return out;
  });
}

/** Withdraw some or all funds now: closes the current page and carries any remainder. */
export async function withdraw(db: Db, ctx: Ctx, input: { saverId: string; amountMinor?: number; method?: string | null; reference?: string | null; requestId?: string }) {
  requirePermission(ctx, 'trade');
  requirePermission(ctx, 'approve');
  return db.tx((q) => oncePerRequest(q, ctx, input.requestId, {
    kind: 'withdrawal', saverId: input.saverId, amountMinor: input.amountMinor ?? null,
    method: input.method?.trim() || 'Cash', reference: input.reference?.trim() || null,
  }, async () => {
    const today = await orgToday(q, ctx.orgId);
    const [p] = await q.query<{ id: string }>(
      `SELECT id FROM susu_pages WHERE saver_id = $1 AND org_id = $2 AND status = 'OPEN' AND period <= $3 ORDER BY period, page_no LIMIT 1`,
      [input.saverId, ctx.orgId, periodOf(today)],
    );
    if (!p) fail('CONFLICT', 'There is no open page to withdraw from.');
    return closeInTx(q, ctx, { pageId: p.id, kind: 'WITHDRAWAL', amountMinor: input.amountMinor, method: input.method, reference: input.reference });
  }));
}

/** Cash temporarily taken against savings. Calendar boxes remain unchanged. */
export async function recordAdvance(db: Db, ctx: Ctx, input: { saverId: string; amountMinor: number; method?: string | null; reference?: string | null; note?: string | null; requestId?: string }) {
  requirePermission(ctx, 'trade');
  requirePermission(ctx, 'approve');
  return db.tx((q) => oncePerRequest(q, ctx, input.requestId, {
    kind: 'advance', saverId: input.saverId, amountMinor: input.amountMinor,
    method: input.method?.trim() || 'Cash', reference: input.reference?.trim() || null, note: input.note?.trim() || null,
  }, async () => {
    const saver = await lockSaver(q, ctx.orgId, input.saverId);
    if (!(input.amountMinor > 0)) fail('INVALID', 'Enter the advance amount.');
    if (saver.status !== 'ACTIVE') fail('CONFLICT', `${saver.name}’s savings are ${saver.status.toLowerCase()}. Make them active before recording borrowed money.`);
    const today = await orgToday(q, ctx.orgId);
    const pages = (await q.query<Record<string, unknown>>(
      `SELECT * FROM susu_pages WHERE saver_id=$1 AND org_id=$2 AND status='OPEN' AND period <= $3 ORDER BY period,page_no`,
      [saver.id, ctx.orgId, periodOf(today)],
    )).map(mapPage);
    const netSavings = pages.reduce((sum, page) => sum + closeMath(page).balanceMinor, 0);
    const outstanding = await advanceOutstanding(q, ctx.orgId, saver.id);
    const available = Math.max(0, netSavings - outstanding);
    if (input.amountMinor > available) fail('INVALID', `The most ${saver.name} can take as an advance is ${formatMinor(available, saver.currency)} after collection fees and earlier advances.`);
    const transactionRef = await nextSusuTransactionRef(q, ctx.orgId);
    const [row] = await q.query<{ id: string; created_at: string }>(
      `INSERT INTO susu_advance_transactions (org_id,saver_id,kind,amount_minor,transaction_ref,method,reference,note,recorded_by)
       VALUES ($1,$2,'ADVANCE',$3,$4,$5,$6,$7,$8) RETURNING id,created_at`,
      [ctx.orgId, saver.id, input.amountMinor, transactionRef, input.method?.trim() || 'Cash', input.reference?.trim() || null, input.note?.trim() || null, ctx.userId],
    );
    const after = outstanding + input.amountMinor;
    await appendAudit(q, { orgId: ctx.orgId, action: 'susu.advance_taken', actor: actorOf(ctx), data: { saverId: saver.id, transactionRef, amountMinor: input.amountMinor, outstandingMinor: after, method: input.method?.trim() || 'Cash' } });
    await queueSusuSms(q, ctx, saver.id, `advance:${row.id}`, 'WITHDRAWAL', `${smsBrand()}: Ref ${transactionRef}. Savings advance: ${smsMoney(input.amountMinor,saver.currency)} paid to you. Amount to repay: ${smsMoney(after,saver.currency)}. Your paid calendar days did not change.`);
    return { id: row.id, transactionRef, kind: 'ADVANCE' as const, amountMinor: input.amountMinor, outstandingMinor: after, at: iso(row.created_at)! };
  }));
}

/** Repays an advance without filling a contribution day. */
export async function repayAdvance(db: Db, ctx: Ctx, input: { saverId: string; amountMinor: number; method?: string | null; reference?: string | null; note?: string | null; requestId?: string }) {
  requirePermission(ctx, 'trade');
  return db.tx((q) => oncePerRequest(q, ctx, input.requestId, {
    kind: 'advance_repayment', saverId: input.saverId, amountMinor: input.amountMinor,
    method: input.method?.trim() || 'Cash', reference: input.reference?.trim() || null, note: input.note?.trim() || null,
  }, async () => {
    const saver = await lockSaver(q, ctx.orgId, input.saverId);
    if (!(input.amountMinor > 0)) fail('INVALID', 'Enter the repayment amount.');
    const outstanding = await advanceOutstanding(q, ctx.orgId, saver.id);
    if (outstanding <= 0) fail('CONFLICT', `${saver.name} has no advance to repay.`);
    if (input.amountMinor > outstanding) fail('INVALID', `The most ${saver.name} can repay is ${formatMinor(outstanding, saver.currency)}.`);
    const transactionRef = await nextSusuTransactionRef(q, ctx.orgId);
    const [row] = await q.query<{ id: string; created_at: string }>(
      `INSERT INTO susu_advance_transactions (org_id,saver_id,kind,amount_minor,transaction_ref,method,reference,note,recorded_by)
       VALUES ($1,$2,'REPAYMENT',$3,$4,$5,$6,$7,$8) RETURNING id,created_at`,
      [ctx.orgId, saver.id, input.amountMinor, transactionRef, input.method?.trim() || 'Cash', input.reference?.trim() || null, input.note?.trim() || null, ctx.userId],
    );
    const after = outstanding - input.amountMinor;
    await appendAudit(q, { orgId: ctx.orgId, action: 'susu.advance_repaid', actor: actorOf(ctx), data: { saverId: saver.id, transactionRef, amountMinor: input.amountMinor, outstandingMinor: after, method: input.method?.trim() || 'Cash' } });
    await queueSusuSms(q, ctx, saver.id, `advance-repayment:${row.id}`, 'COLLECTION', `${smsBrand()}: Ref ${transactionRef}. Advance repayment received: ${smsMoney(input.amountMinor,saver.currency)}. Advance still due: ${smsMoney(after,saver.currency)}. No new calendar day was added.`);
    return { id: row.id, transactionRef, kind: 'REPAYMENT' as const, amountMinor: input.amountMinor, outstandingMinor: after, at: iso(row.created_at)! };
  }));
}

// ---------------------------------------------------------------- reads

async function summarise(db: Db, ctx: Ctx, where: string, params: unknown[]): Promise<SaverSummary[]> {
  const today = await orgToday(db, ctx.orgId);
  const current = periodOf(today);
  const savers = await db.query<Record<string, unknown>>(`SELECT * FROM susu_savers s WHERE s.org_id = $1 ${where} ORDER BY s.status, lower(s.name)`, [ctx.orgId, ...params]);
  if (!savers.length) return [];
  const ids = savers.map((s) => s.id as string);
  const pages = (await db.query<Record<string, unknown>>('SELECT * FROM susu_pages WHERE saver_id = ANY($1::uuid[]) ORDER BY period DESC, page_no DESC', [ids])).map((r) => ({ ...mapPage(r), saverId: r.saver_id as string }));
  const last = await db.query<{ saver_id: string; at: string }>('SELECT saver_id, MAX(created_at) AS at FROM susu_collections WHERE saver_id = ANY($1::uuid[]) GROUP BY saver_id', [ids]);
  const advanceRows = await db.query<{ saver_id: string; total: string | number }>(
    `SELECT saver_id, COALESCE(SUM(CASE WHEN kind='ADVANCE' THEN amount_minor ELSE -amount_minor END),0) AS total
       FROM susu_advance_transactions WHERE saver_id = ANY($1::uuid[]) GROUP BY saver_id`,
    [ids],
  );
  return savers.map((s) => {
    const mine = pages.filter((p) => p.saverId === s.id);
    const open = mine.filter((p) => p.status === 'OPEN');
    // Daily payments always go to the current month. Show that page when it
    // exists, while overdue months remain available in Month-end payouts.
    const cur = open.find((p) => p.period === current)
      ?? [...open].reverse().find((p) => p.period < current)
      ?? [...open].reverse()[0]
      ?? null;
    const expected = cur ? expectedByToday(cur, today) : 0;
    const m = cur ? closeMath(cur) : null;
    const outstanding = Math.max(0, N(advanceRows.find((r) => r.saver_id === s.id)?.total));
    return {
      id: s.id as string,
      ref: s.ref as string,
      name: s.name as string,
      phone: (s.phone as string) ?? null,
      smsEnabled: s.sms_enabled === true,
      smsAutoSend: s.sms_auto_send === true,
      notes: (s.notes as string) ?? null,
      currency: s.currency as Currency,
      dailyMinor: N(s.daily_minor),
      nextDailyMinor: s.next_daily_minor === null ? null : N(s.next_daily_minor),
      status: s.status as SaverSummary['status'],
      createdAt: iso(s.created_at)!,
      page: cur && m ? { ...cur, expected, standing: standing(cur.daysPaid, expected, dueToday(cur, today)), balanceIfClosedMinor: m.balanceMinor, availableIfClosedMinor: Math.max(0, m.balanceMinor - outstanding), feeMinor: m.feeMinor, savedMinor: m.savedMinor } : null,
      heldMinor: open.reduce((sum, p) => sum + p.broughtForwardMinor + p.daysPaid * p.dailyMinor, 0),
      advanceOutstandingMinor: outstanding,
      prepaidDays: open.filter((p) => p.period > current).reduce((sum, p) => sum + p.daysPaid, 0),
      streak: streak(mine.map((p) => ({ status: p.status, daysPaid: p.daysPaid, capacity: p.capacity }))),
      lastPaidAt: iso(last.find((l) => l.saver_id === s.id)?.at),
    };
  });
}

export async function listSavers(db: Db, ctx: Ctx, search?: string): Promise<SaverSummary[]> {
  requirePermission(ctx, 'read');
  const s = search?.trim();
  return s ? summarise(db, ctx, `AND (s.name ILIKE $2 OR s.ref ILIKE $2 OR s.phone ILIKE $2)`, [`%${s}%`]) : summarise(db, ctx, '', []);
}

export async function getSaver(db: Db, ctx: Ctx, id: string) {
  requirePermission(ctx, 'read');
  const [summary] = await summarise(db, ctx, 'AND s.id = $2', [id]);
  if (!summary) fail('NOT_FOUND', 'Saver not found.');
  const [smsDesk] = await db.query<{ susu_sms_enabled: boolean }>('SELECT susu_sms_enabled FROM organizations WHERE id=$1', [ctx.orgId]);
  const pages = (await db.query<Record<string, unknown>>('SELECT * FROM susu_pages WHERE saver_id = $1 AND org_id = $2 ORDER BY period DESC, page_no DESC', [id, ctx.orgId])).map(mapPage);
  const collections = await db.query<Record<string, unknown>>(
    `SELECT c.*, p.period, u.name AS recorded_by_name FROM susu_collections c JOIN susu_pages p ON p.id = c.page_id LEFT JOIN users u ON u.id = c.recorded_by
      WHERE c.saver_id = $1 AND c.org_id = $2 AND c.payment_id IN (
        SELECT payment_id FROM susu_collections WHERE saver_id = $1 AND org_id = $2
        GROUP BY payment_id ORDER BY MAX(created_at) DESC, payment_id DESC LIMIT 200
      ) ORDER BY c.created_at DESC, c.id DESC`,
    [id, ctx.orgId],
  );
  // One entry per payment, even when it spilled across pages.
  const payments = new Map<string, { id: string; at: string; receivedMinor: number; changeMinor: number; days: number; periods: string[]; note: string | null; by: string | null }>();
  for (const c of collections) {
    const k = c.payment_id as string;
    const e = payments.get(k) ?? { id: k, at: iso(c.created_at)!, receivedMinor: 0, changeMinor: 0, days: 0, periods: [], note: null, by: (c.recorded_by_name as string) ?? null };
    e.receivedMinor += N(c.received_minor);
    e.changeMinor += N(c.change_minor);
    e.days += N(c.days);
    if (!e.periods.includes(c.period as string)) e.periods.push(c.period as string);
    e.note = e.note ?? ((c.note as string) ?? null);
    payments.set(k, e);
  }
  // Both halves of a spilled payment share a timestamp, so row order alone can't be trusted: list months oldest first.
  for (const p of payments.values()) p.periods.sort();
  const advanceRows = await db.query<Record<string, unknown>>(
    `SELECT a.*,u.name AS recorded_by_name FROM susu_advance_transactions a LEFT JOIN users u ON u.id=a.recorded_by
      WHERE a.saver_id=$1 AND a.org_id=$2 ORDER BY a.created_at DESC,a.id DESC`,
    [id, ctx.orgId],
  );
  const advances = advanceRows.map((a) => ({
    id: a.id as string,
    transactionRef: a.transaction_ref as string,
    kind: a.kind as 'ADVANCE' | 'REPAYMENT' | 'SETTLEMENT',
    amountMinor: N(a.amount_minor),
    method: (a.method as string) ?? null,
    reference: (a.reference as string) ?? null,
    note: (a.note as string) ?? null,
    by: (a.recorded_by_name as string) ?? null,
    at: iso(a.created_at)!,
  }));
  return { saver: summary, pages, payments: [...payments.values()], advances, sms: await saverSusuSms(db, ctx, id), smsDeskEnabled: smsDesk?.susu_sms_enabled === true, today: await orgToday(db, ctx.orgId) };
}

export interface SusuOverview {
  today: string;
  period: Period;
  savers: { active: number; onTrack: number; behind: number; ahead: number };
  collectedTodayMinor: number;
  expectedTodayMinor: number;
  paidTodayCount: number;
  collectedThisMonthMinor: number;
  /** Gross contributions and carried balances on all open pages. */
  heldMinor: number;
  advancesOutstandingMinor: number;
  /** What remains at the desk after recorded advances have left. */
  netHeldMinor: number;
  feesThisMonthMinor: number;
  feesDueMinor: number;
  pagesToClose: number;
}

export async function susuOverview(db: Db, ctx: Ctx, savers?: SaverSummary[]): Promise<SusuOverview> {
  requirePermission(ctx, 'read');
  const list = savers ?? (await listSavers(db, ctx));
  const today = await orgToday(db, ctx.orgId);
  const period = periodOf(today);
  const [r] = await db.query<Record<string, unknown>>(
    `SELECT
       (SELECT COALESCE(SUM(received_minor - change_minor), 0) FROM susu_collections c JOIN organizations o ON o.id = c.org_id
          WHERE c.org_id = $1 AND (c.created_at AT TIME ZONE o.timezone)::date = $2::date) AS today_in,
       (SELECT COUNT(DISTINCT saver_id) FROM susu_collections c JOIN organizations o ON o.id = c.org_id
          WHERE c.org_id = $1 AND (c.created_at AT TIME ZONE o.timezone)::date = $2::date) AS today_n,
       (SELECT COALESCE(SUM(received_minor - change_minor), 0) FROM susu_collections c JOIN organizations o ON o.id = c.org_id
          WHERE c.org_id = $1 AND to_char(c.created_at AT TIME ZONE o.timezone, 'YYYY-MM') = $3) AS month_in,
       (SELECT COALESCE(SUM(fee_minor), 0) FROM susu_pages p JOIN organizations o ON o.id = p.org_id
          WHERE p.org_id = $1 AND p.status = 'CLOSED' AND to_char(p.closed_at AT TIME ZONE o.timezone, 'YYYY-MM') = $3) AS fees_month,
       (SELECT COALESCE(SUM(CASE WHEN days_paid > 0 THEN daily_minor ELSE 0 END), 0)
          FROM susu_pages WHERE org_id = $1 AND status = 'OPEN' AND period <= $3) AS fees_due,
       (SELECT COUNT(*) FROM susu_pages WHERE org_id = $1 AND status = 'OPEN' AND period < $3) AS to_close`,
    [ctx.orgId, today, period],
  );
  const active = list.filter((s) => s.status === 'ACTIVE' && s.page);
  const heldMinor = list.reduce((s, x) => s + x.heldMinor, 0);
  const advancesOutstandingMinor = list.reduce((s, x) => s + x.advanceOutstandingMinor, 0);
  return {
    today,
    period,
    savers: {
      active: active.length,
      onTrack: active.filter((s) => s.page!.standing.kind === 'on_track').length,
      behind: active.filter((s) => s.page!.standing.kind === 'behind').length,
      ahead: active.filter((s) => s.page!.standing.kind === 'ahead').length,
    },
    collectedTodayMinor: N(r.today_in),
    expectedTodayMinor: active.reduce((sum, saver) => sum + dueToday(saver.page!, today) * saver.page!.dailyMinor, 0),
    paidTodayCount: N(r.today_n),
    collectedThisMonthMinor: N(r.month_in),
    heldMinor,
    advancesOutstandingMinor,
    netHeldMinor: Math.max(0, heldMinor - advancesOutstandingMinor),
    feesThisMonthMinor: N(r.fees_month),
    feesDueMinor: N(r.fees_due),
    pagesToClose: N(r.to_close),
  };
}

/** Pages ready for month end: every open page of an ended month (plus this month's on its last day). */
export async function pagesToClose(db: Db, ctx: Ctx) {
  requirePermission(ctx, 'read');
  const today = await orgToday(db, ctx.orgId);
  const current = periodOf(today);
  const lastDay = Number(today.slice(8, 10)) === daysInMonth(current);
  const rows = await db.query<Record<string, unknown>>(
    `SELECT p.*, s.name, s.ref, s.phone FROM susu_pages p JOIN susu_savers s ON s.id = p.saver_id
      WHERE p.org_id = $1 AND p.status = 'OPEN' AND (p.period < $2 OR (p.period = $2 AND $3::boolean))
      ORDER BY p.period, lower(s.name), p.page_no`,
    [ctx.orgId, current, lastDay],
  );
  const saverIds = [...new Set(rows.map((r) => r.saver_id as string))];
  const advanceRows = saverIds.length ? await db.query<{ saver_id: string; total: string | number }>(
    `SELECT saver_id, COALESCE(SUM(CASE WHEN kind='ADVANCE' THEN amount_minor ELSE -amount_minor END),0) AS total
       FROM susu_advance_transactions WHERE org_id=$1 AND saver_id = ANY($2::uuid[]) GROUP BY saver_id`,
    [ctx.orgId, saverIds],
  ) : [];
  const outstanding = new Map(advanceRows.map((r) => [r.saver_id, Math.max(0, N(r.total))]));
  return {
    today,
    pages: rows.map((r) => {
      const p = mapPage(r);
      const saverId = r.saver_id as string;
      const math = closeMath(p);
      const advanceOutstandingBeforeMinor = outstanding.get(saverId) ?? 0;
      const advanceSettledMinor = Math.min(advanceOutstandingBeforeMinor, math.balanceMinor);
      outstanding.set(saverId, advanceOutstandingBeforeMinor - advanceSettledMinor);
      return {
        ...p,
        saver: { id: saverId, name: r.name as string, ref: r.ref as string, phone: (r.phone as string) ?? null },
        ...math,
        advanceOutstandingBeforeMinor,
        advanceSettledMinor,
        availableBalanceMinor: math.balanceMinor - advanceSettledMinor,
      };
    }),
  };
}
