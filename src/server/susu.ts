import { createHash, randomUUID } from 'node:crypto';
import type { Db, Queryable } from './db';
import { actorOf, requirePermission, type Ctx } from './auth';
import { appendAudit } from './audit';
import { fail } from './errors';
import { todayIn } from './day-close';
import { closeMath, daysInMonth, dueToday, expectedByToday, nextPeriod, periodLabel, periodOf, splitCash, standing, streak, type Period, type Standing } from '@/lib/susu';
import { formatMinor, type Currency } from '@/lib/money';
import { queueSusuSms, smsDate, smsMoney, smsPhone, smsText } from './susu-sms';

/**
 * Susu (daily savings) for a desk. Desk staff record cash they collect; the
 * booklet rules live in src/lib/susu.ts. Savers have no login or app.
 */

const N = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const MAX_PAGES_AHEAD = 24;

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
  notes: string | null;
  currency: Currency;
  dailyMinor: number;
  nextDailyMinor: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  createdAt: string;
  page: (SusuPage & { expected: number; standing: Standing; balanceIfClosedMinor: number; feeMinor: number; savedMinor: number }) | null;
  /** Everything held for this saver right now: brought forward plus all boxes on open pages. */
  heldMinor: number;
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

type SaverRow = { id: string; org_id: string; name: string; daily_minor: string | number; next_daily_minor: string | number | null; status: string; currency: Currency };

async function lockSaver(q: Queryable, orgId: string, id: string): Promise<SaverRow> {
  const [s] = await q.query<SaverRow>('SELECT * FROM susu_savers WHERE id = $1 AND org_id = $2 FOR UPDATE', [id, orgId]);
  if (!s) fail('NOT_FOUND', 'Saver not found.');
  return s;
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
  input: { id?: string; name: string; phone?: string | null; dailyMinor: number; notes?: string | null; status?: SaverSummary['status']; smsEnabled?: boolean },
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
      await q.query('UPDATE susu_savers SET name = $3, phone = $4, notes = $5, status = COALESCE($6, status) WHERE id = $1 AND org_id = $2', [s.id, ctx.orgId, name, phone, input.notes?.trim() || null, input.status ?? null]);
      await q.query('UPDATE susu_savers SET sms_enabled = CASE WHEN $3::boolean IS FALSE THEN false ELSE COALESCE($2, sms_enabled) END WHERE id=$1', [s.id, input.smsEnabled ?? null, !!smsPhone(phone)]);
      // Never deliver a queued financial receipt to an edited number later.
      await q.query(`UPDATE susu_sms SET status='CANCELLED',error_code='recipient_or_preference_changed',updated_at=now() WHERE saver_id=$1 AND status IN ('QUEUED','FAILED') AND (recipient IS DISTINCT FROM $2 OR NOT (SELECT sms_enabled FROM susu_savers WHERE id=$1))`, [s.id, smsPhone(phone)]);
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
        await queueSusuSms(q,ctx,s.id,`update:${randomUUID()}`,'ACCOUNT_UPDATE',`${smsText(ctx.orgName)}: ${changes} Contact your collector for questions.`);
      }
      return { id: s.id, dailyChange };
    }
    const [o] = await q.query<{ susu_seq: number }>('UPDATE organizations SET susu_seq = susu_seq + 1 WHERE id = $1 RETURNING susu_seq', [ctx.orgId]);
    const ref = `S-${String(N(o.susu_seq)).padStart(4, '0')}`;
    const [row] = await q.query<SaverRow>(
      `INSERT INTO susu_savers (org_id, ref, name, phone, notes, daily_minor, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.orgId, ref, name, phone, input.notes?.trim() || null, input.dailyMinor, ctx.userId],
    );
    // First page starts on today's box: a saver joining on the 20th of a 31-day month has 12 boxes.
    const period = periodOf(today);
    const day = Number(today.slice(8, 10));
    await openPage(q, row, { period, startDay: day, capacity: daysInMonth(period) - day + 1 });
    await q.query('UPDATE susu_savers SET sms_enabled=$2 WHERE id=$1',[row.id,input.smsEnabled ?? false]);
    await queueSusuSms(q,ctx,row.id,`welcome:${row.id}`,'WELCOME',`${smsText(ctx.orgName)}: Welcome, ${smsText(name,20)}. Saver ${ref}. Save ${smsMoney(input.dailyMinor)} daily. Each closed page has a one-day contribution fee. Keep your receipts.`);
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
  if (saved.payload_hash !== hash) fail('CONFLICT', 'This collection request was already used for a different amount. Refresh and try again.');
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
  const [held] = await q.query<{ total: string }>(`SELECT COALESCE(SUM(brought_forward_minor + days_paid*daily_minor),0) AS total FROM susu_pages WHERE saver_id=$1 AND status='OPEN'`,[saver.id]);
  const change = remaining > 0 ? ` Change ${smsMoney(remaining,saver.currency)}.` : '';
  const dayLabel = days === 1 ? 'day' : 'days';
  await queueSusuSms(q,ctx,saver.id,`collection:${paymentId}`,'COLLECTION',`${smsText(ctx.orgName)}: Susu receipt. Saved ${smsMoney(input.amountMinor-remaining,saver.currency)} on ${smsDate(today)} (${days} ${dayLabel}). Total in your susu book: ${smsMoney(N(held.total),saver.currency)} before fee.${change} Ref ${paymentId.slice(0,8)}.`);
  return { saverId: saver.id, name: saver.name, receivedMinor: input.amountMinor, days, changeMinor: remaining, pages: credited.map((c) => ({ period: c.page.period, days: c.days })) };
}

/** Several collections in one go (an end-of-round entry). All succeed or none do. */
export async function recordCollections(db: Db, ctx: Ctx, rows: { saverId: string; amountMinor: number }[], requestId?: string): Promise<CollectionResult[]> {
  requirePermission(ctx, 'trade');
  if (!rows.length) fail('INVALID', 'Nothing to record.');
  return db.tx((q) => oncePerRequest(q, ctx, requestId, { kind: 'round', rows }, async () => {
    const out: CollectionResult[] = [];
    for (const r of rows) out.push(await collectInTx(q, ctx, r));
    return out;
  }));
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
  input: { pageId: string; kind: CloseKind; method?: string | null; reference?: string | null },
): Promise<{ feeMinor: number; balanceMinor: number; kind: CloseKind; name: string; period: Period }> {
  requirePermission(ctx, 'trade');
  return db.tx((q) => closeInTx(q, ctx, input));
}

async function closeInTx(q: Queryable, ctx: Ctx, input: { pageId: string; kind: CloseKind; method?: string | null; reference?: string | null }) {
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
  if (input.kind === 'WITHDRAWAL' && m.balanceMinor <= 0) fail('CONFLICT', `${saver.name} has nothing to withdraw yet (one day is the fee).`);
  const paidOut = input.kind === 'ROLLOVER' ? 0 : m.balanceMinor;
  const carried = input.kind === 'ROLLOVER' ? m.balanceMinor : 0;

  await q.query(
    `UPDATE susu_pages SET status = 'CLOSED', close_kind = $2, fee_minor = $3, paid_out_minor = $4, carried_minor = $5,
       payout_method = $6, payout_reference = $7, closed_at = now(), closed_by = $8,
       capacity = CASE WHEN $2 = 'WITHDRAWAL' THEN days_paid ELSE capacity END
     WHERE id = $1`,
    [page.id, input.kind, m.feeMinor, paidOut, carried, paidOut ? input.method?.trim() || 'Cash' : null, paidOut ? input.reference?.trim() || null : null, ctx.userId],
  );

  if (input.kind === 'WITHDRAWAL') {
    const left = page.capacity - page.daysPaid;
    if (left > 0 && saver.status !== 'CLOSED') await openPage(q, saver, { period: page.period, startDay: page.startDay + page.daysPaid, capacity: left });
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
    data: { saverId: saver.id, pageId: page.id, period: page.period, kind: input.kind, daysPaid: page.daysPaid, feeMinor: m.feeMinor, paidOutMinor: paidOut, carriedMinor: carried },
  });
  const action = input.kind === 'ROLLOVER' ? 'Carried forward' : input.kind === 'WITHDRAWAL' ? 'Withdrawal recorded' : 'Payout recorded';
  await queueSusuSms(q,ctx,saver.id,`close:${page.id}`,input.kind,`${smsText(ctx.orgName)}: ${page.period} page ${page.pageNo}. ${action}: ${smsMoney(m.balanceMinor,saver.currency)}. Fee: ${smsMoney(m.feeMinor,saver.currency)}.${input.kind === 'ROLLOVER' ? ' No cash paid out.' : ` Method: ${smsText(input.method?.trim() || 'Cash',20)}. Contact your collector if not received.`}`);
  return { feeMinor: m.feeMinor, balanceMinor: m.balanceMinor, kind: input.kind, name: saver.name, period: page.period };
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

/** Withdraw everything now (mid-month): closes the saver's current page. */
export async function withdraw(db: Db, ctx: Ctx, input: { saverId: string; method?: string | null; reference?: string | null }) {
  requirePermission(ctx, 'trade');
  const today = await orgToday(db, ctx.orgId);
  const [p] = await db.query<{ id: string }>(
    `SELECT id FROM susu_pages WHERE saver_id = $1 AND org_id = $2 AND status = 'OPEN' AND period <= $3 ORDER BY period, page_no LIMIT 1`,
    [input.saverId, ctx.orgId, periodOf(today)],
  );
  if (!p) fail('CONFLICT', 'There is no open page to withdraw from.');
  return closePage(db, ctx, { pageId: p.id, kind: 'WITHDRAWAL', method: input.method, reference: input.reference });
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
  return savers.map((s) => {
    const mine = pages.filter((p) => p.saverId === s.id);
    const open = mine.filter((p) => p.status === 'OPEN');
    // The page to show: the earliest open page up to this month (an unclosed past month comes first), else the next prepaid one.
    const cur = [...open].reverse().find((p) => p.period <= current) ?? [...open].reverse()[0] ?? null;
    const expected = cur ? expectedByToday(cur, today) : 0;
    const m = cur ? closeMath(cur) : null;
    return {
      id: s.id as string,
      ref: s.ref as string,
      name: s.name as string,
      phone: (s.phone as string) ?? null,
      smsEnabled: s.sms_enabled === true,
      notes: (s.notes as string) ?? null,
      currency: s.currency as Currency,
      dailyMinor: N(s.daily_minor),
      nextDailyMinor: s.next_daily_minor === null ? null : N(s.next_daily_minor),
      status: s.status as SaverSummary['status'],
      createdAt: iso(s.created_at)!,
      page: cur && m ? { ...cur, expected, standing: standing(cur.daysPaid, expected, dueToday(cur, today)), balanceIfClosedMinor: m.balanceMinor, feeMinor: m.feeMinor, savedMinor: m.savedMinor } : null,
      heldMinor: open.reduce((sum, p) => sum + p.broughtForwardMinor + p.daysPaid * p.dailyMinor, 0),
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
  return { saver: summary, pages, payments: [...payments.values()], today: await orgToday(db, ctx.orgId) };
}

export interface SusuOverview {
  today: string;
  period: Period;
  savers: { active: number; onTrack: number; behind: number; ahead: number };
  collectedTodayMinor: number;
  paidTodayCount: number;
  collectedThisMonthMinor: number;
  heldMinor: number;
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
    paidTodayCount: N(r.today_n),
    collectedThisMonthMinor: N(r.month_in),
    heldMinor: list.reduce((s, x) => s + x.heldMinor, 0),
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
      ORDER BY p.period, lower(s.name)`,
    [ctx.orgId, current, lastDay],
  );
  return {
    today,
    pages: rows.map((r) => {
      const p = mapPage(r);
      return { ...p, saver: { id: r.saver_id as string, name: r.name as string, ref: r.ref as string, phone: (r.phone as string) ?? null }, ...closeMath(p) };
    }),
  };
}

// ---------------------------------------------------------------- quick entry ("Ama 50, Kofi 30")

export interface ParsedLine {
  line: string;
  amountMinor: number | null;
  saverId: string | null;
  saverName: string | null;
  candidates: { id: string; name: string; ref: string; dailyMinor: number }[];
  days: number;
  changeMinor: number;
  problem: string | null;
}

/** Reads a typed or pasted collection round and matches each line to a saver. Nothing is saved. */
export async function parseCollections(db: Db, ctx: Ctx, text: string): Promise<ParsedLine[]> {
  requirePermission(ctx, 'trade');
  const savers = await listSavers(db, ctx);
  const active = savers.filter((s) => s.status === 'ACTIVE');
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = text.split(/\n|;|,(?![0-9]{3}\b)/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 200) fail('INVALID', 'A collection round can have at most 200 lines. Split this round into smaller batches.');
  return lines.map((line) => {
    const amounts = [...line.matchAll(/(?:gh₵|ghs|ghc|₵|¢)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi)];
    // A saver reference (S-0001), or a phone number before an amount, is an identifier rather than the cash.
    const amt = amounts.find((m) => !/\bS-$/i.test(line.slice(0, m.index ?? 0).trimEnd()) && !(amounts.length > 1 && m[1].replace(/,/g, '').length >= 8)) ?? null;
    const amountMinor = amt ? Math.round((Number(amt[1].replace(/,/g, '')) + (amt[2] ? Number(amt[2].padEnd(2, '0')) / 100 : 0)) * 100) : null;
    const at = amt?.index ?? -1;
    const withoutAmount = at < 0 ? line : `${line.slice(0, at)} ${line.slice(at + amt![0].length)}`;
    const who = norm(withoutAmount.replace(/\b(gh₵|ghs|ghc|cedis?|paid|for|days?)\b/gi, ' '));
    let matches = who ? active.filter((s) => norm(s.ref) === who || norm(s.name) === who) : [];
    if (!matches.length && who) matches = active.filter((s) => norm(s.name).split(' ').some((w) => w === who) || norm(s.name).startsWith(who));
    if (!matches.length && who) matches = active.filter((s) => norm(s.name).includes(who) || (s.phone ?? '').replace(/\D/g, '').endsWith(who.replace(/\D/g, '') || '#'));
    const saver = matches.length === 1 ? matches[0] : null;
    const daily = saver?.page?.dailyMinor ?? saver?.dailyMinor ?? 0;
    const split = saver && amountMinor ? splitCash(amountMinor, daily) : { days: 0, changeMinor: 0 };
    const problem = !amountMinor
      ? 'No amount on this line.'
      : !who
        ? 'No name on this line.'
        : !matches.length
          ? `No saver called “${who}”.`
          : matches.length > 1
            ? 'More than one saver matches. Pick one.'
            : split.days === 0
              ? `Less than one day (${formatMinor(daily, 'GHS')}).`
              : null;
    return {
      line,
      amountMinor,
      saverId: saver?.id ?? null,
      saverName: saver?.name ?? null,
      candidates: matches.length > 1 ? matches.slice(0, 5).map((m) => ({ id: m.id, name: m.name, ref: m.ref, dailyMinor: m.page?.dailyMinor ?? m.dailyMinor })) : [],
      days: split.days,
      changeMinor: split.changeMinor,
      problem,
    };
  });
}
