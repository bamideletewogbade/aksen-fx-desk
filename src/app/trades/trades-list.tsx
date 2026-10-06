'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Plus, Search } from 'lucide-react';
import { useLoad } from '@/lib/api';
import { CORRIDORS, formatMinor } from '@/lib/money';
import { STATUS_META, type TradeStatus, type TradeSummary } from '@/lib/trades';
import { dateTime } from '@/lib/time';
import { Button, Card, Empty, Input, Notice, PageHeader, Select, Skeleton, StatusBadge } from '@/components/ui';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  ...(Object.keys(STATUS_META) as TradeStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label })),
];

export function TradesList() {
  const [q, setQ] = useState('');
  const initial = useSearchParams().get('status');
  const [status, setStatus] = useState(initial && STATUS_FILTERS.some((f) => f.value === initial) ? initial : 'ALL');
  const [corridor, setCorridor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status !== 'ALL') p.set('status', status);
    if (corridor) p.set('corridor', corridor);
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set('to', new Date(new Date(`${to}T00:00:00`).getTime() + 86400_000).toISOString());
    return p.toString();
  }, [q, status, corridor, from, to]);
  const { data, loading, error } = useLoad<{ trades: TradeSummary[] }>(`/api/trades?limit=500&${params}`);
  const trades = data?.trades ?? [];

  const totals = useMemo(() => {
    const done = trades.filter((t) => t.status === 'COMPLETED');
    const ngn = done.reduce((s, t) => s + (t.payCurrency === 'NGN' ? t.payMinor : t.receiveMinor), 0);
    const ghs = done.reduce((s, t) => s + (t.payCurrency === 'GHS' ? t.payMinor : t.receiveMinor), 0);
    return { count: done.length, ngn, ghs };
  }, [trades]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trades"
        subtitle="Every quote and trade your desk has handled. Search by reference, customer, phone, beneficiary or statement reference."
        actions={
          <>
            <a href={`/api/export/trades?${params}`} download><Button variant="secondary" icon={<Download size={15} />}>Export CSV</Button></a>
            <Link href="/trades/new"><Button variant="secondary" icon={<Plus size={15} />}>Phone or walk-in quote</Button></Link>
          </>
        }
      />
      <Card className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_150px_150px_150px]">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-subtle" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search trades" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select value={corridor} onChange={(e) => setCorridor(e.target.value)} aria-label="Direction">
          <option value="">Both directions</option>
          <option value="NGN_GHS">NGN → GHS</option>
          <option value="GHS_NGN">GHS → NGN</option>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </Card>
      {error && <Notice tone="risk">{error.message}</Notice>}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span><strong className="text-ink">{trades.length}</strong> trades shown</span>
        <span><strong className="text-ink">{totals.count}</strong> completed · {formatMinor(totals.ngn, 'NGN')} · {formatMinor(totals.ghs, 'GHS')}</span>
      </div>
      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !trades.length ? (
          <Empty title="No trades match">Try a different search or clear the filters.</Empty>
        ) : (
          <>
          <ul className="divide-y divide-line xl:hidden">
            {trades.map((t) => (
              <li key={t.id} className="p-4">
                <Link href={`/trades/${t.id}`} className="block rounded-lg hover:bg-[#f7faf6] focus-visible:outline-2 focus-visible:outline-brand">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-bold text-ink">{t.ref}</span>
                      <span className="ml-2 text-xs text-subtle">{CORRIDORS[t.corridor].short}</span>
                      <div className="mt-1 text-sm font-medium text-ink">{t.customer.name}</div>
                      {t.beneficiary && t.beneficiary.relationship !== 'SELF' && <div className="text-xs text-muted">to {t.beneficiary.accountName}</div>}
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
                    <div className="text-xs text-muted">Sends <span className="block font-mono text-sm font-semibold tabular text-ink">{formatMinor(t.payMinor, t.payCurrency)}</span></div>
                    <div className="text-right text-xs text-muted">Receives <span className="block font-mono text-sm font-semibold tabular text-brand">{formatMinor(t.receiveMinor, t.receiveCurrency)}</span></div>
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-xs text-subtle"><span>Rate {t.rate}</span><span suppressHydrationWarning>{dateTime(t.updatedAt)}</span></div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[51.25rem] text-sm">
              <thead className="border-b border-line bg-[#f9fbf8] text-left text-[0.6875rem] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-3 py-3 font-semibold">Trade</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 text-right font-semibold">Sends</th>
                  <th className="px-3 py-3 text-right font-semibold">Receives</th>
                  <th className="px-3 py-3 font-semibold">Rate</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {trades.map((t) => (
                  <tr key={t.id} className="hover:bg-[#f7faf6]">
                    <td className="whitespace-nowrap px-3 py-3"><Link href={`/trades/${t.id}`} className="font-mono font-semibold text-ink hover:text-brand">{t.ref}</Link><div className="text-[0.6875rem] text-subtle">{CORRIDORS[t.corridor].short}</div></td>
                    <td className="px-3 py-3"><Link href={`/customers/${t.customer.id}`} className="font-medium text-ink hover:text-brand">{t.customer.name}</Link>{t.beneficiary && t.beneficiary.relationship !== 'SELF' && <div className="text-[0.6875rem] text-subtle">to {t.beneficiary.accountName}</div>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular">{formatMinor(t.payMinor, t.payCurrency)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular text-brand">{formatMinor(t.receiveMinor, t.receiveCurrency)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{t.rate}</td>
                    <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-subtle" suppressHydrationWarning>{dateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
