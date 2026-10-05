'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, Plus, Search, UserRound } from 'lucide-react';
import { useLoad } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { timeAgo } from '@/lib/time';
import type { CustomerRow } from '@/server/desk';
import { Button, Card, Empty, Input, Notice, PageHeader, Pill, Skeleton } from '@/components/ui';
import { CustomerDialog } from '@/components/customer-form';

export function CustomersView() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(sp.get('new') === '1');
  const { data, loading, error } = useLoad<{ customers: CustomerRow[] }>(`/api/customers?q=${encodeURIComponent(q)}`);
  const list = data?.customers ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="People and businesses your desk trades with, their checks and their history." actions={<Button icon={<Plus size={15} />} onClick={() => setOpen(true)}>New customer</Button>} />
      <div className="relative max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-subtle" />
        <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or C-number" aria-label="Search customers" />
      </div>
      {error && <Notice tone="risk">{error.message}</Notice>}
      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !list.length ? (
          <Empty icon={<UserRound size={20} />} title={q ? 'No customers match' : 'No customers yet'} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setOpen(true)}>Add customer</Button>}>Add customers as you quote, or here.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-[#f7faf6] sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">{c.name}{c.kycStatus === 'VERIFIED' && <BadgeCheck size={15} className="text-brand" aria-label="Verified" />}</div>
                    <div className="font-mono text-xs text-subtle">{c.ref}{c.phone ? ` · ${c.phone}` : ''}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    {c.kycStatus !== 'VERIFIED' && <Pill tone={c.kycStatus === 'REJECTED' ? 'risk' : 'waiting'}>{c.kycStatus === 'REJECTED' ? 'Rejected' : 'Not verified'}</Pill>}
                    <span>{c.completedCount} completed</span>
                    <span className="font-mono">{formatMinor(c.volumeNgn, 'NGN', { compact: true })}</span>
                    <span suppressHydrationWarning>{c.lastTradeAt ? `last ${timeAgo(c.lastTradeAt)}` : 'no trades yet'}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && <CustomerDialog open={open} onClose={() => setOpen(false)} onSaved={(c) => router.push(`/customers/${c.id}`)} />}
    </div>
  );
}
