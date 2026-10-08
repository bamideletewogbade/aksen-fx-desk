import type { Db } from './db';
import { actorOf, requirePermission, type Ctx } from './auth';
import { appendAudit } from './audit';
import { fail } from './errors';
import { post, railAccount, railBalances } from './ledger';
import { assertRailDayOpen } from './day-close';
import { CORRIDORS, parseRate, rateToString, type BoardRateKey, type Corridor, type Currency } from '@/lib/money';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// ---------------- Desk settings ----------------

export interface DeskSettings {
  id: string;
  name: string;
  timezone: string;
  supportPhone: string | null;
  customerNote: string | null;
  quoteTtlMinutes: number;
  fundsWindowMinutes: number;
  approvalThresholdNgn: number;
  approvalThresholdGhs: number;
  isDemo: boolean;
  auditHead: string;
  auditEvents: number;
}

export async function getSettings(db: Db, ctx: Ctx): Promise<DeskSettings> {
  const [o] = await db.query<Record<string, unknown>>('SELECT * FROM organizations WHERE id = $1', [ctx.orgId]);
  return {
    id: o.id as string,
    name: o.name as string,
    timezone: o.timezone as string,
    supportPhone: (o.support_phone as string) ?? null,
    customerNote: (o.customer_note as string) ?? null,
    quoteTtlMinutes: Number(o.quote_ttl_minutes),
    fundsWindowMinutes: Number(o.funds_window_minutes),
    approvalThresholdNgn: Number(o.approval_threshold_ngn),
    approvalThresholdGhs: Number(o.approval_threshold_ghs),
    isDemo: Boolean(o.is_demo),
    auditHead: o.audit_head as string,
    auditEvents: Number(o.audit_seq),
  };
}

export async function updateSettings(
  db: Db,
  ctx: Ctx,
  input: Partial<Pick<DeskSettings, 'name' | 'timezone' | 'supportPhone' | 'customerNote' | 'quoteTtlMinutes' | 'fundsWindowMinutes' | 'approvalThresholdNgn' | 'approvalThresholdGhs'>>,
) {
  requirePermission(ctx, 'configure');
  await db.tx(async (q) => {
    await q.query(
      `UPDATE organizations SET
         name = COALESCE($2, name), timezone = COALESCE($3, timezone),
         support_phone = CASE WHEN $4::boolean THEN $5 ELSE support_phone END,
         customer_note = CASE WHEN $6::boolean THEN $7 ELSE customer_note END,
         quote_ttl_minutes = COALESCE($8, quote_ttl_minutes), funds_window_minutes = COALESCE($9, funds_window_minutes),
         approval_threshold_ngn = COALESCE($10, approval_threshold_ngn), approval_threshold_ghs = COALESCE($11, approval_threshold_ghs)
       WHERE id = $1`,
      [
        ctx.orgId,
        input.name?.trim() || null,
        input.timezone ?? null,
        input.supportPhone !== undefined,
        input.supportPhone?.trim() || null,
        input.customerNote !== undefined,
        input.customerNote?.trim() || null,
        input.quoteTtlMinutes ?? null,
        input.fundsWindowMinutes ?? null,
        input.approvalThresholdNgn ?? null,
        input.approvalThresholdGhs ?? null,
      ],
    );
    await appendAudit(q, { orgId: ctx.orgId, action: 'desk.settings_changed', actor: actorOf(ctx), data: input as Record<string, unknown> });
  });
}

// ---------------- Rate board ----------------

export interface RateRow {
  corridor: BoardRateKey;
  customerRate: string;
  referenceRate: string | null;
  feeMinor: number;
  minPayMinor: number;
  maxPayMinor: number | null;
  active: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getRates(db: Db, ctx: Ctx): Promise<RateRow[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT r.*, u.name AS updated_by_name FROM rate_board r LEFT JOIN users u ON u.id = r.updated_by
      WHERE r.org_id = $1 ORDER BY r.corridor DESC`,
    [ctx.orgId],
  );
  return rows.map((r) => ({
    corridor: r.corridor as BoardRateKey,
    customerRate: rateToString(parseRate(String(r.customer_rate))),
    referenceRate: r.reference_rate ? rateToString(parseRate(String(r.reference_rate))) : null,
    feeMinor: Number(r.fee_minor),
    minPayMinor: Number(r.min_pay_minor),
    maxPayMinor: num(r.max_pay_minor),
    active: Boolean(r.active),
    updatedAt: iso(r.updated_at)!,
    updatedBy: (r.updated_by_name as string) ?? null,
  }));
}

export async function setRate(
  db: Db,
  ctx: Ctx,
  input: { corridor: BoardRateKey; customerRate: string; referenceRate?: string | null; feeMinor?: number; minPayMinor?: number; maxPayMinor?: number | null; active?: boolean },
) {
  requirePermission(ctx, 'configure');
  const customer = parseRate(input.customerRate);
  await db.tx(async (q) => {
    const [prev] = await q.query<{ customer_rate: string }>('SELECT customer_rate FROM rate_board WHERE org_id = $1 AND corridor = $2', [ctx.orgId, input.corridor]);
    await q.query(
      `INSERT INTO rate_board (org_id, corridor, customer_rate, reference_rate, fee_minor, min_pay_minor, max_pay_minor, active, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (org_id, corridor) DO UPDATE SET customer_rate = EXCLUDED.customer_rate, reference_rate = EXCLUDED.reference_rate,
         fee_minor = EXCLUDED.fee_minor, min_pay_minor = EXCLUDED.min_pay_minor, max_pay_minor = EXCLUDED.max_pay_minor,
         active = EXCLUDED.active, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [ctx.orgId, input.corridor, rateToString(customer), null, 0, 0, null, true, ctx.userId],
    );
    await appendAudit(q, {
      orgId: ctx.orgId,
      action: 'rates.changed',
      actor: actorOf(ctx),
      data: { corridor: input.corridor, from: prev ? rateToString(parseRate(String(prev.customer_rate))) : null, to: rateToString(customer) },
    });
  });
}

export async function rateHistory(db: Db, ctx: Ctx, limit = 30) {
  const rows = await db.query<{ data: Record<string, unknown>; actor_label: string; at_iso: string }>(
    `SELECT data, actor_label, at_iso FROM audit_events WHERE org_id = $1 AND action = 'rates.changed' ORDER BY seq DESC LIMIT $2`,
    [ctx.orgId, limit],
  );
  return rows.map((r) => ({ ...r.data, by: r.actor_label, at: r.at_iso }));
}

// ---------------- Rails (collection & payout accounts) ----------------

export interface Rail {
  id: string;
  label: string;
  currency: Currency;
  kind: 'BANK' | 'MOMO';
  provider: string;
  accountNumber: string;
  accountName: string;
  canCollect: boolean;
  canPay: boolean;
  dailySoftCapMinor: number | null;
  lowBalanceMinor: number | null;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  balanceMinor: number;
  todayInMinor: number;
  todayOutMinor: number;
  pendingInMinor: number;
}

/** Start of "today" in the desk's timezone, as a timestamptz SQL expression. */
const TODAY = `(date_trunc('day', now() AT TIME ZONE o.timezone) AT TIME ZONE o.timezone)`;

export async function listRails(db: Db, ctx: Ctx, opts: { includeArchived?: boolean } = {}): Promise<Rail[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT r.*,
       (SELECT COALESCE(SUM(f.amount_minor),0) FROM funds_receipts f WHERE f.rail_id = r.id AND f.created_at >= ${TODAY}) AS today_in,
       (SELECT COALESCE(SUM(p.amount_minor),0) FROM payouts p WHERE p.rail_id = r.id AND p.created_at >= ${TODAY}) AS today_out,
       (SELECT COALESCE(SUM(t.pay_minor - t.funds_received_minor),0) FROM trades t
          WHERE t.collection_rail_id = r.id AND t.status = 'AWAITING_FUNDS') AS pending_in
     FROM rails r JOIN organizations o ON o.id = r.org_id
     WHERE r.org_id = $1 ${opts.includeArchived ? '' : "AND r.status <> 'ARCHIVED'"}
     ORDER BY r.currency DESC, r.status, r.created_at`,
    [ctx.orgId],
  );
  const balances = await railBalances(db, ctx.orgId);
  return rows.map((r) => ({
    id: r.id as string,
    label: r.label as string,
    currency: r.currency as Currency,
    kind: r.kind as 'BANK' | 'MOMO',
    provider: r.provider as string,
    accountNumber: r.account_number as string,
    accountName: r.account_name as string,
    canCollect: Boolean(r.can_collect),
    canPay: Boolean(r.can_pay),
    dailySoftCapMinor: num(r.daily_soft_cap_minor),
    lowBalanceMinor: num(r.low_balance_minor),
    status: r.status as Rail['status'],
    balanceMinor: balances.get(r.id as string) ?? 0,
    todayInMinor: Number(r.today_in),
    todayOutMinor: Number(r.today_out),
    pendingInMinor: Number(r.pending_in),
  }));
}

export async function saveRail(
  db: Db,
  ctx: Ctx,
  input: {
    id?: string;
    label: string;
    currency: Currency;
    kind: 'BANK' | 'MOMO';
    provider: string;
    accountNumber: string;
    accountName: string;
    canCollect: boolean;
    canPay: boolean;
    dailySoftCapMinor?: number | null;
    lowBalanceMinor?: number | null;
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
    openingBalanceMinor?: number;
  },
) {
  requirePermission(ctx, 'configure');
  const acct = input.accountNumber.replace(/\s+/g, '');
  if (input.kind === 'BANK' && input.currency === 'NGN' && !/^\d{10}$/.test(acct)) fail('INVALID', 'Nigerian bank account numbers (NUBAN) have 10 digits.');
  if (input.kind === 'MOMO' && !/^0\d{9}$/.test(acct)) fail('INVALID', 'Ghana mobile money numbers have 10 digits and start with 0.');
  if (!input.canCollect && !input.canPay) fail('INVALID', 'An account must be able to receive, pay out, or both.');

  return db.tx(async (q) => {
    if (input.id) {
      const [existing] = await q.query<{ currency: string }>('SELECT currency FROM rails WHERE id = $1 AND org_id = $2 FOR UPDATE', [input.id, ctx.orgId]);
      if (!existing) fail('NOT_FOUND', 'Account not found.');
      if (existing.currency !== input.currency) fail('INVALID', 'You cannot change an account’s currency. Archive it and add a new one.');
      await q.query(
        `UPDATE rails SET label=$3, kind=$4, provider=$5, account_number=$6, account_name=$7, can_collect=$8, can_pay=$9,
           daily_soft_cap_minor=$10, low_balance_minor=$11, status=COALESCE($12, status)
         WHERE id=$1 AND org_id=$2`,
        [input.id, ctx.orgId, input.label.trim(), input.kind, input.provider.trim(), acct, input.accountName.trim(), input.canCollect, input.canPay, input.dailySoftCapMinor ?? null, input.lowBalanceMinor ?? null, input.status ?? null],
      );
      await appendAudit(q, { orgId: ctx.orgId, action: 'rail.updated', actor: actorOf(ctx), data: { railId: input.id, label: input.label, status: input.status } });
      return input.id;
    }
    const dup = await q.query('SELECT 1 FROM rails WHERE org_id=$1 AND currency=$2 AND provider=$3 AND account_number=$4', [ctx.orgId, input.currency, input.provider.trim(), acct]);
    if (dup.length) fail('CONFLICT', 'This account is already set up.');
    const [row] = await q.query<{ id: string }>(
      `INSERT INTO rails (org_id, label, currency, kind, provider, account_number, account_name, can_collect, can_pay, daily_soft_cap_minor, low_balance_minor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [ctx.orgId, input.label.trim(), input.currency, input.kind, input.provider.trim(), acct, input.accountName.trim(), input.canCollect, input.canPay, input.dailySoftCapMinor ?? null, input.lowBalanceMinor ?? null],
    );
    if (input.openingBalanceMinor && input.openingBalanceMinor !== 0) {
      await post(q, {
        orgId: ctx.orgId,
        kind: 'opening_balance',
        memo: `Opening balance for ${input.label}`,
        userId: ctx.userId,
        lines: [
          { account: railAccount(row.id), currency: input.currency, amountMinor: input.openingBalanceMinor },
          { account: 'equity:owner', currency: input.currency, amountMinor: -input.openingBalanceMinor },
        ],
      });
    }
    await appendAudit(q, { orgId: ctx.orgId, action: 'rail.added', actor: actorOf(ctx), data: { railId: row.id, label: input.label, currency: input.currency, openingBalanceMinor: input.openingBalanceMinor ?? 0 } });
    return row.id;
  });
}

/** Records float added, withdrawn, or moved between two accounts of the same currency. */
export async function adjustFloat(
  db: Db,
  ctx: Ctx,
  input: { railId: string; amountMinor: number; direction: 'IN' | 'OUT'; toRailId?: string | null; memo: string },
) {
  requirePermission(ctx, 'configure');
  if (!(input.amountMinor > 0)) fail('INVALID', 'Enter an amount greater than zero.');
  if (!input.memo.trim()) fail('INVALID', 'Add a short note so the movement can be traced later.');
  await db.tx(async (q) => {
    const rails = await q.query<{ id: string; currency: Currency; label: string }>('SELECT id, currency, label FROM rails WHERE org_id = $1 AND id = ANY($2::uuid[])', [ctx.orgId, [input.railId, input.toRailId].filter(Boolean)]);
    const from = rails.find((r) => r.id === input.railId);
    if (!from) fail('NOT_FOUND', 'Account not found.');
    await assertRailDayOpen(q, ctx.orgId, from!.id);
    const amt = input.amountMinor;
    if (input.toRailId) {
      const to = rails.find((r) => r.id === input.toRailId);
      if (!to) fail('NOT_FOUND', 'Destination account not found.');
      if (to!.currency !== from!.currency) fail('INVALID', 'Transfers must be between accounts of the same currency.');
      await assertRailDayOpen(q, ctx.orgId, to!.id);
      await post(q, { orgId: ctx.orgId, kind: 'float_transfer', memo: input.memo, userId: ctx.userId, lines: [
        { account: railAccount(from!.id), currency: from!.currency, amountMinor: -amt },
        { account: railAccount(to!.id), currency: to!.currency, amountMinor: amt },
      ] });
    } else {
      const sign = input.direction === 'IN' ? 1 : -1;
      await post(q, { orgId: ctx.orgId, kind: input.direction === 'IN' ? 'float_added' : 'float_withdrawn', memo: input.memo, userId: ctx.userId, lines: [
        { account: railAccount(from!.id), currency: from!.currency, amountMinor: sign * amt },
        { account: 'equity:owner', currency: from!.currency, amountMinor: -sign * amt },
      ] });
    }
    await appendAudit(q, { orgId: ctx.orgId, action: 'rail.float_adjusted', actor: actorOf(ctx), data: { railId: input.railId, toRailId: input.toRailId ?? null, direction: input.direction, amountMinor: amt, memo: input.memo } });
  });
}

// ---------------- Customers ----------------

export interface CustomerRow {
  id: string;
  ref: string;
  name: string;
  phone: string | null;
  email: string | null;
  kycStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  idType: string | null;
  idReference: string | null;
  perTradeLimitNgn: number | null;
  notes: string | null;
  createdAt: string;
  tradeCount: number;
  completedCount: number;
  volumeNgn: number;
  lastTradeAt: string | null;
}

const CUSTOMER_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM trades t WHERE t.customer_id = c.id
       AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test)) AS trade_count,
    (SELECT COUNT(*) FROM trades t WHERE t.customer_id = c.id AND t.status = 'COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test)) AS completed_count,
    (SELECT COALESCE(SUM(CASE WHEN t.pay_currency = 'NGN' THEN t.pay_minor ELSE t.receive_minor END),0)
       FROM trades t WHERE t.customer_id = c.id AND t.status = 'COMPLETED'
       AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test)) AS volume_ngn,
    (SELECT MAX(t.created_at) FROM trades t WHERE t.customer_id = c.id
       AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test)) AS last_trade_at
  FROM customers c`;

function mapCustomer(r: Record<string, unknown>): CustomerRow {
  return {
    id: r.id as string,
    ref: r.ref as string,
    name: r.name as string,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    kycStatus: r.kyc_status as CustomerRow['kycStatus'],
    idType: (r.id_type as string) ?? null,
    idReference: (r.id_reference as string) ?? null,
    perTradeLimitNgn: num(r.per_trade_limit_ngn),
    notes: (r.notes as string) ?? null,
    createdAt: iso(r.created_at)!,
    tradeCount: Number(r.trade_count ?? 0),
    completedCount: Number(r.completed_count ?? 0),
    volumeNgn: Number(r.volume_ngn ?? 0),
    lastTradeAt: iso(r.last_trade_at),
  };
}

export async function listCustomers(db: Db, ctx: Ctx, search?: string): Promise<CustomerRow[]> {
  const s = search?.trim();
  const rows = await db.query<Record<string, unknown>>(
    `${CUSTOMER_SELECT} WHERE c.org_id = $1 ${s ? "AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.ref ILIKE $2)" : ''}
     ORDER BY last_trade_at DESC NULLS LAST, c.created_at DESC LIMIT 200`,
    s ? [ctx.orgId, `%${s}%`] : [ctx.orgId],
  );
  return rows.map(mapCustomer);
}

export async function getCustomer(db: Db, ctx: Ctx, id: string): Promise<CustomerRow> {
  const [row] = await db.query<Record<string, unknown>>(`${CUSTOMER_SELECT} WHERE c.org_id = $1 AND c.id = $2`, [ctx.orgId, id]);
  if (!row) fail('NOT_FOUND', 'Customer not found.');
  return mapCustomer(row);
}

export async function saveCustomer(
  db: Db,
  ctx: Ctx,
  input: { id?: string; name: string; phone?: string | null; email?: string | null; kycStatus?: CustomerRow['kycStatus']; idType?: string | null; idReference?: string | null; perTradeLimitNgn?: number | null; notes?: string | null },
): Promise<string> {
  requirePermission(ctx, 'trade');
  if (input.kycStatus && input.kycStatus !== 'UNVERIFIED') requirePermission(ctx, 'approve');
  const phone = input.phone?.replace(/[^\d+]/g, '') || null;
  return db.tx(async (q) => {
    if (input.id) {
      const [before] = await q.query<{ kyc_status: string }>('SELECT kyc_status FROM customers WHERE id=$1 AND org_id=$2 FOR UPDATE', [input.id, ctx.orgId]);
      if (!before) fail('NOT_FOUND', 'Customer not found.');
      if (input.kycStatus && input.kycStatus !== before.kyc_status) requirePermission(ctx, 'approve');
      await q.query(
        `UPDATE customers SET name=$3, phone=$4, email=$5, kyc_status=COALESCE($6, kyc_status), id_type=$7, id_reference=$8,
           per_trade_limit_ngn=$9, notes=$10, updated_at=now() WHERE id=$1 AND org_id=$2`,
        [input.id, ctx.orgId, input.name.trim(), phone, input.email?.trim() || null, input.kycStatus ?? null, input.idType ?? null, input.idReference ?? null, input.perTradeLimitNgn ?? null, input.notes ?? null],
      );
      await appendAudit(q, {
        orgId: ctx.orgId,
        action: before.kyc_status !== input.kycStatus && input.kycStatus ? 'customer.kyc_changed' : 'customer.updated',
        actor: actorOf(ctx),
        data: { customerId: input.id, name: input.name, kycFrom: before.kyc_status, kycTo: input.kycStatus ?? before.kyc_status },
      });
      return input.id;
    }
    const [o] = await q.query<{ customer_seq: number }>('UPDATE organizations SET customer_seq = customer_seq + 1 WHERE id = $1 RETURNING customer_seq', [ctx.orgId]);
    const ref = `C-${String(o.customer_seq).padStart(4, '0')}`;
    const [row] = await q.query<{ id: string }>(
      `INSERT INTO customers (org_id, ref, name, phone, email, kyc_status, id_type, id_reference, per_trade_limit_ngn, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [ctx.orgId, ref, input.name.trim(), phone, input.email?.trim() || null, input.kycStatus ?? 'UNVERIFIED', input.idType ?? null, input.idReference ?? null, input.perTradeLimitNgn ?? null, input.notes ?? null, ctx.userId],
    );
    await appendAudit(q, { orgId: ctx.orgId, action: 'customer.added', actor: actorOf(ctx), data: { customerId: row.id, ref, name: input.name } });
    return row.id;
  });
}

export function corridorCurrencies(c: Corridor) {
  return CORRIDORS[c];
}
