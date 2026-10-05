'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { minorToMajorString } from '@/lib/money';
import { canApprove } from '@/lib/auth';
import type { CustomerRow } from '@/server/desk';
import { Button, Dialog, Field, Input, Notice, Select, Textarea } from './ui';
import { useSession } from './app-shell';

const ID_TYPES = ['Ghana Card', 'Passport', 'NIN', 'BVN', 'Voter ID', "Driver's licence", 'Business registration'];

export function CustomerDialog({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: CustomerRow | null; onSaved: (c: CustomerRow) => void }) {
  const session = useSession();
  const [f, setF] = useState(() => ({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    kycStatus: customer?.kycStatus ?? 'UNVERIFIED',
    idType: customer?.idType ?? '',
    idReference: customer?.idReference ?? '',
    perTradeLimitNgn: customer?.perTradeLimitNgn ? minorToMajorString(customer.perTradeLimitNgn) : '',
    notes: customer?.notes ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...f, phone: f.phone || null, email: f.email || null, idType: f.idType || null, idReference: f.idReference || null, perTradeLimitNgn: f.perTradeLimitNgn || null, notes: f.notes || null };
      const d = customer
        ? await api<{ customer: CustomerRow }>(`/api/customers/${customer.id}`, { method: 'PUT', json: payload })
        : await api<{ customer: CustomerRow }>('/api/customers', { method: 'POST', json: payload });
      onSaved(d.customer);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={customer ? `Edit ${customer.name}` : 'New customer'} wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={f.name.trim().length < 2} onClick={save}>Save customer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="c-name"><Input id="c-name" value={f.name} onChange={set('name')} placeholder="As on their ID" /></Field>
        <Field label="Phone (WhatsApp)" htmlFor="c-phone" optional><Input id="c-phone" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="+233…" /></Field>
        <Field label="Email" htmlFor="c-email" optional><Input id="c-email" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Per-trade limit (₦)" htmlFor="c-limit" optional hint="Trades above this show a warning before payout."><Input id="c-limit" mono value={f.perTradeLimitNgn} onChange={set('perTradeLimitNgn')} placeholder="e.g. 5,000,000" /></Field>
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-paper p-4">
        <div className="text-sm font-semibold text-ink">Customer checks</div>
        <p className="text-xs text-muted">Record the checks your desk completed under its own policy. Aksen stores the reference, not the document.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="c-kyc" hint={!canApprove(session) ? 'Only admins can mark verified or rejected.' : undefined}>
            <Select id="c-kyc" value={f.kycStatus} onChange={set('kycStatus')} disabled={!canApprove(session)}>
              <option value="UNVERIFIED">Not verified</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </Field>
          <Field label="ID type" htmlFor="c-idt" optional>
            <Select id="c-idt" value={f.idType} onChange={set('idType')}>
              <option value="">—</option>
              {ID_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="ID reference" htmlFor="c-idr" optional hint="Last digits are enough."><Input id="c-idr" value={f.idReference} onChange={set('idReference')} /></Field>
        </div>
      </div>
      <div className="mt-4"><Field label="Notes" htmlFor="c-notes" optional><Textarea id="c-notes" value={f.notes} onChange={set('notes')} /></Field></div>
      {error && <Notice tone="risk" className="mt-4">{error}</Notice>}
    </Dialog>
  );
}
