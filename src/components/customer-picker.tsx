'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Plus, Search, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { CustomerRow } from '@/server/desk';
import { Button, cx, Field, Input, Notice } from './ui';

/** Search existing customers or add one inline without leaving the quote. */
export function CustomerPicker({ value, onChange }: { value: CustomerRow | null; onChange: (c: CustomerRow | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) return;
    const t = setTimeout(async () => {
      try {
        const d = await api<{ customers: CustomerRow[] }>(`/api/customers?q=${encodeURIComponent(q)}`);
        setResults(d.customers.slice(0, 8));
      } catch {
        setResults([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-lime-soft text-brand"><UserRound size={16} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
              {value.name}
              {value.kycStatus === 'VERIFIED' && <BadgeCheck size={14} className="text-brand" aria-label="Verified" />}
            </div>
            <div className="truncate font-mono text-xs text-subtle">{value.ref}{value.phone ? ` · ${value.phone}` : ''} · {value.completedCount} completed</div>
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink cursor-pointer" aria-label="Change customer"><X size={16} /></button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-paper p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="nc-name"><Input id="nc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="As on their ID" /></Field>
          <Field label="Phone (WhatsApp)" htmlFor="nc-phone"><Input id="nc-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+233 24 000 0000" inputMode="tel" /></Field>
        </div>
        {error && <Notice tone="risk">{error}</Notice>}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const d = await api<{ customer: CustomerRow }>('/api/customers', { method: 'POST', json: { name: form.name, phone: form.phone || null } });
                onChange(d.customer);
                setCreating(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add customer
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
        </div>
        <p className="text-xs text-subtle">New customers start as not verified. Record their ID checks on the customer page.</p>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-3 text-subtle" />
        <Input
          aria-label="Search customers"
          className="pl-9"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Search by name, phone or C-number"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { onChange(c); setOpen(false); }} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-[#eef4ec] cursor-pointer">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                    <span className="block truncate font-mono text-xs text-subtle">{c.ref}{c.phone ? ` · ${c.phone}` : ''}</span>
                  </span>
                  <span className={cx('text-[0.6875rem] font-semibold', c.kycStatus === 'VERIFIED' ? 'text-brand' : c.kycStatus === 'REJECTED' ? 'text-risk' : 'text-amber')}>
                    {c.kycStatus === 'VERIFIED' ? 'Verified' : c.kycStatus === 'REJECTED' ? 'Rejected' : 'Not verified'}
                  </span>
                </button>
              </li>
            ))}
            {!results.length && <li className="px-3.5 py-2.5 text-sm text-subtle">{q ? `No customer matches “${q}”.` : 'No customers yet.'}</li>}
          </ul>
          <button type="button" onClick={() => { setCreating(true); setForm({ name: q, phone: '' }); setOpen(false); }} className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-sm font-semibold text-brand hover:bg-[#eef4ec] cursor-pointer">
            <Plus size={15} /> New customer{q ? ` “${q}”` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
