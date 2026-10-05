'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Field, Input, Notice, Select, Textarea } from '@/components/ui';

export function DemoForm() {
  const [f, setF] = useState({ name: '', business: '', phone: '', email: '', role: 'Owner', monthlyTrades: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  if (done) {
    return (
      <div className="rounded-2xl border border-[#c6e3c0] bg-[#eaf6e8] p-6 text-[#164a2f]">
        <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> Request saved</div>
        <p className="mt-1 text-sm">We have your details and will contact you to arrange a walkthrough. Nothing else happens until then.</p>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/api/leads', { method: 'POST', json: f });
          setDone(true);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="l-name"><Input id="l-name" required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Desk or business" htmlFor="l-biz"><Input id="l-biz" value={f.business} onChange={set('business')} /></Field>
        <Field label="Phone or WhatsApp" htmlFor="l-phone"><Input id="l-phone" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" /></Field>
        <Field label="Email" htmlFor="l-email" optional><Input id="l-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Your role" htmlFor="l-role">
          <Select id="l-role" value={f.role} onChange={set('role')}><option>Owner</option><option>Desk manager</option><option>Dealer</option><option>Compliance / finance</option><option>Other</option></Select>
        </Field>
        <Field label="Trades a month (roughly)" htmlFor="l-vol" optional>
          <Select id="l-vol" value={f.monthlyTrades} onChange={set('monthlyTrades')}><option value="">Prefer not to say</option><option>Under 100</option><option>100 to 500</option><option>500 to 2,000</option><option>Over 2,000</option></Select>
        </Field>
      </div>
      <Field label="What slows your desk down today?" htmlFor="l-msg" optional><Textarea id="l-msg" value={f.message} onChange={set('message')} /></Field>
      {error && <Notice tone="risk">{error}</Notice>}
      <Button type="submit" size="lg" busy={busy} disabled={!f.name || (!f.phone && !f.email)}>Request a walkthrough</Button>
      <p className="text-xs text-subtle">We use these details only to contact you about Aksen OTC.</p>
    </form>
  );
}
