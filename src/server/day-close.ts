import type { Db, Queryable } from './db';
import { actorOf, requirePermission, type Ctx } from './auth';
import { appendAudit } from './audit';
import { fail } from './errors';
import type { Currency } from '@/lib/money';

/**
 * Daily reconciliation. For each account, Aksen totals what the desk
 * recorded coming in (credits) and going out (payouts and refunds) on a
 * business day in the desk's timezone. The operator types the totals from
 * the actual bank or MoMo statement; any difference is shown and kept.
 */

export interface DayCloseRail {
  railId: string;
  label: string;
  currency: Currency;
  expectedInMinor: number;
  expectedOutMinor: number;
  items: { kind: 'IN' | 'OUT' | 'REFUND' | 'FLOAT_IN' | 'FLOAT_OUT'; tradeRef: string; tradeId: string | null; reference: string; amountMinor: number; at: string }[];
  closed: null | { statementInMinor: number; statementOutMinor: number; note: string | null; closedBy: string; closedAt: string };
}

const N = (v: unknown) => Number(v ?? 0);

export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Once an account is reconciled, no movement may silently change that signed-off day. */
export async function assertRailDayOpen(q: Queryable, orgId: string, railId: string) {
  const [closed] = await q.query<{ id: string }>(
    `SELECT d.id FROM day_closes d JOIN organizations o ON o.id = d.org_id
      WHERE d.org_id = $1 AND d.rail_id = $2
        AND d.business_date = (now() AT TIME ZONE o.timezone)::date
      FOR UPDATE OF d`,
    [orgId, railId],
  );
  if (closed) fail('CONFLICT', 'This account is already closed for today. Reopen the day before recording another movement.');
}

export async function getDay(db: Db, ctx: Ctx, date: string): Promise<{ date: string; timezone: string; rails: DayCloseRail[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('INVALID', 'Use a date like 2026-10-04.');
  const [org] = await db.query<{ timezone: string }>('SELECT timezone FROM organizations WHERE id = $1', [ctx.orgId]);
  const rails = await db.query<{ id: string; label: string; currency: Currency }>(`SELECT id, label, currency FROM rails WHERE org_id = $1 AND status <> 'ARCHIVED' ORDER BY currency DESC, created_at`, [ctx.orgId]);
  const start = `($2::date::timestamp AT TIME ZONE $3)`;
  const end = `(($2::date + 1)::timestamp AT TIME ZONE $3)`;
  const ins = await db.query<Record<string, unknown>>(
    `SELECT f.rail_id, f.amount_minor, f.bank_reference AS reference, f.created_at, t.ref, t.id AS trade_id
       FROM funds_receipts f JOIN trades t ON t.id = f.trade_id
      WHERE f.org_id = $1 AND f.created_at >= ${start} AND f.created_at < ${end}
      ORDER BY f.created_at`,
    [ctx.orgId, date, org.timezone],
  );
  const outs = await db.query<Record<string, unknown>>(
    `SELECT p.rail_id, p.amount_minor, p.reference, p.kind, p.created_at, t.ref, t.id AS trade_id
       FROM payouts p JOIN trades t ON t.id = p.trade_id
      WHERE p.org_id = $1 AND p.created_at >= ${start} AND p.created_at < ${end}
      ORDER BY p.created_at`,
    [ctx.orgId, date, org.timezone],
  );
  const floats = await db.query<Record<string, unknown>>(
    `SELECT substring(jl.account from 6) AS rail_id, jl.amount_minor, je.memo, je.kind, je.created_at
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.org_id = $1 AND jl.account LIKE 'rail:%'
        AND je.kind IN ('float_added','float_withdrawn','float_transfer')
        AND je.created_at >= ${start} AND je.created_at < ${end}
      ORDER BY je.created_at`,
    [ctx.orgId, date, org.timezone],
  );
  const closes = await db.query<Record<string, unknown>>(
    `SELECT d.*, u.name AS closed_by_name FROM day_closes d JOIN users u ON u.id = d.closed_by WHERE d.org_id = $1 AND d.business_date = $2::date`,
    [ctx.orgId, date],
  );
  return {
    date,
    timezone: org.timezone,
    rails: rails.map((r) => {
      const items = [
        ...ins.filter((i) => i.rail_id === r.id).map((i) => ({ kind: 'IN' as const, tradeRef: i.ref as string, tradeId: i.trade_id as string, reference: i.reference as string, amountMinor: N(i.amount_minor), at: new Date(i.created_at as string).toISOString() })),
        ...outs.filter((o) => o.rail_id === r.id).map((o) => ({ kind: (o.kind === 'REFUND' ? 'REFUND' : 'OUT') as 'OUT' | 'REFUND', tradeRef: o.ref as string, tradeId: o.trade_id as string, reference: o.reference as string, amountMinor: N(o.amount_minor), at: new Date(o.created_at as string).toISOString() })),
        ...floats.filter((f) => f.rail_id === r.id).map((f) => ({
          kind: (N(f.amount_minor) > 0 ? 'FLOAT_IN' : 'FLOAT_OUT') as 'FLOAT_IN' | 'FLOAT_OUT',
          tradeRef: 'Float',
          tradeId: null,
          reference: (f.memo as string) || String(f.kind).replace(/_/g, ' '),
          amountMinor: Math.abs(N(f.amount_minor)),
          at: new Date(f.created_at as string).toISOString(),
        })),
      ].sort((a, b) => a.at.localeCompare(b.at));
      const c = closes.find((x) => x.rail_id === r.id);
      return {
        railId: r.id,
        label: r.label,
        currency: r.currency,
        expectedInMinor: items.filter((i) => i.kind === 'IN' || i.kind === 'FLOAT_IN').reduce((s, i) => s + i.amountMinor, 0),
        expectedOutMinor: items.filter((i) => i.kind === 'OUT' || i.kind === 'REFUND' || i.kind === 'FLOAT_OUT').reduce((s, i) => s + i.amountMinor, 0),
        items,
        closed: c ? { statementInMinor: N(c.statement_in_minor), statementOutMinor: N(c.statement_out_minor), note: (c.note as string) ?? null, closedBy: c.closed_by_name as string, closedAt: new Date(c.closed_at as string).toISOString() } : null,
      };
    }),
  };
}

export async function closeRailDay(
  db: Db,
  ctx: Ctx,
  input: { date: string; railId: string; statementInMinor: number; statementOutMinor: number; note?: string | null },
) {
  requirePermission(ctx, 'configure');
  const day = await getDay(db, ctx, input.date);
  const rail = day.rails.find((r) => r.railId === input.railId);
  if (!rail) fail('NOT_FOUND', 'Account not found.');
  if (rail!.closed) fail('CONFLICT', 'This account is already closed for that day.');
  const diffIn = input.statementInMinor - rail!.expectedInMinor;
  const diffOut = input.statementOutMinor - rail!.expectedOutMinor;
  if ((diffIn !== 0 || diffOut !== 0) && !(input.note && input.note.trim().length >= 5)) {
    fail('INVALID', 'The statement does not match Aksen’s records. Explain the difference in the note before closing.');
  }
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO day_closes (org_id, business_date, rail_id, expected_in_minor, expected_out_minor, statement_in_minor, statement_out_minor, note, closed_by)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`,
      [ctx.orgId, input.date, input.railId, rail!.expectedInMinor, rail!.expectedOutMinor, input.statementInMinor, input.statementOutMinor, input.note?.trim() || null, ctx.userId],
    );
    await appendAudit(q, {
      orgId: ctx.orgId,
      action: 'day.closed',
      actor: actorOf(ctx),
      data: { date: input.date, railId: input.railId, label: rail!.label, expectedInMinor: rail!.expectedInMinor, expectedOutMinor: rail!.expectedOutMinor, statementInMinor: input.statementInMinor, statementOutMinor: input.statementOutMinor, differenceInMinor: diffIn, differenceOutMinor: diffOut },
    });
  });
}
