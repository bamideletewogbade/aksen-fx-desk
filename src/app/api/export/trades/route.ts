import { deskRoute, query } from '@/server/http';
import { listTrades } from '@/server/trades';
import { minorToMajorString } from '@/lib/money';
import { STATUS_META, type TradeStatus } from '@/lib/trades';
import type { Corridor } from '@/lib/money';

/** Neutralises spreadsheet formulas and quotes every field (RFC 4180). */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const GET = deskRoute(async ({ req, db, ctx }) => {
  const q = query(req);
  const status = q.get('status');
  const trades = await listTrades(db, ctx, {
    status: status && status !== 'ALL' ? (status === 'OPEN' ? 'OPEN' : (status.split(',') as TradeStatus[])) : 'ALL',
    q: q.get('q') ?? undefined,
    corridor: (q.get('corridor') as Corridor) || undefined,
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
    limit: 1000,
  });
  const header = ['Reference', 'Created (UTC)', 'Updated (UTC)', 'Status', 'Customer', 'Customer ref', 'Corridor', 'Pay currency', 'Pay amount', 'Receive currency', 'Receive amount', 'Fee', 'Rate (1 GHS in NGN)', 'Funds received', 'Refunded', 'Beneficiary', 'Beneficiary account', 'Beneficiary provider'];
  const rows = trades.map((t) => [
    t.ref, t.createdAt, t.updatedAt, STATUS_META[t.status].label, t.customer.name, t.customer.ref, t.corridor,
    t.payCurrency, minorToMajorString(t.payMinor), t.receiveCurrency, minorToMajorString(t.receiveMinor), minorToMajorString(t.feeMinor), t.rate,
    minorToMajorString(t.fundsReceivedMinor), minorToMajorString(t.refundedMinor),
    t.beneficiary?.accountName ?? '', t.beneficiary?.accountNumber ?? '', t.beneficiary?.provider ?? '',
  ]);
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="aksen-trades-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
