'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowLeft, Flame, HandCoins, MessageSquareText, Pencil, Phone, Send, X } from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import { canApprove, canTrade } from '@/lib/auth';
import { cedis, closeMath, daysInMonth, periodLabel, splitCash } from '@/lib/susu';
import { dateTime } from '@/lib/time';
import { useSession } from '@/components/app-shell';
import { Button, Card, cx, Dialog, Field, Input, Notice, Pill, Select, Skeleton, Textarea, toast } from '@/components/ui';
import type { SaverSummary, SusuPage } from '@/server/susu';
import type { SusuSmsView } from '@/server/susu-sms';
import { StandingPill } from '../susu-view';

type Payment = { id: string; at: string; receivedMinor: number; changeMinor: number; days: number; periods: string[]; note: string | null; by: string | null };
type Data = { saver: SaverSummary; pages: SusuPage[]; payments: Payment[]; sms: SusuSmsView[]; smsDeskEnabled: boolean; today: string };

const smsStatus: Record<SusuSmsView['status'], { label: string; tone: 'neutral' | 'waiting' | 'good' | 'risk' | 'done' }> = {
  DRAFT: { label: 'Needs your review', tone: 'waiting' }, QUEUED: { label: 'Waiting to send', tone: 'waiting' }, SENDING: { label: 'Sending', tone: 'waiting' },
  ACCEPTED: { label: 'Accepted by Arkesel', tone: 'neutral' }, SANDBOX: { label: 'Test only', tone: 'neutral' }, DELIVERED: { label: 'Delivered', tone: 'good' },
  NOT_DELIVERED: { label: 'Not delivered', tone: 'risk' }, FAILED: { label: 'Rejected', tone: 'risk' }, UNKNOWN: { label: 'Check Arkesel', tone: 'risk' }, CANCELLED: { label: 'Skipped', tone: 'done' },
};

function SmsDraft({ saverId, sms, onChanged }: { saverId: string; sms: SusuSmsView; onChanged: (data: Data) => void }) {
  const [message, setMessage] = useState(sms.message);
  const [busy, setBusy] = useState<'save' | 'send' | 'cancel' | null>(null);
  const act = async (action: 'save' | 'send' | 'cancel') => {
    setBusy(action);
    try {
      const data = await api<Data>(`/api/susu/${saverId}/sms`, { method: 'POST', json: { messageId: sms.id, action, ...(action === 'cancel' ? {} : { message }) } });
      onChanged(data);
      toast(action === 'send' ? 'SMS queued for sending' : action === 'cancel' ? 'SMS skipped' : 'Draft saved');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update the SMS.', 'risk');
    } finally { setBusy(null); }
  };
  return <div className="rounded-xl border border-amber/30 bg-amber-bg/40 p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-ink">Review before sending</strong><Pill tone="waiting">Draft</Pill></div>
    <Textarea rows={4} value={message} maxLength={480} onChange={(e) => setMessage(e.target.value)} aria-label="SMS message" />
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="mr-auto text-xs text-subtle">{message.length}/480 characters{message.length > 160 ? ' · may use more than one SMS credit' : ''}</span>
      <Button size="sm" variant="ghost" icon={<X size={13} />} busy={busy === 'cancel'} onClick={() => act('cancel')}>Skip</Button>
      <Button size="sm" variant="secondary" busy={busy === 'save'} disabled={!message.trim() || message === sms.message} onClick={() => act('save')}>Save draft</Button>
      <Button size="sm" icon={<Send size={13} />} busy={busy === 'send'} disabled={!message.trim()} onClick={() => act('send')}>Send SMS</Button>
    </div>
  </div>;
}

function SaverSms({ data, allowed, onChanged }: { data: Data; allowed: boolean; onChanged: (data: Data) => void }) {
  const drafts = data.sms.filter((m) => m.status === 'DRAFT');
  const history = data.sms.filter((m) => m.status !== 'DRAFT').slice(0, 8);
  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-bold text-ink"><MessageSquareText size={16} /> Saver SMS</h2><p className="mt-1 text-xs text-muted">Review the words, then send. Saving money never depends on SMS delivery.</p></div>
      <Pill tone={data.smsDeskEnabled && data.saver.smsEnabled ? 'good' : 'done'}>{!data.smsDeskEnabled ? 'SMS off in Settings' : data.saver.smsEnabled ? 'Receipts on' : 'Receipts off'}</Pill>
    </div>
    {!data.smsDeskEnabled ? <p className="text-sm text-subtle">Turn on Susu SMS receipts in Settings before creating new drafts.</p> : !data.saver.smsEnabled ? <p className="text-sm text-subtle">Turn receipts on under Edit after confirming the phone number.</p> : !data.sms.length ? <p className="text-sm text-subtle">No SMS drafts or delivery history yet.</p> : null}
    {allowed && drafts.map((m) => <SmsDraft key={m.id} saverId={data.saver.id} sms={m} onChanged={onChanged} />)}
    {!allowed && drafts.length > 0 && <Notice tone="info">{drafts.length} SMS draft{drafts.length === 1 ? '' : 's'} waiting for an operator to review.</Notice>}
    {history.length > 0 && <div><h3 className="mb-1 text-xs font-semibold text-ink">Recent messages</h3><ul className="divide-y divide-line">
      {history.map((m) => <li key={m.id} className="py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-subtle" suppressHydrationWarning>{dateTime(m.createdAt)} · +{m.recipient}</span><Pill tone={smsStatus[m.status].tone}>{smsStatus[m.status].label}</Pill></div><p className="mt-1 line-clamp-2 text-xs text-muted">{m.message}</p></li>)}
    </ul></div>}
  </Card>;
}

/** The page as the saver would see it in their booklet: a box per day of the month. */
function Booklet({ page, today }: { page: SusuPage; today: string }) {
  const dim = daysInMonth(page.period);
  const todayDay = page.period === today.slice(0, 7) ? Number(today.slice(8, 10)) : page.period < today.slice(0, 7) ? dim + 1 : 0;
  const lastBox = page.startDay + page.capacity - 1;
  const filledTo = page.startDay + page.daysPaid - 1;
  const boxes = Array.from({ length: dim }, (_, i) => i + 1);
  const firstWeekday = new Date(`${page.period}-01T12:00:00Z`).getUTCDay();
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[0.625rem] font-semibold uppercase text-subtle">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad${i}`} />)}
        {boxes.map((d) => {
          const onPage = d >= page.startDay && d <= lastBox;
          const filled = onPage && d <= filledTo;
          const due = onPage && !filled && d < todayDay;
          return (
            <span
              key={d}
              title={!onPage ? 'Not on this page' : filled ? 'Paid' : due ? 'Missed so far (can still be caught up this month)' : d === todayDay ? 'Due today' : 'Coming up'}
              className={cx(
                'flex aspect-square items-center justify-center rounded-lg text-xs font-semibold',
                !onPage && 'text-[#c9d3c6]',
                filled && 'bg-brand text-white',
                due && 'border border-dashed border-[#e8b4ad] bg-risk-bg text-risk',
                onPage && !filled && !due && 'bg-paper text-subtle',
                d === todayDay && 'ring-2 ring-ink ring-offset-1',
              )}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function EditSaver({ s, onClose, onSaved }: { s: SaverSummary; onClose: () => void; onSaved: (d: Data & { dailyChange: 'now' | 'next_page' | null }) => void }) {
  const [name, setName] = useState(s.name);
  const [phone, setPhone] = useState(s.phone ?? '');
  const [smsEnabled, setSmsEnabled] = useState(s.smsEnabled);
  const [daily, setDaily] = useState(String((s.nextDailyMinor ?? s.dailyMinor) / 100));
  const [notes, setNotes] = useState(s.notes ?? '');
  const [status, setStatus] = useState(s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api<Data & { dailyChange: 'now' | 'next_page' | null }>(`/api/susu/${s.id}`, { method: 'PUT', json: { name, phone: phone || null, daily, notes: notes || null, status, smsEnabled: !!phone && smsEnabled } });
      onSaved(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Edit ${s.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Full name" htmlFor="e-name"><Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily contribution (GH₵)" htmlFor="e-daily" hint="If boxes are already filled, a new amount starts when the next new page opens. Any prepaid page keeps its original amount."><Input id="e-daily" mono value={daily} onChange={(e) => setDaily(e.target.value)} /></Field>
          <Field label="Phone" htmlFor="e-phone" optional><Input id="e-phone" mono value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        <Field label="Notes" htmlFor="e-notes" optional><Input id="e-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" className="mt-1" checked={smsEnabled} disabled={!phone} onChange={e => setSmsEnabled(e.target.checked)} /><span>Send savings receipts to this number. Confirm it belongs to the saver. SMS must also be enabled in Settings.</span></label>
        <Field label="Booklet" htmlFor="e-status">
          <Select id="e-status" value={status} onChange={(e) => setStatus(e.target.value as SaverSummary['status'])}>
            <option value="ACTIVE">Active: collecting</option>
            <option value="PAUSED">Paused: not collecting for now</option>
            <option value="CLOSED">Closed: stopped saving with us</option>
          </Select>
        </Field>
        {error && <Notice tone="risk">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function Withdraw({ s, page, onClose, onDone }: { s: SaverSummary; page: SusuPage; onClose: () => void; onDone: (d: Data) => void }) {
  const desk = useSession().orgName;
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const m = closeMath(page);
  const go = async () => {
    setBusy(true);
    try {
      const d = await api<Data & { result: { balanceMinor: number } }>(`/api/susu/${s.id}`, { method: 'POST', json: { action: 'withdraw', method, reference: reference || null } });
      toast(`Withdrawal recorded for ${s.name.split(' ')[0]} · ${cedis(d.result.balanceMinor)}${s.smsEnabled ? ' · SMS draft ready below' : ''}`);
      onDone(d);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not record the withdrawal.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Withdrawal for ${s.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={m.balanceMinor <= 0} onClick={go}>Record withdrawal and close page</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5 rounded-xl bg-paper p-4">
          {page.broughtForwardMinor > 0 && <Row label="Brought forward" value={cedis(page.broughtForwardMinor)} />}
          <Row label={`Contributed this page (${page.daysPaid} day${page.daysPaid === 1 ? '' : 's'})`} value={cedis(m.savedMinor)} />
          <Row label={`${desk} collection fee (1 day)`} value={`− ${cedis(m.feeMinor)}`} />
          <div className="border-t border-line pt-1.5"><Row label={<strong>They receive</strong>} value={<strong>{cedis(m.balanceMinor)}</strong>} /></div>
        </div>
        <p className="text-xs text-muted">Complete the payout before recording it here. The page closes now. The {page.capacity - page.daysPaid} remaining day{page.capacity - page.daysPaid === 1 ? '' : 's'} of {periodLabel(page.period)} continue on a fresh page, which will have its own one-day fee when it closes.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payout method" htmlFor="w-method"><Select id="w-method" value={method} onChange={(e) => setMethod(e.target.value)}><option>Cash</option><option>MoMo</option><option>Bank</option></Select></Field>
          <Field label="Reference" htmlFor="w-ref" optional><Input id="w-ref" mono value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'Cash' ? 'e.g. receipt no.' : 'Transaction ID'} /></Field>
        </div>
      </div>
    </Dialog>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted">{label}</span><span className="font-mono tabular text-ink">{value}</span></div>;
}

export function SaverView({ id }: { id: string }) {
  const session = useSession();
  const { data, setData, error } = useLoad<Data>(`/api/susu/${id}`, { pollMs: 10_000 });
  const [amount, setAmount] = useState('');
  const collectionRequestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const allowed = canTrade(session);

  if (error) return <Notice tone="risk">{error.message}</Notice>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>;
  const s = data.saver;
  const page = s.page;
  const minor = Number(amount.replace(/[^\d.]/g, '')) * 100 || 0;
  const daily = page?.dailyMinor ?? s.dailyMinor;
  const split = minor ? splitCash(Math.round(minor), daily) : null;
  const closed = data.pages.filter((p) => p.status === 'CLOSED');
  const future = data.pages.filter((p) => p.status === 'OPEN' && page && p.period > page.period);

  const collect = async () => {
    setBusy(true);
    try {
      collectionRequestId.current ??= crypto.randomUUID();
      const d = await api<Data & { result: { days: number; changeMinor: number } }>(`/api/susu/${id}`, { method: 'POST', json: { action: 'collect', amount, requestId: collectionRequestId.current } });
      setData(d);
      setAmount('');
      collectionRequestId.current = null;
      toast(`${d.result.days} day${d.result.days === 1 ? '' : 's'} recorded${d.result.changeMinor ? ` · give back ${cedis(d.result.changeMinor)}` : ''}${s.smsEnabled ? ' · SMS draft ready below' : ''}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not record.', 'risk');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/susu" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Susu</Link>
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{s.name}</h1>
              <StandingPill s={s} />
              {s.status !== 'ACTIVE' && <Pill tone="done">{s.status.toLowerCase()}</Pill>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="font-mono">{s.ref}</span>
              <span>{cedis(daily)} a day{s.nextDailyMinor ? ` → ${cedis(s.nextDailyMinor)} when the next new page opens` : ''}</span>
              {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"><Phone size={13} /> {s.phone}</a>}
            </div>
            {s.notes && <p className="mt-2 text-xs text-subtle">{s.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-6 sm:text-right">
            <div><div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Held for saver</div><div className="font-mono text-2xl font-bold tabular text-ink">{cedis(s.heldMinor)}</div></div>
            <div><div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Streak</div><div className="inline-flex items-center gap-1 font-mono text-2xl font-bold tabular text-amber"><Flame size={18} />{s.streak}</div></div>
          </div>
        </div>
        {allowed && (
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            {s.status === 'ACTIVE' && <>
              <Field label="Contribution received" htmlFor="sv-amt">
                <Input id="sv-amt" mono inputMode="decimal" value={amount} onChange={(e) => { collectionRequestId.current = null; setAmount(e.target.value); }} onKeyDown={(e) => e.key === 'Enter' && split?.days && collect()} placeholder={`GH₵ ${daily / 100}`} className="w-40" />
              </Field>
              <Button busy={busy} disabled={!split?.days} onClick={collect}>Record</Button>
              {[1, 2, 7].map((n) => (
                <Button key={n} variant="secondary" size="sm" onClick={() => { collectionRequestId.current = null; setAmount(String((daily * n) / 100)); }}>{n === 1 ? '1 day' : `${n} days`}</Button>
              ))}
              {split && <span className={cx('text-xs', split.days ? 'text-muted' : 'text-risk')}>{split.days ? `${split.days} day${split.days === 1 ? '' : 's'}${split.changeMinor ? ` · change ${cedis(split.changeMinor)}` : ''}` : 'Less than one day'}</span>}
            </>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit</Button>
              {canApprove(session) && page && page.balanceIfClosedMinor > 0 && <Button variant="secondary" size="sm" icon={<HandCoins size={14} />} onClick={() => setWithdrawing(true)}>Record withdrawal</Button>}
            </div>
          </div>
        )}
      </Card>

      <SaverSms data={data} allowed={allowed} onChanged={setData} />

      {page && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">{periodLabel(page.period)} · page {page.pageNo}</h2>
              <span className="text-xs text-muted">{page.daysPaid} of {page.capacity} days</span>
            </div>
            <Booklet page={page} today={data.today} />
            <div className="mt-4 flex flex-wrap gap-4 text-[0.6875rem] text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand" /> Paid</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-[#e8b4ad] bg-risk-bg" /> Missed so far</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-paper ring-2 ring-ink" /> Today</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-paper" /> Coming up</span>
            </div>
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="mb-2 text-sm font-bold text-ink">If this page closed today</h2>
            {page.broughtForwardMinor > 0 && <Row label="Brought forward" value={cedis(page.broughtForwardMinor)} />}
            <Row label={`Contributed (${page.daysPaid} × ${cedis(page.dailyMinor)})`} value={cedis(page.savedMinor)} />
            <Row label="Collection fee (1 day)" value={`− ${cedis(page.feeMinor)}`} />
            <div className="border-t border-line pt-2"><Row label={<strong className="text-ink">{s.name.split(' ')[0]} would get</strong>} value={<strong>{cedis(page.balanceIfClosedMinor)}</strong>} /></div>
            {future.length > 0 && <Notice tone="good" className="!mt-4">Paid ahead: {future.map((p) => `${p.daysPaid} day${p.daysPaid === 1 ? '' : 's'} in ${periodLabel(p.period)}`).join(', ')}.</Notice>}
            <p className="pt-2 text-xs text-subtle">At month end, record a payout or roll the balance over. Rolled-over money is not charged again.</p>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Contributions</h2>
          {!data.payments.length ? <p className="text-sm text-subtle">Nothing collected yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{cedis(p.receivedMinor)} <span className="font-normal text-muted">= {p.days} day{p.days === 1 ? '' : 's'}</span></span>
                    <span className="block truncate text-xs text-subtle" suppressHydrationWarning>{dateTime(p.at)}{p.by ? ` · ${p.by}` : ''}{p.periods.length > 1 ? ` · spread over ${p.periods.map(periodLabel).join(' and ')}` : ''}</span>
                  </span>
                  {p.changeMinor > 0 && <Pill tone="waiting">change {cedis(p.changeMinor)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Closed pages</h2>
          {!closed.length ? <p className="text-sm text-subtle">No pages closed yet. The first closes at the end of {page ? periodLabel(page.period) : 'the month'}.</p> : (
            <ul className="divide-y divide-line text-sm">
              {closed.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{periodLabel(p.period)} <span className="font-normal text-muted">· {p.daysPaid}/{p.capacity} days · fee {cedis(p.feeMinor ?? 0)}</span></span>
                    <span className="block text-xs text-subtle" suppressHydrationWarning>{p.closedAt ? dateTime(p.closedAt) : ''}{p.payoutReference ? ` · ref ${p.payoutReference}` : ''}</span>
                  </span>
                  <Pill tone={p.closeKind === 'ROLLOVER' ? 'neutral' : 'good'}>
                    {p.closeKind === 'ROLLOVER' ? `Rolled over ${cedis(p.carriedMinor ?? 0)}` : `${p.closeKind === 'WITHDRAWAL' ? 'Withdrew' : 'Paid out'} ${cedis(p.paidOutMinor ?? 0)}`}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && <EditSaver s={s} onClose={() => setEditing(false)} onSaved={(d) => { setData(d); setEditing(false); toast(d.dailyChange === 'next_page' ? 'Saved. The new daily amount starts when the next new page opens.' : 'Saved'); }} />}
      {withdrawing && page && <Withdraw s={s} page={page} onClose={() => setWithdrawing(false)} onDone={setData} />}
    </div>
  );
}
