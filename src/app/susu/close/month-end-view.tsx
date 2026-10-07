'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import { canApprove, canTrade } from '@/lib/auth';
import { cedis, periodLabel } from '@/lib/susu';
import { useSession } from '@/components/app-shell';
import { Button, Card, cx, Empty, Input, Notice, PageHeader, Segmented, Select, Skeleton, Stat, toast } from '@/components/ui';
import type { SusuPage } from '@/server/susu';

type Due = SusuPage & { saver: { id: string; name: string; ref: string; phone: string | null }; savedMinor: number; feeMinor: number; balanceMinor: number };
type Choice = { kind: 'ROLLOVER' | 'PAYOUT'; method: string; reference: string };

/**
 * Month end: every page from a month that has ended is closed here, one day's
 * fee each. Rolling over is the default, the way most savers keep going.
 */
export function MonthEndView() {
  const session = useSession();
  const { data, setData, loading } = useLoad<{ today: string; pages: Due[] }>('/api/susu/close');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const pages = useMemo(() => data?.pages ?? [], [data]);
  const approver = canApprove(session);
  const choice = (id: string): Choice => choices[id] ?? { kind: 'ROLLOVER', method: 'Cash', reference: '' };
  const set = (id: string, patch: Partial<Choice>) => setChoices({ ...choices, [id]: { ...choice(id), ...patch } });

  const totals = useMemo(() => {
    let fees = 0, payout = 0, carried = 0;
    for (const p of pages) {
      fees += p.feeMinor;
      if (choice(p.id).kind === 'PAYOUT') payout += p.balanceMinor;
      else carried += p.balanceMinor;
    }
    return { fees, payout, carried };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, choices]);

  const periods = [...new Set(pages.map((p) => p.period))];
  const closeAll = async () => {
    setBusy(true);
    try {
      const d = await api<{ closed: unknown[]; today: string; pages: Due[] }>('/api/susu/close', {
        method: 'POST',
        json: { pages: pages.map((p) => ({ pageId: p.id, kind: choice(p.id).kind, method: choice(p.id).kind === 'PAYOUT' ? choice(p.id).method : null, reference: choice(p.id).reference || null })) },
      });
      toast(`${d.closed.length} page${d.closed.length === 1 ? '' : 's'} closed · ${cedis(totals.fees)} in fees · SMS drafts ready on saver pages`);
      setData({ today: d.today, pages: d.pages });
      setChoices({});
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Nothing was closed.', 'risk');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/susu" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Susu</Link>
      <PageHeader title="Month-end closing" subtitle="Record a payout or roll each saver’s balance forward. Closing a page takes one day’s contribution as the collection fee; rolled-over money is not charged again." />
      {loading && !data ? <Skeleton className="h-64" /> : !pages.length ? (
        <Card><Empty icon={<CalendarCheck size={20} />} title="Nothing to close">Pages are ready here once their month has ended (and on the last day of the month).</Empty></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Collection fees" value={cedis(totals.fees)} hint={`one day from each of ${pages.length} page${pages.length === 1 ? '' : 's'}`} tone="brand" />
            <Stat label="Cash to pay out" value={cedis(totals.payout)} hint={`${pages.filter((p) => choice(p.id).kind === 'PAYOUT').length} saver(s) cashing out`} />
            <Stat label="Carried forward" value={cedis(totals.carried)} hint="rolls onto next month’s pages" />
          </div>
          {periods.map((period) => (
            <Card key={period} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <h2 className="text-sm font-bold text-ink">{periodLabel(period)}</h2>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setChoices({ ...choices, ...Object.fromEntries(pages.filter((p) => p.period === period).map((p) => [p.id, { ...choice(p.id), kind: 'ROLLOVER' as const }])) })}>All roll over</Button>
                  {approver && <Button size="sm" variant="ghost" onClick={() => setChoices({ ...choices, ...Object.fromEntries(pages.filter((p) => p.period === period).map((p) => [p.id, { ...choice(p.id), kind: 'PAYOUT' as const }])) })}>Pay out all</Button>}
                </div>
              </div>
              <ul className="divide-y divide-line">
                {pages.filter((p) => p.period === period).map((p) => {
                  const c = choice(p.id);
                  return (
                    <li key={p.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                      <div className="min-w-0">
                        <Link href={`/susu/${p.saver.id}`} className="font-semibold text-ink hover:text-brand">{p.saver.name}</Link>
                        <div className="text-xs text-muted">{p.daysPaid} of {p.capacity} days · contributed {cedis(p.savedMinor)}{p.broughtForwardMinor ? ` + ${cedis(p.broughtForwardMinor)} brought forward` : ''} · collection fee {cedis(p.feeMinor)}</div>
                      </div>
                      <div className={cx('font-mono text-lg font-bold tabular', p.balanceMinor ? 'text-ink' : 'text-subtle')}>{cedis(p.balanceMinor)}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Segmented size="sm" value={c.kind} onChange={(kind) => set(p.id, { kind })} options={approver ? [{ value: 'ROLLOVER', label: 'Roll over' }, { value: 'PAYOUT', label: 'Pay out' }] : [{ value: 'ROLLOVER', label: 'Roll over' }]} />
                        {c.kind === 'PAYOUT' && p.balanceMinor > 0 && (
                          <>
                            <Select aria-label="Payout method" value={c.method} onChange={(e) => set(p.id, { method: e.target.value })} className="py-1.5 text-xs"><option>Cash</option><option>MoMo</option><option>Bank</option></Select>
                            <Input aria-label="Reference" value={c.reference} onChange={(e) => set(p.id, { reference: e.target.value })} placeholder="Ref (optional)" className="w-32 py-1.5 text-xs" />
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          {canTrade(session) ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs text-muted">{approver ? 'Complete any cash, MoMo or bank payout before recording it here.' : 'Dealers can roll balances forward; an admin records cash payouts.'} This can’t be undone.</span>
              <Button size="lg" busy={busy} onClick={closeAll}>Record closing for {pages.length} page{pages.length === 1 ? '' : 's'}</Button>
            </div>
          ) : <Notice tone="info">Your role can view month end but not close pages.</Notice>}
        </>
      )}
    </div>
  );
}
