'use client';

import { useEffect, useState } from 'react';
import { Bot, Fingerprint, ShieldCheck, ShieldX } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { formatMinor, minorToMajorString } from '@/lib/money';
import { canApprove } from '@/lib/auth';
import type { DeskSettings } from '@/server/desk';
import type { ChainReport } from '@/server/audit';
import { Button, Card, Field, Input, Notice, PageHeader, Select, Skeleton, Textarea, toast } from '@/components/ui';
import { useSession } from '@/components/app-shell';
import { AiCard } from './ai-card';
import { SmsCard } from './sms-card';

export function SettingsView() {
  const session = useSession();
  const { data, setData } = useLoad<{ settings: DeskSettings }>('/api/settings');
  const ai = useLoad<{ configured: boolean; primaryModel: string | null; usedFor: string[]; neverUsedFor: string[] }>('/api/ai/health');
  const editable = canApprove(session);
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainReport | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setF({
      name: s.name,
      timezone: s.timezone,
      supportPhone: s.supportPhone ?? '',
      customerNote: s.customerNote ?? '',
      quoteTtlMinutes: String(s.quoteTtlMinutes),
      fundsWindowMinutes: String(s.fundsWindowMinutes),
      approvalThresholdNgn: minorToMajorString(s.approvalThresholdNgn),
      approvalThresholdGhs: minorToMajorString(s.approvalThresholdGhs),
    });
  }, [data]);

  if (!data) return <Skeleton className="h-96" />;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ settings: DeskSettings }>('/api/settings', {
        method: 'PUT',
        json: { ...f, supportPhone: f.supportPhone || null, customerNote: f.customerNote || null, quoteTtlMinutes: Number(f.quoteTtlMinutes), fundsWindowMinutes: Number(f.fundsWindowMinutes) },
      });
      setData(d);
      toast('Settings saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="How your desk works and what customers see." />
      {!editable && <Notice tone="info">Only admins can change settings.</Notice>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-ink">Desk</h2>
          <Field label="Desk name" htmlFor="s-name" hint="Shown to customers on their trade link."><Input id="s-name" value={f.name ?? ''} onChange={set('name')} disabled={!editable} /></Field>
          <Field label="Business day timezone" htmlFor="s-tz" hint="Used for day close and daily limits.">
            <Select id="s-tz" value={f.timezone} onChange={set('timezone')} disabled={!editable}><option value="Africa/Accra">Accra (GMT)</option><option value="Africa/Lagos">Lagos (WAT, GMT+1)</option></Select>
          </Field>
          <Field label="Support phone" htmlFor="s-phone" hint="Customers can call or WhatsApp this number from their link."><Input id="s-phone" value={f.supportPhone ?? ''} onChange={set('supportPhone')} disabled={!editable} placeholder="+233…" /></Field>
          <Field label="Note on every customer link" htmlFor="s-note" optional><Textarea id="s-note" value={f.customerNote ?? ''} onChange={set('customerNote')} disabled={!editable} placeholder="e.g. Licensed by … · Open 8am–8pm" /></Field>
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-ink">Controls</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quotes valid for (min)" htmlFor="s-ttl"><Input id="s-ttl" type="number" min={1} max={1440} value={f.quoteTtlMinutes ?? ''} onChange={set('quoteTtlMinutes')} disabled={!editable} /></Field>
            <Field label="Payment window (min)" htmlFor="s-fw" hint="After accepting."><Input id="s-fw" type="number" min={5} max={10080} value={f.fundsWindowMinutes ?? ''} onChange={set('fundsWindowMinutes')} disabled={!editable} /></Field>
          </div>
          <div className="rounded-xl border border-line bg-paper p-4">
            <div className="text-sm font-semibold text-ink">Two-person approval</div>
            <p className="text-xs text-muted">Payouts at or above these amounts must be approved by a different admin from the person who confirmed the funds. Set 0 to require it on every payout.</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="Cedi payouts (GH₵)" htmlFor="s-tg"><Input id="s-tg" mono value={f.approvalThresholdGhs ?? ''} onChange={set('approvalThresholdGhs')} disabled={!editable} /></Field>
              <Field label="Naira payouts (₦)" htmlFor="s-tn"><Input id="s-tn" mono value={f.approvalThresholdNgn ?? ''} onChange={set('approvalThresholdNgn')} disabled={!editable} /></Field>
            </div>
            <p className="mt-2 text-xs text-subtle">Now: {formatMinor(data.settings.approvalThresholdGhs, 'GHS')} / {formatMinor(data.settings.approvalThresholdNgn, 'NGN')}</p>
          </div>
        </Card>
      </div>
      {error && <Notice tone="risk">{error}</Notice>}
      {editable && <Button busy={busy} onClick={save}>Save settings</Button>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Fingerprint size={16} /> Audit trail integrity</h2>
          <p className="mt-1 text-sm text-muted">Every action on your desk is chained to the one before it. Checking recomputes the whole chain; any edited or deleted record breaks it.</p>
          <div className="mt-3 rounded-xl bg-paper px-4 py-3 font-mono text-xs text-muted">{data.settings.auditEvents} events · head {data.settings.auditHead.slice(0, 20)}…</div>
          {chain && (chain.ok
            ? <Notice tone="good" className="mt-3" title={<span className="flex items-center gap-1.5"><ShieldCheck size={15} /> Intact</span>}>All {chain.events} events verify.</Notice>
            : <Notice tone="risk" className="mt-3" title={<span className="flex items-center gap-1.5"><ShieldX size={15} /> Broken at event {chain.brokenAtSeq ?? '—'}</span>}>{chain.reason}</Notice>)}
          <Button className="mt-3" variant="secondary" busy={checking} onClick={async () => { setChecking(true); try { setChain((await api<{ chain: ChainReport }>('/api/settings', { method: 'POST' })).chain); } finally { setChecking(false); } }}>Check now</Button>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Bot size={16} /> What AI does here</h2>
          {ai.data ? (
            <div className="mt-2 space-y-2 text-sm text-muted">
              <p><span className="font-semibold text-ink">Used for:</span> {ai.data.usedFor.join('; ')}.</p>
              <p><span className="font-semibold text-ink">Never used for:</span> {ai.data.neverUsedFor.join(', ').toLowerCase()}.</p>
            </div>
          ) : <Skeleton className="mt-2 h-16" />}
        </Card>
        <AiCard />
        {editable && <SmsCard />}
      </div>
    </div>
  );
}
