import type { Queryable } from './db';
import type { Currency } from '@/lib/money';

/**
 * Minimal double-entry ledger. Each entry's lines must sum to zero per
 * currency. Positive = debit. Account keys:
 *   rail:<id>            money sitting in a collection/payout account (asset)
 *   payable:customer     money received from customers not yet paid out (liability)
 *   fx:position          currency converted through the desk
 *   revenue:fees         fees charged on trades
 *   equity:owner         float the owners added or withdrew
 * Corrections are new entries; nothing is updated or deleted.
 */
export interface Line {
  account: string;
  currency: Currency;
  amountMinor: number;
}

export async function post(
  q: Queryable,
  entry: { orgId: string; tradeId?: string | null; kind: string; memo?: string; userId?: string | null; lines: Line[] },
): Promise<string> {
  const totals = new Map<string, number>();
  for (const l of entry.lines) {
    if (!Number.isSafeInteger(l.amountMinor)) throw new Error('Ledger amounts must be integers');
    totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.amountMinor);
  }
  for (const [ccy, sum] of totals) {
    if (sum !== 0) throw new Error(`Unbalanced ledger entry (${entry.kind}) in ${ccy}: ${sum}`);
  }
  const [row] = await q.query<{ id: string }>(
    'INSERT INTO journal_entries (org_id, trade_id, kind, memo, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [entry.orgId, entry.tradeId ?? null, entry.kind, entry.memo ?? null, entry.userId ?? null],
  );
  for (const l of entry.lines.filter((x) => x.amountMinor !== 0)) {
    await q.query(
      'INSERT INTO journal_lines (entry_id, org_id, account, currency, amount_minor) VALUES ($1,$2,$3,$4,$5)',
      [row.id, entry.orgId, l.account, l.currency, l.amountMinor],
    );
  }
  return row.id;
}

export const railAccount = (railId: string) => `rail:${railId}`;

export async function railBalances(q: Queryable, orgId: string): Promise<Map<string, number>> {
  const rows = await q.query<{ account: string; balance: string | number }>(
    `SELECT account, COALESCE(SUM(amount_minor), 0) AS balance
       FROM journal_lines WHERE org_id = $1 AND account LIKE 'rail:%' GROUP BY account`,
    [orgId],
  );
  return new Map(rows.map((r) => [r.account.slice(5), Number(r.balance)]));
}

export async function accountBalance(q: Queryable, orgId: string, account: string, currency: Currency): Promise<number> {
  const [row] = await q.query<{ balance: string | number }>(
    'SELECT COALESCE(SUM(amount_minor), 0) AS balance FROM journal_lines WHERE org_id = $1 AND account = $2 AND currency = $3',
    [orgId, account, currency],
  );
  return Number(row?.balance ?? 0);
}
