'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Landmark, Pencil, Plus, Smartphone } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { type Currency } from '@/lib/money';
import { canApprove } from '@/lib/auth';
import { GH_BANKS, GH_MOMO_PROVIDERS, NG_BANKS } from '@/lib/trades';
import type { Rail } from '@/server/desk';
import { Button, Card, CopyButton, cx, Dialog, Empty, Field, Input, Notice, PageHeader, Pill, Segmented, Select, Skeleton, toast } from '@/components/ui';
import { useSession } from '@/components/app-shell';

/**
 * The accounts customers pay into and the desk pays out from. Only the
 * details a customer or teammate needs are kept here; balances stay private
 * to the desk and are not tracked.
 */

type Form = { label: string; currency: Currency; kind: 'BANK' | 'MOMO'; provider: string; accountNumber: string; accountName: string; canCollect: boolean; canPay: boolean; status: Rail['status'] };

const blank = (currency: Currency = 'NGN'): Form => ({
  label: '', currency, kind: currency === 'NGN' ? 'BANK' : 'MOMO', provider: currency === 'NGN' ? 'GTBank' : 'MTN MoMo', accountNumber: '', accountName: '',
  canCollect: true, canPay: true, status: 'ACTIVE',
});

function AccountDialog({ onClose, rail, onSaved }: { onClose: () => void; rail: Rail | null; onSaved: (r: Rail[]) => void }) {
  const [f, setF] = useState<Form>(() =>
    rail ? { label: rail.label, currency: rail.currency, kind: rail.kind, provider: rail.provider, accountNumber: rail.accountNumber, accountName: rail.accountName, canCollect: rail.canCollect, canPay: rail.canPay, status: rail.status } : blank(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = f.currency === 'NGN' ? NG_BANKS : f.kind === 'MOMO' ? GH_MOMO_PROVIDERS : GH_BANKS;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...f, label: f.label.trim() || `${f.provider} ${f.accountNumber.slice(-4)}` };
      const d = rail ? await api<{ rails: Rail[] }>(`/api/rails/${rail.id}`, { method: 'PUT', json: payload }) : await api<{ rails: Rail[] }>('/api/rails', { method: 'POST', json: payload });
      onSaved(d.rails);
      onClose();
      toast(rail ? 'Account updated' : 'Account added');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={rail ? `Edit ${rail.label}` : 'Add account'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save} disabled={!f.accountNumber || !f.accountName || (!f.canCollect && !f.canPay)}>Save account</Button></>}
    >
      <div className="space-y-4">
        {!rail && (
          <Field label="Currency">
            <Segmented value={f.currency} onChange={(c) => setF({ ...blank(c), label: f.label })} options={[{ value: 'NGN', label: 'Naira (Nigeria)' }, { value: 'GHS', label: 'Cedis (Ghana)' }]} />
          </Field>
        )}
        {f.currency === 'GHS' && (
          <Field label="Type">
            <Segmented value={f.kind} onChange={(kind) => setF({ ...f, kind, provider: kind === 'MOMO' ? 'MTN MoMo' : GH_BANKS[0] })} options={[{ value: 'MOMO', label: 'Mobile money' }, { value: 'BANK', label: 'Bank' }]} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f.kind === 'MOMO' ? 'Network' : 'Bank'} htmlFor="r-prov"><Select id="r-prov" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{providers.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label={f.kind === 'MOMO' ? 'MoMo number' : 'Account number'} htmlFor="r-num"><Input id="r-num" mono inputMode="numeric" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/[^\d]/g, '') })} /></Field>
          <Field label="Account name" htmlFor="r-name" hint="Customers see this on their payment instructions."><Input id="r-name" value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} /></Field>
          <Field label="Nickname for your team" htmlFor="r-label" optional><Input id="r-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. GTBank main" /></Field>
        </div>
        <div className="space-y-2 rounded-xl bg-paper px-4 py-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#175b3b]" checked={f.canCollect} onChange={(e) => setF({ ...f, canCollect: e.target.checked })} /> Customers pay into this account</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#175b3b]" checked={f.canPay} onChange={(e) => setF({ ...f, canPay: e.target.checked })} /> You pay customers from this account</label>
        </div>
        {rail && (
          <Field label="Status" htmlFor="r-status" hint="Paused accounts are not given to new customers. Archived accounts are hidden.">
            <Select id="r-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Rail['status'] })}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option></Select>
          </Field>
        )}
        {error && <Notice tone="risk">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function AccountCard({ r, admin, onEdit }: { r: Rail; admin: boolean; onEdit: () => void }) {
  return (
    <Card className={cx('flex flex-col p-5', r.status !== 'ACTIVE' && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef4ec] text-brand">{r.kind === 'MOMO' ? <Smartphone size={18} /> : <Landmark size={18} />}</div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{r.label}</div>
            <div className="truncate text-xs text-muted">{r.provider}</div>
          </div>
        </div>
        {r.status !== 'ACTIVE' ? (
          <Pill tone={r.status === 'PAUSED' ? 'waiting' : 'done'}>{r.status === 'PAUSED' ? 'Paused' : 'Archived'}</Pill>
        ) : (
          <Pill>{r.currency === 'NGN' ? 'Naira · Nigeria' : 'Cedis · Ghana'}</Pill>
        )}
      </div>
      <div className="mt-4 rounded-xl bg-paper px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-lg font-bold tracking-wide text-ink">{r.accountNumber}</span>
          <CopyButton text={r.accountNumber} variant="ghost" />
        </div>
        <div className="text-sm text-muted">{r.accountName}</div>
      </div>
      <div className="mt-4 flex flex-1 items-end justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {r.canCollect && <Pill tone="good"><ArrowDownLeft size={11} /> Customers pay in</Pill>}
          {r.canPay && <Pill><ArrowUpRight size={11} /> Pays out</Pill>}
        </div>
        {admin && <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={onEdit}>Edit</Button>}
      </div>
    </Card>
  );
}

export function AccountsView() {
  const session = useSession();
  const { data, setData, loading } = useLoad<{ rails: Rail[] }>('/api/rails?archived=1');
  const [editing, setEditing] = useState<Rail | null | 'new'>(null);
  const [showArchived, setShowArchived] = useState(false);
  const admin = canApprove(session);
  const rails = data?.rails ?? [];
  const archived = rails.filter((r) => r.status === 'ARCHIVED');
  const visible = rails.filter((r) => showArchived || r.status !== 'ARCHIVED');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Accounts"
        subtitle="Where customers pay you, and where you pay them from. Customers only ever see the account name and number on their payment instructions."
        actions={admin && <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>Add account</Button>}
      />
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
      ) : !rails.length ? (
        <Card>
          <Empty icon={<Landmark size={20} />} title="No accounts yet" action={admin && <Button size="sm" onClick={() => setEditing('new')}>Add your first account</Button>}>
            Add the account customers pay into, and the MoMo line or bank account you pay out from.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(['NGN', 'GHS'] as Currency[]).flatMap((c) => visible.filter((r) => r.currency === c)).map((r) => (
            <AccountCard key={r.id} r={r} admin={admin} onEdit={() => setEditing(r)} />
          ))}
          {admin && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-muted transition-colors hover:border-brand hover:text-brand cursor-pointer"
            >
              <Plus size={20} /> Add another account
            </button>
          )}
        </div>
      )}
      {archived.length > 0 && (
        <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs font-semibold text-brand hover:underline cursor-pointer">
          {showArchived ? 'Hide' : 'Show'} {archived.length} archived account{archived.length === 1 ? '' : 's'}
        </button>
      )}
      {editing && <AccountDialog onClose={() => setEditing(null)} rail={editing === 'new' ? null : editing} onSaved={(r) => setData({ rails: r })} />}
    </div>
  );
}
