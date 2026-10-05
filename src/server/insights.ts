import type { Db } from './db';
import type { Ctx } from './auth';
import { parseRate, spreadEarnedNgn, type Corridor } from '@/lib/money';
import { sweepExpired } from './trades';

/**
 * Every number on the Insights page is computed here from the desk's own
 * records. Nothing is estimated or hardcoded; empty periods show zeros.
 *
 * Periods are calendar days in the desk's timezone ("today" starts at local
 * midnight), matching the daily chart. Trades from rehearsal (test) chats are
 * never counted.
 */

export interface Insights {
  periodDays: number;
  completed: number;
  volumeNgnMinor: number;
  volumeGhsMinor: number;
  /** Margin against the market rate the desk entered on each quote; only trades that had one count. */
  spreadNgnMinor: number;
  marginTrades: number;
  feesNgnMinor: number;
  feesGhsMinor: number;
  funnel: { quoted: number; accepted: number; funded: number; completed: number; expired: number; cancelled: number; refunded: number };
  medianMinutes: { toAccept: number | null; toFunds: number | null; toApprove: number | null; toPayout: number | null; total: number | null };
  daily: { day: string; ngnToGhsMinor: number; ghsToNgnMinor: number; count: number }[];
  topCustomers: { id: string; name: string; trades: number; volumeNgnMinor: number }[];
  /** What needs doing now (not limited to the period). Amounts are what the desk expects in or owes out. */
  attention: {
    awaitingFunds: { count: number; expectedNgnMinor: number; expectedGhsMinor: number };
    toApprove: { count: number; owedNgnMinor: number; owedGhsMinor: number };
    toPay: { count: number; owedNgnMinor: number; owedGhsMinor: number };
    onHold: number;
    refundDue: number;
  };
  chat: { conversations: number; quoted: number; completed: number };
  customers: { active: number; newCustomers: number; returning: number };
  /** Kept for the desk brief. */
  openPipeline: { status: string; count: number; ngnMinor: number }[];
}

const N = (v: unknown) => Number(v ?? 0);

/** Excludes trades that came from a rehearsal chat. */
const REAL = `NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test)`;

export async function getInsights(db: Db, ctx: Ctx, periodDays = 30): Promise<Insights> {
  await sweepExpired(db, ctx.orgId);
  const days = Math.min(Math.max(Math.round(periodDays), 1), 365);
  const [{ since }] = await db.query<{ since: string }>(
    `SELECT (date_trunc('day', now() AT TIME ZONE timezone) - ($2 || ' days')::interval) AT TIME ZONE timezone AS since FROM organizations WHERE id = $1`,
    [ctx.orgId, String(days - 1)],
  );
  const P = [ctx.orgId, since];

  const completedRows = await db.query<Record<string, unknown>>(
    `SELECT corridor, pay_currency, pay_minor, receive_minor, fee_minor, reference_rate
       FROM trades t WHERE org_id = $1 AND status = 'COMPLETED' AND completed_at >= $2 AND ${REAL}`,
    P,
  );
  let volumeNgn = 0, volumeGhs = 0, spread = 0, marginTrades = 0, feesNgn = 0, feesGhs = 0;
  for (const r of completedRows) {
    const pay = N(r.pay_minor), rec = N(r.receive_minor), fee = N(r.fee_minor);
    if (r.pay_currency === 'NGN') { volumeNgn += pay; volumeGhs += rec; feesNgn += fee; } else { volumeGhs += pay; volumeNgn += rec; feesGhs += fee; }
    const s = spreadEarnedNgn({ corridor: r.corridor as Corridor, payMinor: pay, receiveMinor: rec, feeMinor: fee, referenceRate: r.reference_rate ? parseRate(String(r.reference_rate)) : null });
    if (s !== null) { spread += s; marginTrades += 1; }
  }

  const [f] = await db.query<Record<string, unknown>>(
    `SELECT COUNT(*) AS quoted,
            COUNT(*) FILTER (WHERE accepted_at IS NOT NULL) AS accepted,
            COUNT(*) FILTER (WHERE funds_confirmed_at IS NOT NULL) AS funded,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
            COUNT(*) FILTER (WHERE status = 'EXPIRED') AS expired,
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COUNT(*) FILTER (WHERE status IN ('REFUNDED','REFUND_DUE')) AS refunded
       FROM trades t WHERE org_id = $1 AND created_at >= $2 AND ${REAL}`,
    P,
  );

  const [m] = await db.query<Record<string, unknown>>(
    `SELECT
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM accepted_at - created_at)/60) AS to_accept,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM funds_confirmed_at - accepted_at)/60) AS to_funds,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM approved_at - funds_confirmed_at)/60) AS to_approve,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM paid_out_at - approved_at)/60) AS to_payout,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM completed_at - created_at)/60) AS total
     FROM trades t WHERE org_id = $1 AND status = 'COMPLETED' AND completed_at >= $2 AND ${REAL}`,
    P,
  );
  const med = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);

  const daily = await db.query<Record<string, unknown>>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(CASE WHEN t.corridor = 'NGN_GHS' THEN t.pay_minor END), 0) AS ngn_ghs,
            COALESCE(SUM(CASE WHEN t.corridor = 'GHS_NGN' THEN t.receive_minor END), 0) AS ghs_ngn,
            COUNT(t.id) AS n
       FROM organizations o
       CROSS JOIN generate_series(((now() AT TIME ZONE o.timezone)::date - ${days - 1})::timestamp, (now() AT TIME ZONE o.timezone)::date::timestamp, interval '1 day') AS d(day)
       LEFT JOIN trades t ON t.org_id = o.id AND t.status = 'COMPLETED' AND (t.completed_at AT TIME ZONE o.timezone)::date = d.day::date AND ${REAL}
      WHERE o.id = $1
      GROUP BY d.day ORDER BY d.day`,
    [ctx.orgId],
  );

  const top = await db.query<Record<string, unknown>>(
    `SELECT c.id, c.name, COUNT(*) AS n,
            SUM(CASE WHEN t.pay_currency = 'NGN' THEN t.pay_minor ELSE t.receive_minor END) AS vol
       FROM trades t JOIN customers c ON c.id = t.customer_id
      WHERE t.org_id = $1 AND t.status = 'COMPLETED' AND t.completed_at >= $2 AND ${REAL}
      GROUP BY c.id, c.name ORDER BY vol DESC LIMIT 5`,
    P,
  );

  const open = await db.query<Record<string, unknown>>(
    `SELECT status, COUNT(*) AS n,
            SUM(CASE WHEN pay_currency = 'NGN' THEN pay_minor ELSE receive_minor END) AS ngn,
            SUM(CASE WHEN pay_currency = 'NGN' THEN pay_minor - funds_received_minor ELSE 0 END) AS exp_ngn,
            SUM(CASE WHEN pay_currency = 'GHS' THEN pay_minor - funds_received_minor ELSE 0 END) AS exp_ghs,
            SUM(CASE WHEN receive_currency = 'NGN' THEN receive_minor ELSE 0 END) AS owe_ngn,
            SUM(CASE WHEN receive_currency = 'GHS' THEN receive_minor ELSE 0 END) AS owe_ghs
       FROM trades t WHERE org_id = $1 AND status IN ('QUOTED','AWAITING_FUNDS','FUNDS_CONFIRMED','APPROVED','ON_HOLD','REFUND_DUE') AND ${REAL}
      GROUP BY status`,
    [ctx.orgId],
  );
  const row = (s: string) => open.find((o) => o.status === s) ?? {};

  const [chat] = await db.query<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM conversations cv WHERE cv.org_id = $1 AND NOT cv.is_test AND cv.last_inbound_at >= $2) AS conversations,
       (SELECT COUNT(*) FROM trades t JOIN conversations cv ON cv.id = t.conversation_id WHERE t.org_id = $1 AND NOT cv.is_test AND t.created_at >= $2) AS quoted,
       (SELECT COUNT(*) FROM trades t JOIN conversations cv ON cv.id = t.conversation_id WHERE t.org_id = $1 AND NOT cv.is_test AND t.status = 'COMPLETED' AND t.completed_at >= $2) AS completed`,
    P,
  );

  const [cust] = await db.query<Record<string, unknown>>(
    `WITH active AS (
       SELECT DISTINCT t.customer_id FROM trades t WHERE t.org_id = $1 AND t.status = 'COMPLETED' AND t.completed_at >= $2 AND ${REAL}
     )
     SELECT COUNT(*) AS active,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM trades p WHERE p.customer_id = a.customer_id AND p.status = 'COMPLETED' AND p.completed_at < $2)) AS returning
       FROM active a`,
    P,
  );

  return {
    periodDays: days,
    completed: completedRows.length,
    volumeNgnMinor: volumeNgn,
    volumeGhsMinor: volumeGhs,
    spreadNgnMinor: spread,
    marginTrades,
    feesNgnMinor: feesNgn,
    feesGhsMinor: feesGhs,
    funnel: {
      quoted: N(f.quoted), accepted: N(f.accepted), funded: N(f.funded), completed: N(f.completed),
      expired: N(f.expired), cancelled: N(f.cancelled), refunded: N(f.refunded),
    },
    medianMinutes: { toAccept: med(m.to_accept), toFunds: med(m.to_funds), toApprove: med(m.to_approve), toPayout: med(m.to_payout), total: med(m.total) },
    daily: daily.map((d) => ({ day: d.day as string, ngnToGhsMinor: N(d.ngn_ghs), ghsToNgnMinor: N(d.ghs_ngn), count: N(d.n) })),
    topCustomers: top.map((t) => ({ id: t.id as string, name: t.name as string, trades: N(t.n), volumeNgnMinor: N(t.vol) })),
    attention: {
      awaitingFunds: { count: N(row('AWAITING_FUNDS').n), expectedNgnMinor: N(row('AWAITING_FUNDS').exp_ngn), expectedGhsMinor: N(row('AWAITING_FUNDS').exp_ghs) },
      toApprove: { count: N(row('FUNDS_CONFIRMED').n), owedNgnMinor: N(row('FUNDS_CONFIRMED').owe_ngn), owedGhsMinor: N(row('FUNDS_CONFIRMED').owe_ghs) },
      toPay: { count: N(row('APPROVED').n), owedNgnMinor: N(row('APPROVED').owe_ngn), owedGhsMinor: N(row('APPROVED').owe_ghs) },
      onHold: N(row('ON_HOLD').n),
      refundDue: N(row('REFUND_DUE').n),
    },
    chat: { conversations: N(chat?.conversations), quoted: N(chat?.quoted), completed: N(chat?.completed) },
    customers: { active: N(cust?.active), newCustomers: N(cust?.active) - N(cust?.returning), returning: N(cust?.returning) },
    openPipeline: open.map((o) => ({ status: o.status as string, count: N(o.n), ngnMinor: N(o.ngn) })),
  };
}
