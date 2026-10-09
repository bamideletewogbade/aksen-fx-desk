'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Flame, HandCoins, MessageSquareText, Pencil, Phone, Send, X } from 'lucide-react';
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
type AdvanceEntry = { id: string; transactionRef: string; kind: 'ADVANCE' | 'REPAYMENT' | 'SETTLEMENT'; amountMinor: number; method: string | null; reference: string | null; note: string | null; by: string | null; at: string };
type Data = { saver: SaverSummary; pages: SusuPage[]; payments: Payment[]; advances: AdvanceEntry[]; sms: SusuSmsView[]; smsDeskEnabled: boolean; today: string };

const smsStatus: Record<SusuSmsView['status'], { label: string; tone: 'neutral' | 'waiting' | 'good' | 'risk' | 'done' }> = {
  DRAFT: { label: 'Not sent', tone: 'waiting' }, QUEUED: { label: 'Sending', tone: 'waiting' }, SENDING: { label: 'Sending', tone: 'waiting' },
  ACCEPTED: { label: 'Sent', tone: 'good' }, SANDBOX: { label: 'Test only', tone: 'neutral' }, DELIVERED: { label: 'Delivered', tone: 'good' },
  NOT_DELIVERED: { label: 'Not delivered', tone: 'risk' }, FAILED: { label: 'Not sent', tone: 'risk' }, UNKNOWN: { label: 'Not confirmed', tone: 'waiting' }, CANCELLED: { label: 'Not sent', tone: 'done' },
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
  const [open, setOpen] = useState(false);
  const drafts = data.sms.filter((m) => m.status === 'DRAFT');
  const history = data.sms.filter((m) => m.status !== 'DRAFT').slice(0, 8);
  const latest = data.sms[0];
  const summary = drafts.length > 0
    ? `${drafts.length} message${drafts.length === 1 ? '' : 's'} ready to review`
    : latest
      ? `Latest message: ${smsStatus[latest.status].label}`
      : 'No messages yet';

  return <Card className="overflow-hidden p-0">
    <button
      type="button"
      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-paper/70"
      aria-expanded={open}
      aria-controls="saver-messages"
      onClick={() => setOpen((value) => !value)}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-brand"><MessageSquareText size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">Messages</span>
        <span className="block truncate text-xs text-muted">{summary}</span>
      </span>
      {drafts.length > 0 && <Pill tone="waiting">{drafts.length} to review</Pill>}
      <ChevronDown size={17} className={cx('shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
    </button>
    {open && <div id="saver-messages" className="space-y-4 border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted">Review messages before sending. A saving is recorded even when a message is not sent.</p>
        <Pill tone={data.smsDeskEnabled && data.saver.smsEnabled ? 'good' : 'done'}>{!data.smsDeskEnabled ? 'Messages off in Settings' : data.saver.smsEnabled ? data.saver.smsAutoSend ? 'Auto-send on' : 'Review before sending' : 'Receipts off'}</Pill>
      </div>
      {!data.smsDeskEnabled ? <p className="text-sm text-subtle">Turn on Susu SMS receipts in Settings before creating new drafts.</p> : !data.saver.smsEnabled ? <p className="text-sm text-subtle">Turn receipts on under Edit after confirming the phone number.</p> : !data.sms.length ? <p className="text-sm text-subtle">No messages yet.</p> : null}
      {allowed && drafts.map((m) => <SmsDraft key={m.id} saverId={data.saver.id} sms={m} onChanged={onChanged} />)}
      {!allowed && drafts.length > 0 && <Notice tone="info">{drafts.length} message{drafts.length === 1 ? '' : 's'} waiting for an operator to review.</Notice>}
      {history.length > 0 && <div><h3 className="mb-1 text-xs font-semibold text-ink">Recent messages</h3><ul className="divide-y divide-line">
        {history.map((m) => <li key={m.id} className="py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-subtle" suppressHydrationWarning>{dateTime(m.createdAt)} · +{m.recipient}</span><Pill tone={smsStatus[m.status].tone}>{smsStatus[m.status].label}</Pill></div><p className="mt-1 line-clamp-2 text-xs text-muted">{m.message}</p></li>)}
      </ul></div>}
    </div>}
  </Card>;
}

/** Keep this calendar about one thing: payments on the current saving page. */
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
          const isToday = onPage && d === todayDay;
          return (
            <span
              key={d}
              title={!onPage ? 'Not part of this saving page' : filled ? 'Paid' : due ? 'Needs payment' : isToday ? 'Today — not paid yet' : 'Later'}
              className={cx(
                'relative flex h-10 items-center justify-center rounded-lg border text-xs font-semibold sm:h-12',
                !onPage && 'border-transparent bg-[#fafbf9] text-[#9aa79f]',
                filled && 'border-brand bg-brand text-white',
                due && 'border-amber/40 bg-amber-bg text-amber',
                onPage && !filled && !due && 'border-[#d8e1d5] bg-[#eef3ec] text-[#52675b]',
                isToday && 'ring-2 ring-ink ring-offset-1',
              )}
            >
              {d}
              {filled && <Check size={10} strokeWidth={3} aria-hidden className="absolute right-1 top-1" />}
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
  const [smsAutoSend, setSmsAutoSend] = useState(s.smsAutoSend);
  const [daily, setDaily] = useState(String((s.nextDailyMinor ?? s.dailyMinor) / 100));
  const [notes, setNotes] = useState(s.notes ?? '');
  const [status, setStatus] = useState(s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api<Data & { dailyChange: 'now' | 'next_page' | null }>(`/api/susu/${s.id}`, { method: 'PUT', json: { name, phone: phone || null, daily, notes: notes || null, status, smsEnabled: !!phone && smsEnabled, smsAutoSend: !!phone && smsEnabled && smsAutoSend } });
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
        <div className="space-y-3 rounded-xl border border-line p-3">
          <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" className="mt-1" checked={smsEnabled} disabled={!phone} onChange={e => { setSmsEnabled(e.target.checked); if (!e.target.checked) setSmsAutoSend(false); }} /><span><strong className="font-semibold text-ink">Send SMS receipts</strong><span className="mt-0.5 block text-xs text-subtle">Send savings receipts to this number.</span></span></label>
          <label className="ml-6 flex items-start gap-2 border-t border-line pt-3 text-sm text-muted"><input type="checkbox" className="mt-1" checked={smsAutoSend} disabled={!phone || !smsEnabled} onChange={e => setSmsAutoSend(e.target.checked)} /><span><strong className="font-semibold text-ink">Send automatically</strong><span className="mt-0.5 block text-xs text-subtle">Skip review and send each new message as soon as it is created.</span></span></label>
          <p className="ml-6 text-xs text-subtle">Confirm the number belongs to the saver. SMS must also be enabled in Settings.</p>
        </div>
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
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const m = closeMath(page);
  const otherPagesMinor = Math.max(0, s.heldMinor - page.broughtForwardMinor - m.savedMinor);
  const amountMinor = Math.round((Number(amount.replace(/[^\d.]/g, '')) || 0) * 100);
  const availableMinor = Math.max(0, m.balanceMinor - s.advanceOutstandingMinor);
  const validAmount = amountMinor > 0 && amountMinor <= availableMinor;
  const remainingMinor = validAmount ? availableMinor - amountMinor : availableMinor;
  const go = async () => {
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const d = await api<Data & { result: { paidOutMinor: number; carriedMinor: number } }>(`/api/susu/${s.id}`, { method: 'POST', json: { action: 'withdraw', amount, method, reference: reference || null, requestId: requestId.current } });
      toast(`Page closed for ${s.name.split(' ')[0]} · ${cedis(d.result.paidOutMinor)} paid · ${cedis(d.result.carriedMinor)} still saved${s.smsEnabled ? s.smsAutoSend ? ' · SMS queued automatically' : ' · SMS draft ready in Messages' : ''}`);
      onDone(d);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not close the page and record the payout.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Close this page and pay ${s.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!validAmount} onClick={go}>Close page & record {validAmount ? cedis(amountMinor) : ''} payout</Button></>}>
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5 rounded-xl bg-paper p-4">
          {page.broughtForwardMinor > 0 && <Row label="Saved from before" value={cedis(page.broughtForwardMinor)} />}
          <Row label={`Added on this page (${page.daysPaid} day${page.daysPaid === 1 ? '' : 's'})`} value={cedis(m.savedMinor)} />
          <Row label={`${desk} fee (1 day)`} value={`− ${cedis(m.feeMinor)}`} />
          {s.advanceOutstandingMinor > 0 && <Row label="Money already taken early" value={`− ${cedis(Math.min(s.advanceOutstandingMinor, m.balanceMinor))}`} />}
          <div className="border-t border-line pt-1.5"><Row label={<strong>Available now</strong>} value={<strong>{cedis(availableMinor)}</strong>} /></div>
          {otherPagesMinor > 0 && <Row label="Paid ahead on later pages" value={cedis(otherPagesMinor)} />}
        </div>
        <Field label="Amount to pay out (GH₵)" htmlFor="w-amount" hint="Enter any amount up to the amount available now.">
          <div className="flex gap-2"><Input id="w-amount" mono inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(m.balanceMinor / 100)} autoFocus /><Button type="button" variant="secondary" size="sm" onClick={() => setAmount(String(m.balanceMinor / 100))}>All</Button></div>
        </Field>
        {amountMinor > availableMinor && <Notice tone="risk">The most available after our fee and money already taken is {cedis(availableMinor)}.</Notice>}
        {validAmount && <div className="space-y-1.5 rounded-xl border border-line p-4"><Row label="Pay to saver" value={cedis(amountMinor)} /><Row label="Stays in savings" value={cedis(remainingMinor)} /></div>}
        <p className="text-xs text-muted">Pay the saver before recording this. We take one daily amount as our fee. Any money left stays saved without another fee. The remaining {page.capacity - page.daysPaid} day{page.capacity - page.daysPaid === 1 ? '' : 's'} continue on a fresh calendar.{otherPagesMinor > 0 ? ' Payments already made for later months do not change.' : ''}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payout method" htmlFor="w-method"><Select id="w-method" value={method} onChange={(e) => setMethod(e.target.value)}><option>Cash</option><option>MoMo</option><option>Bank</option></Select></Field>
          <Field label="Reference" htmlFor="w-ref" optional><Input id="w-ref" mono value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'Cash' ? 'e.g. receipt no.' : 'Transaction ID'} /></Field>
        </div>
      </div>
    </Dialog>
  );
}

function EarlyMoneyDialog({ s, page, onClose, onDone }: { s: SaverSummary; page: SaverSummary['page']; onClose: () => void; onDone: (d: Data) => void }) {
  const officer = useSession().userName;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const amountMinor = Math.round((Number(amount.replace(/[^\d.]/g, '')) || 0) * 100);
  const max = page?.availableIfClosedMinor ?? 0;
  const valid = amountMinor > 0 && amountMinor <= max;
  const go = async () => {
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const d = await api<Data & { result: { transactionRef: string } }>(`/api/susu/${s.id}`, { method: 'POST', json: { action: 'advance', amount, method, reference: reference || null, note: note || null, requestId: requestId.current } });
      toast(`${cedis(amountMinor)} taken early · ref ${d.result.transactionRef}. Paid calendar days did not change.`);
      onDone(d);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not record the money taken early.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Record money ${s.name} took early`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!valid} onClick={go}>Record money given</Button></>}>
      <div className="space-y-4 text-sm">
        <Notice tone="info" title="Daily saving continues as normal">
          The {page?.daysPaid ?? 0} paid calendar days do not change. Future daily payments still fill the next calendar days. This amount is simply removed from the final money available.
        </Notice>
        <Notice tone="warn" title="Give the money first, then record it">
          Complete the cash, MoMo or bank payment before saving this entry. Dinero-Yard assigns the next transaction reference and records <strong>{officer}</strong> as the desk officer.
        </Notice>
        <div className="space-y-1.5 rounded-xl bg-paper p-4">
          {page && <Row label="Saved on this page" value={cedis(page.broughtForwardMinor + page.savedMinor)} />}
          {page && <Row label="Our fee when the page ends" value={`− ${cedis(page.feeMinor)}`} />}
          <Row label="Already taken early" value={cedis(s.advanceOutstandingMinor)} />
          <div className="border-t border-line pt-1.5"><Row label={<strong>Can take now</strong>} value={<strong>{cedis(max)}</strong>} /></div>
        </div>
        <Field label="Amount taken early (GH₵)" htmlFor="a-amount"><div className="flex gap-2"><Input id="a-amount" mono inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /><Button type="button" variant="secondary" size="sm" onClick={() => setAmount(String(max / 100))}>All</Button></div></Field>
        {amountMinor > max && <Notice tone="risk">The maximum is {cedis(max)}.</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Money given through" htmlFor="a-method"><Select id="a-method" value={method} onChange={(e) => setMethod(e.target.value)}><option>Cash</option><option>MoMo</option><option>Bank</option></Select></Field>
          <Field label="MoMo / bank reference" htmlFor="a-ref" optional hint="Provider reference, separate from the Dinero-Yard reference."><Input id="a-ref" mono value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
        <Field label="Note" htmlFor="a-note" optional><Input id="a-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the saver took the money early" /></Field>
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
  const [takingEarly, setTakingEarly] = useState(false);
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
  const earlierWithdrawals = page ? closed.filter((p) => p.period === page.period && p.closeKind === 'WITHDRAWAL' && p.daysPaid > 0) : [];
  const earlierWithdrawalDays = earlierWithdrawals.reduce((total, item) => total + item.daysPaid, 0);
  const nextDay = page && page.daysPaid < page.capacity ? page.startDay + page.daysPaid : null;

  const collect = async () => {
    setBusy(true);
    try {
      collectionRequestId.current ??= crypto.randomUUID();
      const d = await api<Data & { result: { days: number; changeMinor: number } }>(`/api/susu/${id}`, { method: 'POST', json: { action: 'collect', amount, requestId: collectionRequestId.current } });
      setData(d);
      setAmount('');
      collectionRequestId.current = null;
      toast(`${d.result.days} day${d.result.days === 1 ? '' : 's'} recorded${d.result.changeMinor ? ` · give back ${cedis(d.result.changeMinor)}` : ''}${s.smsEnabled ? s.smsAutoSend ? ' · SMS queued automatically' : ' · SMS draft ready in Messages' : ''}`);
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
            <div><div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Total saved</div><div className="font-mono text-2xl font-bold tabular text-ink">{cedis(s.heldMinor)}</div></div>
            {s.advanceOutstandingMinor > 0 && <div><div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Already taken early</div><div className="font-mono text-2xl font-bold tabular text-risk">{cedis(s.advanceOutstandingMinor)}</div></div>}
            <div><div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Streak</div><div className="inline-flex items-center gap-1 font-mono text-2xl font-bold tabular text-amber"><Flame size={18} />{s.streak}</div></div>
          </div>
        </div>
        {allowed && (
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            {s.status === 'ACTIVE' && <>
              <Field label="Payment received" htmlFor="sv-amt">
                <Input id="sv-amt" mono inputMode="decimal" value={amount} onChange={(e) => { collectionRequestId.current = null; setAmount(e.target.value); }} onKeyDown={(e) => e.key === 'Enter' && split?.days && collect()} placeholder={`GH₵ ${daily / 100}`} className="w-40" />
              </Field>
              <Button busy={busy} disabled={!split?.days} onClick={collect}>Save payment</Button>
              {[1, 2, 7].map((n) => (
                <Button key={n} variant="secondary" size="sm" onClick={() => { collectionRequestId.current = null; setAmount(String((daily * n) / 100)); }}>{n === 1 ? '1 day' : `${n} days`}</Button>
              ))}
              {split && <span className={cx('text-xs', split.days ? 'text-muted' : 'text-risk')}>{split.days ? `${split.days} day${split.days === 1 ? '' : 's'}${split.changeMinor ? ` · change ${cedis(split.changeMinor)}` : ''}` : 'Less than one day'}</span>}
            </>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit</Button>
              {s.status === 'ACTIVE' && page && page.availableIfClosedMinor > 0 && <Button variant="secondary" size="sm" icon={<HandCoins size={14} />} onClick={() => setTakingEarly(true)}>Take money early</Button>}
              {canApprove(session) && page && page.availableIfClosedMinor > 0 && <Button variant="secondary" size="sm" onClick={() => setWithdrawing(true)}>Close page & pay out</Button>}
            </div>
          </div>
        )}
      </Card>

      {page && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-ink">{periodLabel(page.period)} savings</h2>
                <p className="mt-0.5 text-xs text-subtle">Current saving period · page {page.pageNo}</p>
              </div>
              <Pill tone={page.daysPaid === page.capacity ? 'good' : 'neutral'}>{page.daysPaid} of {page.capacity} days paid</Pill>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-paper p-3"><span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-subtle">Saved now</span><strong className="mt-1 block font-mono text-lg text-ink">{cedis(page.broughtForwardMinor + page.savedMinor)}</strong></div>
              <div className="rounded-xl bg-paper p-3"><span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-subtle">Paid on this page</span><strong className="mt-1 block text-lg text-ink">{page.daysPaid} day{page.daysPaid === 1 ? '' : 's'}</strong></div>
              <div className="rounded-xl bg-paper p-3"><span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-subtle">Next payment</span><strong className="mt-1 block text-lg text-ink">{nextDay ? `Day ${nextDay}` : 'Page complete'}</strong></div>
            </div>
            {page.broughtForwardMinor > 0 && <Notice tone="good" className="mb-3"><strong>{cedis(page.broughtForwardMinor)} was already saved before this page.</strong> It stays as money, but it does not fill new calendar days.</Notice>}
            {earlierWithdrawalDays > 0 && <Notice tone="info" className="mb-4"><strong>Earlier this month:</strong> {earlierWithdrawalDays} paid day{earlierWithdrawalDays === 1 ? '' : 's'} ended when money was taken out. The exact payout is under Past payouts below.</Notice>}
            <Booklet page={page} today={data.today} />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[0.6875rem] font-medium text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded bg-brand" /> Paid</span>
              {page.startDay < Number(data.today.slice(8, 10)) && page.daysPaid < page.capacity && <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-amber/40 bg-amber-bg" /> Needs payment</span>}
              {data.today.startsWith(page.period) && Number(data.today.slice(8, 10)) >= page.startDay && Number(data.today.slice(8, 10)) <= page.startDay + page.capacity - 1 && <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-[#819087] bg-[#eef3ec] ring-2 ring-ink" /> Today</span>}
              <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-[#d8e1d5] bg-[#eef3ec]" /> Later</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">This calendar shows only this current saving period. Past withdrawals stay in the payout history instead of appearing as missed days.</p>
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="text-sm font-bold text-ink">Your money today</h2>
            <div className="mb-4 rounded-xl bg-brand p-4 text-white">
              <span className="block text-xs font-medium text-white/80">Available now</span>
              <strong className="mt-1 block font-mono text-3xl tabular">{cedis(page.availableIfClosedMinor)}</strong>
              <span className="mt-1 block text-xs text-white/80">after our fee{s.advanceOutstandingMinor > 0 ? ' and money already taken' : ''}</span>
            </div>
            {page.broughtForwardMinor > 0 && <Row label="Saved from before" value={cedis(page.broughtForwardMinor)} />}
            <Row label={`Added here (${page.daysPaid} day${page.daysPaid === 1 ? '' : 's'})`} value={cedis(page.savedMinor)} />
            <Row label="Our fee when this page ends" value={`− ${cedis(page.feeMinor)}`} />
            {s.advanceOutstandingMinor > 0 && <Row label="Money already taken early" value={`− ${cedis(Math.min(s.advanceOutstandingMinor, page.balanceIfClosedMinor))}`} />}
            {future.length > 0 && <Notice tone="good" className="!mt-4">Paid ahead: {future.map((p) => `${p.daysPaid} day${p.daysPaid === 1 ? '' : 's'} in ${periodLabel(p.period)}`).join(', ')}.</Notice>}
            <p className="pt-2 text-xs leading-5 text-subtle">At month end, pay this amount out or keep it saved for next month. Money kept is not charged another fee.</p>
          </Card>
        </div>
      )}

      <SaverSms data={data} allowed={allowed} onChanged={setData} />

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-bold text-ink">Money taken early</h2>
        <p className="mb-3 text-xs text-muted">Taking money early does not change paid calendar days. Daily saving continues normally, and money already taken is removed from the final amount available.</p>
        {!data.advances.length ? <p className="text-sm text-subtle">No money taken early.</p> : (
          <ul className="divide-y divide-line text-sm">
            {data.advances.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block font-semibold text-ink">{a.kind === 'ADVANCE' ? 'Money taken early' : a.kind === 'REPAYMENT' ? 'Money returned separately (old record)' : 'Taken early amount removed at page close'} · <span className="font-mono">{a.transactionRef}</span></span><span className="block truncate text-xs text-subtle" suppressHydrationWarning>{dateTime(a.at)}{a.method ? ` · ${a.method}` : ''}{a.reference ? ` · payment ref ${a.reference}` : ''}{a.by ? ` · recorded by ${a.by}` : ''}</span></span>
                <Pill tone={a.kind === 'ADVANCE' ? 'waiting' : 'good'}>{a.kind === 'ADVANCE' ? '− ' : '+ '}{cedis(a.amountMinor)}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Daily payments</h2>
          {!data.payments.length ? <p className="text-sm text-subtle">Nothing collected yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{cedis(p.receivedMinor)} <span className="font-normal text-muted">= {p.days} day{p.days === 1 ? '' : 's'}</span></span>
                    <span className="block truncate text-xs text-subtle" suppressHydrationWarning>{dateTime(p.at)}{p.by ? ` · recorded by ${p.by}` : ''}{p.periods.length > 1 ? ` · spread over ${p.periods.map(periodLabel).join(' and ')}` : ''}</span>
                  </span>
                  {p.changeMinor > 0 && <Pill tone="waiting">change {cedis(p.changeMinor)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Past payouts</h2>
          {!closed.length ? <p className="text-sm text-subtle">No payouts yet. The first is due at the end of {page ? periodLabel(page.period) : 'the month'}.</p> : (
            <ul className="divide-y divide-line text-sm">
              {closed.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{periodLabel(p.period)} <span className="font-normal text-muted">· {p.daysPaid ? `${p.daysPaid} paid day${p.daysPaid === 1 ? '' : 's'}` : 'no new payments'} · {(p.feeMinor ?? 0) > 0 ? `our fee ${cedis(p.feeMinor ?? 0)}` : 'no extra fee'}</span></span>
                    <span className="block text-xs text-subtle" suppressHydrationWarning>{p.closedAt ? dateTime(p.closedAt) : ''}{p.payoutReference ? ` · ref ${p.payoutReference}` : ''}</span>
                  </span>
                  <Pill tone={p.closeKind === 'ROLLOVER' ? 'neutral' : 'good'}>
                    {p.closeKind === 'ROLLOVER' ? `Kept saved ${cedis(p.carriedMinor ?? 0)}` : p.closeKind === 'WITHDRAWAL' ? `Paid ${cedis(p.paidOutMinor ?? 0)}${p.carriedMinor ? ` · kept ${cedis(p.carriedMinor)}` : ''}` : `Paid out ${cedis(p.paidOutMinor ?? 0)}`}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {editing && <EditSaver s={s} onClose={() => setEditing(false)} onSaved={(d) => { setData(d); setEditing(false); toast(d.dailyChange === 'next_page' ? 'Saved. The new daily amount starts when the next new page opens.' : 'Saved'); }} />}
      {withdrawing && page && <Withdraw s={s} page={page} onClose={() => setWithdrawing(false)} onDone={setData} />}
      {takingEarly && <EarlyMoneyDialog s={s} page={page} onClose={() => setTakingEarly(false)} onDone={setData} />}
    </div>
  );
}
