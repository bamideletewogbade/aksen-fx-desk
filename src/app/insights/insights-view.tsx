'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { useLoad } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { minutesLabel } from '@/lib/time';
import type { Insights } from '@/server/insights';
import { Card, cx, Empty, PageHeader, Segmented, Skeleton, Stat } from '@/components/ui';

// Validated categorical pair (light surface): deutan ΔE 16.4, normal ΔE 18.4, contrast ≥ 3:1.
const SERIES = [
  { key: 'ngnToGhsMinor' as const, label: 'Naira → Cedis', color: '#1f7a4f' },
  { key: 'ghsToNgnMinor' as const, label: 'Cedis → Naira', color: '#4a7fc1' },
];

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function VolumeChart({ daily }: { daily: Insights['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...daily.map((d) => d.ngnToGhsMinor + d.ghsToNgnMinor), 0));
  const W = 720, H = 220, L = 56, B = 26, T = 10;
  const plotW = W - L - 8, plotH = H - B - T;
  const band = plotW / daily.length;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const h = hover !== null ? daily[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Completed volume per day in naira, by direction">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e4ebe2" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#6f8378">{formatMinor(t, 'NGN', { compact: true })}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const cx = L + band * i + band / 2;
          let base = d.ngnToGhsMinor + d.ghsToNgnMinor === 0 ? null : T + plotH;
          const segs = SERIES.map((s) => ({ ...s, v: d[s.key] })).filter((s) => s.v > 0);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + band * i} y={T} width={band} height={plotH} fill={hover === i ? '#f1f6ef' : 'transparent'} />
              {base !== null && segs.map((s, k) => {
                const hgt = (s.v / max) * plotH;
                const top = base! - hgt;
                const isTop = k === segs.length - 1;
                const r = isTop ? Math.min(4, hgt / 2) : 0;
                const yTop = top + (k > 0 ? 0 : 0);
                const gap = k > 0 ? 2 : 0;
                const path = `M${cx - barW / 2},${base! - gap} L${cx - barW / 2},${yTop + r} Q${cx - barW / 2},${yTop} ${cx - barW / 2 + r},${yTop} L${cx + barW / 2 - r},${yTop} Q${cx + barW / 2},${yTop} ${cx + barW / 2},${yTop + r} L${cx + barW / 2},${base! - gap} Z`;
                base = top;
                return <path key={s.key} d={path} fill={s.color} />;
              })}
              {(i % Math.ceil(daily.length / 8) === 0 || i === daily.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#6f8378">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>
              )}
            </g>
          );
        })}
        <line x1={L} x2={W - 8} y1={T + plotH} y2={T + plotH} stroke="#cfdacb" strokeWidth={1} />
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-md">
          <div className="font-semibold text-ink">{new Date(`${h.day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          {SERIES.map((s) => (
            <div key={s.key} className="mt-0.5 flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}<span className="ml-auto font-mono text-ink">{formatMinor(h[s.key], 'NGN', { compact: true })}</span></div>
          ))}
          <div className="mt-0.5 text-subtle">{h.count} completed</div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {SERIES.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
        <span className="text-subtle">Naira value of completed trades per day</span>
      </div>
    </div>
  );
}

function HBar({ rows, format }: { rows: { label: string; value: number; note?: string }[]; format: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-3.5 overflow-hidden rounded-r-[4px] bg-[#f1f5ef]"><span className="block h-full rounded-r-[4px] bg-[#1f7a4f]" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="font-mono text-xs tabular text-ink">{format(r.value)}{r.note ? <span className="text-subtle"> {r.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

/** Owed/expected amounts in both currencies, skipping zeros. */
function both(ngn: number, ghs: number) {
  const parts = [ngn ? formatMinor(ngn, 'NGN', { compact: true }) : null, ghs ? formatMinor(ghs, 'GHS', { compact: true }) : null].filter(Boolean);
  return parts.length ? parts.join(' + ') : null;
}

function ActionTile({ href, label, count, detail, urgent }: { href: string; label: string; count: number; detail: string | null; urgent?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        'group rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm',
        count && urgent ? 'border-[#f1d4a6] bg-[#fffaf1]' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted">
        {label}
        <ArrowRight size={14} className="text-subtle transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className={cx('mt-1 font-mono text-2xl font-bold tabular', count && urgent ? 'text-amber' : 'text-ink')}>{count}</div>
      <div className="mt-0.5 truncate text-xs text-subtle">{count ? detail ?? ' ' : 'Nothing waiting'}</div>
    </Link>
  );
}

const PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

export function InsightsView() {
  const [days, setDays] = useState<(typeof PERIODS)[number]['value']>('30');
  const { data, loading } = useLoad<{ insights: Insights }>(`/api/insights?days=${days}`, { pollMs: 60_000 });
  const i = data?.insights;
  const conversion = useMemo(() => (i && i.funnel.quoted ? Math.round((i.funnel.completed / i.funnel.quoted) * 100) : null), [i]);
  const period = days === '1' ? 'today' : `in the last ${days} days`;

  return (
    <div className="space-y-8">
      <PageHeader title="Insights" subtitle="Worked out from your own trades. Rehearsal chats are left out." actions={<Segmented value={days} onChange={setDays} size="sm" options={[...PERIODS]} />} />
      {loading && !i ? <Skeleton className="h-96" /> : !i ? null : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted">Needs attention now</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ActionTile href="/trades?status=AWAITING_FUNDS" label="Waiting for customer payment" count={i.attention.awaitingFunds.count} detail={both(i.attention.awaitingFunds.expectedNgnMinor, i.attention.awaitingFunds.expectedGhsMinor) && `${both(i.attention.awaitingFunds.expectedNgnMinor, i.attention.awaitingFunds.expectedGhsMinor)} expected in`} />
              <ActionTile href="/trades?status=FUNDS_CONFIRMED" label="Ready to approve" urgent count={i.attention.toApprove.count} detail={both(i.attention.toApprove.owedNgnMinor, i.attention.toApprove.owedGhsMinor) && `${both(i.attention.toApprove.owedNgnMinor, i.attention.toApprove.owedGhsMinor)} owed to customers`} />
              <ActionTile href="/trades?status=APPROVED" label="Ready to pay out" urgent count={i.attention.toPay.count} detail={both(i.attention.toPay.owedNgnMinor, i.attention.toPay.owedGhsMinor) && `${both(i.attention.toPay.owedNgnMinor, i.attention.toPay.owedGhsMinor)} to send`} />
              <ActionTile href="/trades?status=ON_HOLD" label="On hold or refund due" urgent count={i.attention.onHold + i.attention.refundDue} detail={i.attention.refundDue ? `${i.attention.refundDue} refund${i.attention.refundDue === 1 ? '' : 's'} due` : 'Under review'} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted">How the desk did {period}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Completed trades" value={i.completed} hint={conversion !== null ? `${conversion}% of ${i.funnel.quoted} quote${i.funnel.quoted === 1 ? '' : 's'} completed` : 'No quotes yet'} />
              <Stat label="Money moved" value={formatMinor(i.volumeNgnMinor, 'NGN', { compact: true })} hint={`${formatMinor(i.volumeGhsMinor, 'GHS', { compact: true })} on the cedi side`} />
              {i.completed === 0 ? (
                <Stat label="Earned" value={formatMinor(0, 'NGN')} hint="Your margin and fees show once trades complete" tone="brand" />
              ) : i.marginTrades > 0 ? (
                <Stat label="Margin earned" value={formatMinor(i.spreadNgnMinor, 'NGN', { compact: true })} hint={`Against your market rate, on ${i.marginTrades} of ${i.completed} trades`} tone="brand" />
              ) : (
                <Stat label="Fees earned" value={both(i.feesNgnMinor, i.feesGhsMinor) ?? formatMinor(0, 'NGN')} hint="Add a market rate on the Rates page to also see your margin" tone="brand" />
              )}
              <Stat label="Typical time to pay out" value={i.medianMinutes.total === null ? '—' : minutesLabel(i.medianMinutes.total)} hint={i.medianMinutes.total === null ? 'Shows after your first completed trade' : 'From quote to payout sent'} />
            </div>
          </section>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink">Completed volume by day</h2>
            {i.completed ? <div className="mt-4"><VolumeChart daily={i.daily} /></div> : <Empty title={`No completed trades ${period}`}>Completed trades appear here day by day, split by direction.</Empty>}
            {i.completed > 0 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-semibold text-brand">Show as table</summary>
                <table className="mt-2 w-full">
                  <thead className="text-left text-subtle"><tr><th className="py-1">Day</th><th>Naira → Cedis</th><th>Cedis → Naira</th><th>Trades</th></tr></thead>
                  <tbody>{i.daily.filter((d) => d.count).map((d) => <tr key={d.day} className="border-t border-line"><td className="py-1">{d.day}</td><td className="font-mono">{formatMinor(d.ngnToGhsMinor, 'NGN')}</td><td className="font-mono">{formatMinor(d.ghsToNgnMinor, 'NGN')}</td><td>{d.count}</td></tr>)}</tbody>
                </table>
              </details>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-sm font-bold text-ink">Where trades slow down</h2>
              <p className="mb-4 text-xs text-muted">Typical time each step takes on completed trades. The longest bar is where to speed up first.</p>
              {i.medianMinutes.total === null ? <p className="text-sm text-subtle">Shows after your first completed trade.</p> : (
                <HBar
                  format={(v) => minutesLabel(v)}
                  rows={[
                    { label: 'Customer accepts', value: i.medianMinutes.toAccept ?? 0 },
                    { label: 'Money arrives', value: i.medianMinutes.toFunds ?? 0 },
                    { label: 'Admin approves', value: i.medianMinutes.toApprove ?? 0 },
                    { label: 'Payout sent', value: i.medianMinutes.toPayout ?? 0 },
                  ]}
                />
              )}
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-bold text-ink">Quotes: how far they got</h2>
              <p className="mb-4 text-xs text-muted">Every quote created {period}, from the desk or WhatsApp.</p>
              {i.funnel.quoted ? (
                <HBar
                  format={(v) => String(v)}
                  rows={[
                    { label: 'Quoted', value: i.funnel.quoted },
                    { label: 'Accepted', value: i.funnel.accepted },
                    { label: 'Funds in', value: i.funnel.funded },
                    { label: 'Completed', value: i.funnel.completed },
                  ]}
                />
              ) : <p className="text-sm text-subtle">No quotes in this period.</p>}
              {i.funnel.quoted > 0 && <p className="mt-3 text-xs text-subtle">{i.funnel.expired} expired · {i.funnel.cancelled} cancelled · {i.funnel.refunded} refunded</p>}
            </Card>
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><MessageSquare size={15} className="text-brand" /> WhatsApp assistant</h2>
              <p className="mb-4 text-xs text-muted">Customers who chatted {period}, and how many of those chats became trades.</p>
              {i.chat.conversations || i.chat.quoted ? (
                <HBar
                  format={(v) => String(v)}
                  rows={[
                    { label: 'Chats', value: i.chat.conversations },
                    { label: 'Quotes locked', value: i.chat.quoted },
                    { label: 'Completed', value: i.chat.completed },
                  ]}
                />
              ) : <p className="text-sm text-subtle">No WhatsApp chats {period}. Connect a number on the WhatsApp &amp; SMS page.</p>}
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-bold text-ink">Customers</h2>
              <p className="mb-3 text-xs text-muted">
                {i.customers.active
                  ? `${i.customers.active} customer${i.customers.active === 1 ? '' : 's'} completed a trade ${period}: ${i.customers.newCustomers} new, ${i.customers.returning} returning.`
                  : `No completed trades ${period}.`}
              </p>
              {i.topCustomers.length > 0 && (
                <ul className="divide-y divide-line text-sm">
                  {i.topCustomers.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 py-2"><Link href={`/customers/${c.id}`} className="font-medium text-ink hover:text-brand">{c.name}</Link><span className="font-mono text-xs text-muted">{c.trades} trade{c.trades === 1 ? '' : 's'} · {formatMinor(c.volumeNgnMinor, 'NGN', { compact: true })}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
