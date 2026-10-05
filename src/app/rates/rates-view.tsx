'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { computeQuote, CORRIDORS, formatMinor, minorToMajorString, parseMajor, parseRate, type Corridor } from '@/lib/money';
import { canApprove } from '@/lib/auth';
import { dateTime } from '@/lib/time';
import type { RateRow } from '@/server/desk';
import { Button, Card, Field, Input, Notice, PageHeader, Skeleton, toast } from '@/components/ui';
import { useSession } from '@/components/app-shell';

const COPY: Record<Corridor, { title: string; sub: string; example: string }> = {
  NGN_GHS: { title: 'Customers buy cedis', sub: 'They send naira, you pay out cedis. Set this above the market rate to earn a spread.', example: '1,000,000' },
  GHS_NGN: { title: 'Customers sell cedis', sub: 'They send cedis, you pay out naira. Set this below the market rate to earn a spread.', example: '10,000' },
};

function RateCard({ corridor, row, editable, onSaved }: { corridor: Corridor; row?: RateRow; editable: boolean; onSaved: (d: { rates: RateRow[]; history: unknown[] }) => void }) {
  const [f, setF] = useState({ customerRate: '', referenceRate: '', fee: '', minPay: '', maxPay: '', active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setF({
      customerRate: row?.customerRate ?? '',
      referenceRate: row?.referenceRate ?? '',
      fee: row?.feeMinor ? minorToMajorString(row.feeMinor) : '',
      minPay: row?.minPayMinor ? minorToMajorString(row.minPayMinor) : '',
      maxPay: row?.maxPayMinor ? minorToMajorString(row.maxPayMinor) : '',
      active: row?.active ?? true,
    });
  }, [row]);
  const { pay, receive } = CORRIDORS[corridor];

  let margin: string | null = null;
  let example: string | null = null;
  try {
    const r = parseRate(f.customerRate);
    if (f.referenceRate) {
      const ref = parseRate(f.referenceRate);
      const pct = (Number(r - ref) / Number(ref)) * 100 * (corridor === 'NGN_GHS' ? 1 : -1);
      margin = `${pct >= 0 ? '' : '−'}${Math.abs(pct).toFixed(2)}% ${pct >= 0 ? 'margin' : 'below market: you lose money'}`;
    }
    const q = computeQuote({ corridor, mode: 'PAY', amountMinor: parseMajor(COPY[corridor].example), rate: r, feeMinor: f.fee ? parseMajor(f.fee) : 0 });
    example = `${formatMinor(q.payMinor, pay)} → ${formatMinor(q.receiveMinor, receive)}`;
  } catch {
    /* incomplete input */
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ rates: RateRow[]; history: unknown[] }>('/api/rates', { method: 'PUT', json: { corridor, ...f, referenceRate: f.referenceRate || null, fee: f.fee || null, minPay: f.minPay || null, maxPay: f.maxPay || null } });
      onSaved(d);
      toast(`${CORRIDORS[corridor].short} rate saved`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">{COPY[corridor].title} <span className="font-mono text-xs font-normal text-subtle">{CORRIDORS[corridor].short}</span></h2>
          <p className="mt-0.5 text-sm text-muted">{COPY[corridor].sub}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[#175b3b]" checked={f.active} disabled={!editable} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Quoting
        </label>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Your customer rate (1 GHS = ₦)" htmlFor={`${corridor}-r`}><Input id={`${corridor}-r`} mono className="text-lg font-semibold" value={f.customerRate} disabled={!editable} onChange={(e) => setF({ ...f, customerRate: e.target.value })} placeholder="106.20" /></Field>
        <Field label="Market reference rate" htmlFor={`${corridor}-ref`} optional hint="Used only to show your margin."><Input id={`${corridor}-ref`} mono value={f.referenceRate} disabled={!editable} onChange={(e) => setF({ ...f, referenceRate: e.target.value })} placeholder="105.06" /></Field>
        <Field label={`Flat fee (${pay})`} htmlFor={`${corridor}-fee`} optional hint="Included in what the customer sends."><Input id={`${corridor}-fee`} mono value={f.fee} disabled={!editable} onChange={(e) => setF({ ...f, fee: e.target.value })} placeholder="0" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Min (${pay})`} htmlFor={`${corridor}-min`} optional><Input id={`${corridor}-min`} mono value={f.minPay} disabled={!editable} onChange={(e) => setF({ ...f, minPay: e.target.value })} /></Field>
          <Field label={`Max (${pay})`} htmlFor={`${corridor}-max`} optional><Input id={`${corridor}-max`} mono value={f.maxPay} disabled={!editable} onChange={(e) => setF({ ...f, maxPay: e.target.value })} /></Field>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-paper px-4 py-3 text-sm">
        {example && <span className="font-mono tabular text-ink">{example}</span>}
        {margin && <span className={margin.includes('lose') ? 'font-semibold text-risk' : 'font-semibold text-brand'}>{margin}</span>}
        {row && <span className="text-xs text-subtle" suppressHydrationWarning>Last set {dateTime(row.updatedAt)}{row.updatedBy ? ` by ${row.updatedBy}` : ''}</span>}
      </div>
      {error && <Notice tone="risk" className="mt-3">{error}</Notice>}
      {editable && <div className="mt-4"><Button busy={busy} onClick={save} disabled={!f.customerRate}>Save {CORRIDORS[corridor].short} rate</Button></div>}
      <p className="mt-3 text-xs text-subtle">New rates apply to new quotes. Quotes already sent keep the rate they were given until they expire.</p>
    </Card>
  );
}

export function RatesView() {
  const session = useSession();
  const { data, setData, loading } = useLoad<{ rates: RateRow[]; history: { corridor: Corridor; from: string | null; to: string; by: string; at: string }[] }>('/api/rates');
  const editable = canApprove(session);
  return (
    <div className="space-y-6">
      <PageHeader title="Rates" subtitle="Your rate board. Every quote is priced from here unless an admin sets a custom rate on that trade." />
      {!editable && <Notice tone="info">Only admins can change rates.</Notice>}
      {loading && !data ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {(['NGN_GHS', 'GHS_NGN'] as Corridor[]).map((c) => (
            <RateCard key={c} corridor={c} row={data?.rates.find((r) => r.corridor === c)} editable={editable} onSaved={(d) => setData(d as typeof data & object)} />
          ))}
        </div>
      )}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><History size={15} /> Rate changes</h2>
        {data?.history.length ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><span className="font-mono text-xs text-subtle">{CORRIDORS[h.corridor].short}</span> <span className="font-mono">{h.from ?? '—'} → <strong>{h.to}</strong></span></span>
                <span className="text-xs text-subtle" suppressHydrationWarning>{h.by} · {dateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-subtle">No changes yet.</p>
        )}
      </Card>
    </div>
  );
}
