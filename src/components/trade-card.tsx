'use client';

import Link from 'next/link';
import { ArrowRight, FileImage, TriangleAlert } from 'lucide-react';
import { CORRIDORS, formatMinor } from '@/lib/money';
import type { TradeSummary } from '@/lib/trades';
import { Countdown, cx, StatusBadge } from './ui';
import { timeAgo } from '@/lib/time';

/** One trade in the work queue. The whole card is a link to the trade room. */
export function TradeCard({ t, emphasis }: { t: TradeSummary; emphasis?: 'deadline' | 'evidence' }) {
  const partial = t.fundsReceivedMinor > 0 && t.fundsReceivedMinor < t.payMinor;
  return (
    <Link
      href={`/trades/${t.id}`}
      className={cx(
        'group block rounded-2xl border bg-white p-4 transition-shadow hover:shadow-md focus-visible:shadow-md',
        t.status === 'ON_HOLD' || t.status === 'REFUND_DUE' ? 'border-[#f3c7c2]' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink group-hover:text-brand">{t.customer.name}</div>
          <div className="mt-0.5 font-mono text-[0.6875rem] text-subtle">
            {t.ref} · {CORRIDORS[t.corridor].short}
          </div>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="font-mono font-semibold tabular text-ink">{formatMinor(t.payMinor, t.payCurrency)}</span>
        <ArrowRight size={13} className="text-subtle" />
        <span className="font-mono font-semibold tabular text-brand">{formatMinor(t.receiveMinor, t.receiveCurrency)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {t.status === 'QUOTED' && <Countdown to={t.quoteExpiresAt} label="expires in" />}
        {t.status === 'AWAITING_FUNDS' && t.fundsDueAt && <Countdown to={t.fundsDueAt} label="pay within" />}
        {t.evidenceCount > 0 && (t.status === 'AWAITING_FUNDS' || t.status === 'ON_HOLD') && (
          <span className={cx('inline-flex items-center gap-1 font-semibold', emphasis === 'evidence' ? 'text-info' : 'text-muted')}>
            <FileImage size={12} /> Proof sent
          </span>
        )}
        {partial && (
          <span className="inline-flex items-center gap-1 font-semibold text-amber">
            <TriangleAlert size={12} /> {formatMinor(t.payMinor - t.fundsReceivedMinor, t.payCurrency)} short
          </span>
        )}
        {t.customer.kycStatus !== 'VERIFIED' && <span className="text-amber">Not verified</span>}
        {t.holdReason && <span className="line-clamp-1 text-risk">{t.holdReason}</span>}
        <span className="ml-auto text-subtle">{timeAgo(t.updatedAt)}</span>
      </div>
    </Link>
  );
}
