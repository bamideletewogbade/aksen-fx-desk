'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, BadgeCheck, Pencil, Plus } from 'lucide-react';
import { useLoad } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import type { TradeSummary } from '@/lib/trades';
import { dateTime } from '@/lib/time';
import type { CustomerRow } from '@/server/desk';
import { Button, Card, Empty, Notice, PageHeader, Pill, Skeleton, Stat } from '@/components/ui';
import { TradeCard } from '@/components/trade-card';
import { CustomerDialog } from '@/components/customer-form';

export function CustomerView({ id }: { id: string }) {
  const { data, setData, error } = useLoad<{ customer: CustomerRow; trades: TradeSummary[] }>(`/api/customers/${id}`);
  const [edit, setEdit] = useState(false);
  if (error) return <Notice tone="risk">{error.message}</Notice>;
  if (!data) return <Skeleton className="h-64" />;
  const c = data.customer;
  return (
    <div className="space-y-6">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Customers</Link>
      <PageHeader
        eyebrow={c.ref}
        title={<span className="flex items-center gap-2">{c.name}{c.kycStatus === 'VERIFIED' && <BadgeCheck className="text-brand" size={20} aria-label="Verified" />}</span>}
        subtitle={[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit</Button>
            <Link href={`/trades/new?customer=${c.id}`}><Button variant="secondary" icon={<Plus size={15} />}>Quote by phone or in person</Button></Link>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Checks" value={c.kycStatus === 'VERIFIED' ? 'Verified' : c.kycStatus === 'REJECTED' ? 'Rejected' : 'Not verified'} hint={c.idType ? `${c.idType} ${c.idReference ?? ''}` : 'No ID recorded'} tone={c.kycStatus === 'VERIFIED' ? 'brand' : c.kycStatus === 'REJECTED' ? 'risk' : 'amber'} />
        <Stat label="Completed trades" value={c.completedCount} hint={`${c.tradeCount} in total`} />
        <Stat label="Volume (₦ side)" value={formatMinor(c.volumeNgn, 'NGN', { compact: true })} />
        <Stat label="Per-trade limit" value={c.perTradeLimitNgn ? formatMinor(c.perTradeLimitNgn, 'NGN', { compact: true }) : 'None'} />
      </div>
      {c.notes && <Card className="p-4 text-sm text-muted"><span className="font-semibold text-ink">Notes: </span>{c.notes}</Card>}
      <section className="space-y-3">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted">Trades</h2>
        {data.trades.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.trades.map((t) => <TradeCard key={t.id} t={t} />)}</div>
        ) : (
          <Card><Empty title="No trades yet" action={<Link href={`/trades/new?customer=${c.id}`}><Button size="sm">Create a quote</Button></Link>} /></Card>
        )}
      </section>
      <p className="text-xs text-subtle">Customer since <span suppressHydrationWarning>{dateTime(c.createdAt)}</span>. <Pill>{c.ref}</Pill></p>
      {edit && <CustomerDialog open={edit} onClose={() => setEdit(false)} customer={c} onSaved={(nc) => setData({ ...data, customer: nc })} />}
    </div>
  );
}
