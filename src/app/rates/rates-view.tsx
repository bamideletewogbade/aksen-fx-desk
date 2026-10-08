'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight, CircleDollarSign, History } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { computeQuote, formatMinor, parseMajor, parseRate, RATE_SCALE, type BoardRateKey, type Corridor } from '@/lib/money';
import { canApprove } from '@/lib/auth';
import { dateTime } from '@/lib/time';
import type { RateRow } from '@/server/desk';
import { Button, Card, cx, Field, Input, Notice, PageHeader, Skeleton, toast } from '@/components/ui';
import { useSession } from '@/components/app-shell';

type RateMeta = { title: string; short: string; unit: string; description: string };

const RATE_CARDS: Record<BoardRateKey, RateMeta> = {
  NGN_GHS: { title: 'Naira to cedis', short: 'NGN → GHS', unit: '1 GHS in naira', description: 'Use this when a customer sends naira and receives cedis.' },
  GHS_NGN: { title: 'Cedis to naira', short: 'GHS → NGN', unit: '1 GHS in naira', description: 'Use this when a customer sends cedis and receives naira.' },
  USD_NGN: { title: 'Dollar to naira', short: 'USD → NGN', unit: '1 USD in naira', description: 'Your desk reference for converting dollars into naira.' },
  NGN_USD: { title: 'Naira to dollar', short: 'NGN → USD', unit: '1 USD in naira', description: 'Your desk reference for converting naira into dollars.' },
  USD_GHS: { title: 'Dollar to cedis', short: 'USD → GHS', unit: '1 USD in cedis', description: 'Your desk reference for converting dollars into cedis.' },
  GHS_USD: { title: 'Cedis to dollar', short: 'GHS → USD', unit: '1 USD in cedis', description: 'Your desk reference for converting cedis into dollars.' },
};

const USD_KEYS: BoardRateKey[] = ['USD_NGN', 'NGN_USD', 'USD_GHS', 'GHS_USD'];

type RatesData = {
  rates: RateRow[];
  history: { corridor: BoardRateKey; from: string | null; to: string; by: string; at: string }[];
};

function formatUsd(minor: number): string {
  return `$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function previewFor(key: BoardRateKey, value: string): string | null {
  try {
    const rate = parseRate(value);
    if (key === 'USD_NGN' || key === 'USD_GHS') {
      const payMinor = 100_00;
      const receiveMinor = Number((BigInt(payMinor) * rate) / RATE_SCALE);
      return `${formatUsd(payMinor)} → ${formatMinor(receiveMinor, key === 'USD_NGN' ? 'NGN' : 'GHS')}`;
    }
    if (key === 'NGN_USD' || key === 'GHS_USD') {
      const local = key === 'NGN_USD' ? 'NGN' : 'GHS';
      const payMinor = parseMajor(key === 'NGN_USD' ? '100000' : '1000');
      const receiveMinor = Number((BigInt(payMinor) * RATE_SCALE) / rate);
      return `${formatMinor(payMinor, local)} → ${formatUsd(receiveMinor)}`;
    }
    const corridor = key as Corridor;
    const q = computeQuote({ corridor, mode: 'PAY', amountMinor: parseMajor(corridor === 'NGN_GHS' ? '1000000' : '10000'), rate });
    return `${formatMinor(q.payMinor, corridor === 'NGN_GHS' ? 'NGN' : 'GHS')} → ${formatMinor(q.receiveMinor, corridor === 'NGN_GHS' ? 'GHS' : 'NGN')}`;
  } catch {
    return null;
  }
}

async function saveRate(rateKey: BoardRateKey, value: string): Promise<RatesData> {
  return api<RatesData>('/api/rates', { method: 'PUT', json: { corridor: rateKey, customerRate: value } });
}

function RateCard({ rateKey, row, editable, onSaved }: { rateKey: Corridor; row?: RateRow; editable: boolean; onSaved: (d: RatesData) => void }) {
  const meta = RATE_CARDS[rateKey];
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(row?.customerRate ?? ''), [row]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveRate(rateKey, value));
      toast(`${meta.short} rate saved`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex min-h-[21rem] flex-col overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-line bg-paper/70 px-5 py-4">
        <div><div className="font-mono text-[0.6875rem] font-semibold tracking-wide text-brand">{meta.short}</div><h2 className="mt-1 text-lg font-bold text-ink">{meta.title}</h2></div>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[0.625rem] font-semibold text-muted">Live quotes</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-sm leading-relaxed text-muted">{meta.description}</p>
        <div className="mt-5"><Field label="Rate" htmlFor={`${rateKey}-rate`} hint={meta.unit}><Input id={`${rateKey}-rate`} mono inputMode="decimal" autoComplete="off" className="h-14 text-2xl font-bold" value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} placeholder="105.00" onKeyDown={(e) => e.key === 'Enter' && value && save()} /></Field></div>
        <RatePreview value={previewFor(rateKey, value)} />
        {row && <p className="mt-3 text-xs text-subtle" suppressHydrationWarning>Last set {dateTime(row.updatedAt)}{row.updatedBy ? ` by ${row.updatedBy}` : ''}</p>}
        {error && <Notice tone="risk" className="mt-3">{error}</Notice>}
        {editable && <div className="mt-auto pt-5"><Button className="w-full" busy={busy} onClick={save} disabled={!value}>Save rate</Button></div>}
      </div>
    </Card>
  );
}

function RatePreview({ value }: { value: string | null }) {
  return (
    <div className="mt-4 flex min-h-14 items-center gap-3 rounded-xl bg-paper px-4 py-3">
      <CircleDollarSign size={18} className="shrink-0 text-brand" />
      {value ? <span className="font-mono text-sm font-semibold tabular text-ink">{value}</span> : <span className="text-xs text-subtle">Enter the rate to see a quick conversion.</span>}
    </div>
  );
}

function UsdRateCard({ rates, editable, onSaved }: { rates: RateRow[]; editable: boolean; onSaved: (d: RatesData) => void }) {
  const [local, setLocal] = useState<'NGN' | 'GHS'>('NGN');
  const [usdFirst, setUsdFirst] = useState(true);
  const rateKey = `${usdFirst ? 'USD' : local}_${usdFirst ? local : 'USD'}` as BoardRateKey;
  const row = rates.find((item) => item.corridor === rateKey);
  const meta = RATE_CARDS[rateKey];
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setValue(row?.customerRate ?? ''); setError(null); }, [rateKey, row]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveRate(rateKey, value));
      toast(`${meta.short} rate saved`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const from = usdFirst ? { code: 'USD', symbol: '$', name: 'US dollar' } : local === 'NGN' ? { code: 'NGN', symbol: '₦', name: 'Naira' } : { code: 'GHS', symbol: 'GH₵', name: 'Cedis' };
  const to = usdFirst ? (local === 'NGN' ? { code: 'NGN', symbol: '₦', name: 'Naira' } : { code: 'GHS', symbol: 'GH₵', name: 'Cedis' }) : { code: 'USD', symbol: '$', name: 'US dollar' };
  const saved = USD_KEYS.filter((key) => rates.some((item) => item.corridor === key)).length;

  return (
    <Card className="overflow-hidden p-0 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-[linear-gradient(110deg,#f4f8f2_0%,#ffffff_60%)] px-5 py-4">
        <div><div className="font-mono text-[0.6875rem] font-semibold tracking-wide text-brand">USD EXCHANGE</div><h2 className="mt-1 text-lg font-bold text-ink">Dollar rates</h2><p className="mt-1 text-sm text-muted">Keep a separate buy and sell rate for both cedis and naira.</p></div>
        <div className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted">{saved} of 4 directions saved</div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(18rem,1fr)_minmax(18rem,1fr)] lg:items-start">
        <div>
          <div className="mb-3 text-xs font-semibold text-muted">Choose the local currency</div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-1.5">
            {(['NGN', 'GHS'] as const).map((currency) => (
              <button key={currency} type="button" onClick={() => setLocal(currency)} className={cx('rounded-lg px-3 py-2.5 text-sm font-semibold transition', local === currency ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>
                {currency === 'NGN' ? '₦ Naira' : 'GH₵ Cedis'}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="rounded-xl border border-line bg-white p-4"><div className="text-2xl font-bold text-ink">{from.symbol}</div><div className="mt-2 font-mono text-xs font-semibold text-ink">{from.code}</div><div className="text-xs text-subtle">{from.name}</div></div>
            <button type="button" onClick={() => setUsdFirst((current) => !current)} className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-sm transition hover:rotate-180 hover:bg-brand-deep" aria-label="Reverse USD rate direction"><ArrowLeftRight size={18} /></button>
            <div className="rounded-xl border border-line bg-white p-4 text-right"><div className="text-2xl font-bold text-ink">{to.symbol}</div><div className="mt-2 font-mono text-xs font-semibold text-ink">{to.code}</div><div className="text-xs text-subtle">{to.name}</div></div>
          </div>
          <p className="mt-3 text-xs text-muted">Editing <strong className="text-ink">{meta.short}</strong>. Use the center button to reverse the direction.</p>
        </div>

        <div>
          <Field label="Rate" htmlFor="usd-rate" hint={meta.unit}><Input id="usd-rate" mono inputMode="decimal" autoComplete="off" className="h-14 text-2xl font-bold" value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} placeholder={local === 'NGN' ? '1500.00' : '15.00'} onKeyDown={(e) => e.key === 'Enter' && value && save()} /></Field>
          <RatePreview value={previewFor(rateKey, value)} />
          {row && <p className="mt-3 text-xs text-subtle" suppressHydrationWarning>Last set {dateTime(row.updatedAt)}{row.updatedBy ? ` by ${row.updatedBy}` : ''}</p>}
          {error && <Notice tone="risk" className="mt-3">{error}</Notice>}
          {editable && <div className="mt-5"><Button className="w-full" busy={busy} onClick={save} disabled={!value}>Save {meta.short} rate</Button></div>}
        </div>
      </div>
    </Card>
  );
}

export function RatesView() {
  const session = useSession();
  const { data, setData, loading } = useLoad<RatesData>('/api/rates');
  const editable = canApprove(session);
  const rates = data?.rates ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Rates" subtitle="Set the numbers your desk uses today. New customer rates apply to new quotes; existing quotes keep their locked rate." />
      {!editable && <Notice tone="info">Only admins can change rates.</Notice>}
      {loading && !data ? <Skeleton className="h-80" /> : (
        <div className="grid gap-5 xl:grid-cols-2">
          {(['NGN_GHS', 'GHS_NGN'] as Corridor[]).map((rateKey) => <RateCard key={rateKey} rateKey={rateKey} row={rates.find((row) => row.corridor === rateKey)} editable={editable} onSaved={setData} />)}
          <UsdRateCard rates={rates} editable={editable} onSaved={setData} />
        </div>
      )}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><History size={15} /> Rate changes</h2>
        {data?.history.length ? <ul className="mt-3 divide-y divide-line text-sm">{data.history.map((item, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><span className="flex items-center gap-2"><span className="font-mono text-xs text-subtle">{RATE_CARDS[item.corridor]?.short ?? item.corridor}</span><span className="font-mono">{item.from ?? '—'}</span><ArrowRight size={13} className="text-subtle" /><strong className="font-mono text-ink">{item.to}</strong></span><span className="text-xs text-subtle" suppressHydrationWarning>{item.by} · {dateTime(item.at)}</span></li>)}</ul> : <p className="mt-2 text-sm text-subtle">No changes yet.</p>}
      </Card>
    </div>
  );
}
