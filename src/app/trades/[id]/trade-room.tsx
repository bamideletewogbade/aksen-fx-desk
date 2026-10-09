'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  FileText,
  Hash,
  Info,
  Link2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  MessageSquare,
} from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import { CORRIDORS, formatMinor, minorToMajorString, type Currency } from '@/lib/money';
import { describeEvent, RELATIONSHIP_LABEL, STATUS_META, type Beneficiary, type Signal, type TradeDetail } from '@/lib/trades';
import { canApprove, canTrade } from '@/lib/auth';
import { clock, dateTime, timeAgo } from '@/lib/time';
import { Button, Card, CopyButton, Countdown, cx, Dialog, Field, Input, Notice, Pill, Select, Skeleton, StatusBadge, Textarea, toast } from '@/components/ui';
import { ShareLink } from '@/components/share-link';
import { BeneficiaryFields, beneficiaryComplete, emptyBeneficiary } from '@/components/beneficiary-fields';
import { useSession } from '@/components/app-shell';
import type { Rail } from '@/server/desk';

type Act = (action: string, payload?: Record<string, unknown>, okMessage?: string) => Promise<boolean>;

const STEPS = [
  { key: 'quoted', label: 'Quoted' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'funds', label: 'Funds in' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid out' },
] as const;

function Progress({ t }: { t: TradeDetail }) {
  const at: (string | null)[] = [t.createdAt, t.acceptedAt, t.fundsConfirmedAt, t.approvedAt, t.paidOutAt];
  const reached = at.filter(Boolean).length;
  const broken = ['CANCELLED', 'EXPIRED', 'REFUND_DUE', 'REFUNDED'].includes(t.status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Trade progress">
      {STEPS.map((s, i) => {
        const done = Boolean(at[i]);
        const current = !broken && i === reached && t.status !== 'COMPLETED';
        return (
          <li key={s.key} className="min-w-0">
            <div className={cx('h-1.5 rounded-full', done ? 'bg-brand' : current ? (t.status === 'ON_HOLD' ? 'bg-risk' : 'bg-lime') : 'bg-[#e3ebe1]')} />
            <div className={cx('mt-1.5 truncate text-[0.6875rem] font-semibold', done ? 'text-ink' : current ? 'text-brand' : 'text-subtle')}>{s.label}</div>
            <div className="truncate font-mono text-[0.625rem] text-subtle" suppressHydrationWarning>{at[i] ? clock(at[i]!) : current ? (t.status === 'ON_HOLD' ? 'paused before this step' : 'next') : ''}</div>
          </li>
        );
      })}
    </ol>
  );
}

function SignalList({ signals, ack, setAck, interactive }: { signals: Signal[]; ack?: Set<string>; setAck?: (s: Set<string>) => void; interactive?: boolean }) {
  if (!signals.length) {
    return <div className="flex items-center gap-2 text-sm text-brand"><ShieldCheck size={16} /> No checks raised for this trade.</div>;
  }
  const order = { critical: 0, warn: 1, info: 2 };
  return (
    <ul className="space-y-2">
      {[...signals].sort((a, b) => order[a.level] - order[b.level]).map((s) => {
        const Icon = s.level === 'critical' ? AlertOctagon : s.level === 'warn' ? AlertTriangle : Info;
        const needsAck = interactive && s.level !== 'info';
        const checked = ack?.has(s.code) ?? false;
        return (
          <li key={s.code} className={cx('rounded-xl border p-3', s.level === 'critical' ? 'border-[#f3c7c2] bg-risk-bg' : s.level === 'warn' ? 'border-[#f1d4a6] bg-amber-bg' : 'border-line bg-paper')}>
            <label className={cx('flex gap-2.5', needsAck && 'cursor-pointer')}>
              {needsAck ? (
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#175b3b]"
                  checked={checked}
                  onChange={(e) => {
                    const n = new Set(ack);
                    if (e.target.checked) n.add(s.code);
                    else n.delete(s.code);
                    setAck?.(n);
                  }}
                />
              ) : (
                <Icon size={16} className={cx('mt-0.5 flex-shrink-0', s.level === 'critical' ? 'text-risk' : s.level === 'warn' ? 'text-amber' : 'text-info')} />
              )}
              <span>
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
                <span className="block text-xs text-muted">{s.detail}</span>
                {needsAck && <span className="mt-1 block text-[0.6875rem] font-semibold text-muted">Tick to confirm you checked this.</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function BeneficiaryCard({ b, currency, amountMinor, copyable }: { b: Beneficiary; currency: Currency; amountMinor: number; copyable?: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">{b.kind === 'MOMO' ? 'Mobile money' : 'Bank account'} · {b.provider}</span>
        <Pill>{RELATIONSHIP_LABEL[b.relationship]}</Pill>
      </div>
      <Line label="Name" value={b.accountName} copy={copyable} />
      <Line label="Number" value={b.accountNumber} mono copy={copyable} />
      <Line label="Amount" value={formatMinor(amountMinor, currency)} mono copy={copyable ? minorToMajorString(amountMinor) : undefined} />
    </div>
  );
}

function Line({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean | string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-subtle">{label}</span>
      <span className="flex items-center gap-2">
        <span className={cx('text-sm font-semibold text-ink', mono && 'font-mono tabular')}>{value}</span>
        {copy && <CopyButton text={typeof copy === 'string' ? copy : value} label="Copy" copiedLabel="✓" className="!px-2 !py-1" />}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- next-step panels

function RecordFunds({ t, rails, act }: { t: TradeDetail; rails: Rail[]; act: Act }) {
  const options = rails.filter((r) => r.currency === t.payCurrency && r.canCollect && r.status !== 'ARCHIVED');
  const outstanding = Math.max(0, t.payMinor - t.fundsReceivedMinor);
  const [railId, setRailId] = useState(t.collectionRail?.id ?? options[0]?.id ?? '');
  const [amount, setAmount] = useState(minorToMajorString(outstanding || t.payMinor));
  const [ref, setRef] = useState('');
  const [payer, setPayer] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await act('record_funds', { railId, amount, bankReference: ref, payerName: payer || null }, 'Credit recorded');
        setBusy(false);
        if (ok) { setRef(''); setPayer(''); }
      }}
    >
      <Notice tone="info">Open your {t.payCurrency === 'NGN' ? 'bank app or statement' : 'MoMo merchant statement'} and find this credit. Record only what you can see there, not what the customer says.</Notice>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Received into" htmlFor="rf-rail">
          <Select id="rf-rail" value={railId} onChange={(e) => setRailId(e.target.value)} required>
            {options.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.accountNumber}</option>)}
          </Select>
        </Field>
        <Field label={`Amount credited (${t.payCurrency})`} htmlFor="rf-amt" hint={outstanding ? `Outstanding: ${formatMinor(outstanding, t.payCurrency)}` : undefined}>
          <Input id="rf-amt" mono inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Statement reference" htmlFor="rf-ref" hint="Session ID / transaction ID on the statement. Each can only be used once.">
          <Input id="rf-ref" mono value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 000013241004…" required minLength={4} />
        </Field>
        <Field label="Sender name on statement" htmlFor="rf-payer" optional hint="Compared with the customer’s name.">
          <Input id="rf-payer" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder={t.customer.name} />
        </Field>
      </div>
      <Button type="submit" busy={busy} disabled={!railId || !ref}>Record credit</Button>
    </form>
  );
}

function Approve({ t, act }: { t: TradeDetail; act: Act }) {
  const session = useSession();
  const [ack, setAck] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const must = t.signals.filter((s) => s.level !== 'info').map((s) => s.code);
  const allAck = must.every((c) => ack.has(c));
  const sameApprover = t.needsSecondPerson && t.fundsConfirmedBy === session.userName;
  if (!canApprove(session)) {
    return <Notice tone="info" title="Waiting for an admin to approve">Funds are confirmed. A desk admin reviews the checks below and approves the payout.</Notice>;
  }
  return (
    <div className="space-y-4">
      <SignalList signals={t.signals} ack={ack} setAck={setAck} interactive />
      {t.beneficiary && <BeneficiaryCard b={t.beneficiary} currency={t.receiveCurrency} amountMinor={t.receiveMinor} />}
      {sameApprover && <Notice tone="warn" title="Second person needed">This payout is above your desk’s two-person limit and you confirmed the funds. Another admin must approve it.</Notice>}
      <Button
        busy={busy}
        disabled={!allAck || sameApprover}
        icon={<BadgeCheck size={16} />}
        onClick={async () => {
          setBusy(true);
          await act('approve', { acknowledged: [...ack] }, 'Payout approved');
          setBusy(false);
        }}
      >
        Approve payout of {formatMinor(t.receiveMinor, t.receiveCurrency)}
      </Button>
      {!allAck && <p className="text-xs text-subtle">Tick every warning above to enable approval. Your ticks are recorded on the audit trail.</p>}
    </div>
  );
}

function RecordPayout({ t, rails, act }: { t: TradeDetail; rails: Rail[]; act: Act }) {
  const options = rails.filter((r) => r.currency === t.receiveCurrency && r.canPay && r.status === 'ACTIVE');
  const [railId, setRailId] = useState(options[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      {t.beneficiary && <BeneficiaryCard b={t.beneficiary} currency={t.receiveCurrency} amountMinor={t.receiveMinor} copyable />}
      <p className="text-sm text-muted">Send exactly this amount from your {t.receiveCurrency === 'GHS' ? 'MoMo or bank' : 'bank'} app. Check the name the network shows matches before you confirm. Then record the reference here.</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await act('record_payout', { railId, reference: ref }, 'Payout recorded. Trade completed.');
          setBusy(false);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Paid from" htmlFor="po-rail">
            <Select id="po-rail" value={railId} onChange={(e) => setRailId(e.target.value)} required>
              {options.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.provider} {r.accountNumber.slice(-4)}</option>)}
            </Select>
          </Field>
          <Field label="Payout transaction reference" htmlFor="po-ref">
            <Input id="po-ref" mono value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. MTN 4471209931" required minLength={4} />
          </Field>
        </div>
        {!options.length && <Notice tone="warn">Add an active {t.receiveCurrency} payout account on the Accounts page.</Notice>}
        <Button type="submit" busy={busy} disabled={!railId || !ref}>I have sent it, record payout</Button>
      </form>
    </div>
  );
}

function RecordRefund({ t, rails, act, excessOnly }: { t: TradeDetail; rails: Rail[]; act: Act; excessOnly?: boolean }) {
  const options = rails.filter((r) => r.currency === t.payCurrency && r.canPay && r.status === 'ACTIVE');
  const owed = excessOnly ? t.fundsReceivedMinor - t.payMinor - t.refundedMinor : t.fundsReceivedMinor - t.refundedMinor;
  const [railId, setRailId] = useState(t.collectionRail?.id && options.some((o) => o.id === t.collectionRail!.id) ? t.collectionRail.id : options[0]?.id ?? '');
  const [amount, setAmount] = useState(minorToMajorString(Math.max(owed, 0)));
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  if (owed <= 0) return null;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await act('record_refund', { railId, amount, reference: ref }, 'Refund recorded');
        setBusy(false);
      }}
    >
      <p className="text-sm text-muted">Return {formatMinor(owed, t.payCurrency)} to the account it came from, then record the reference.</p>
      {t.receipts.length > 0 && <p className="text-xs text-subtle">Paid by: {t.receipts.map((r) => r.payerName || 'unknown sender').join(', ')}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Refunded from" htmlFor="rr-rail">
          <Select id="rr-rail" value={railId} onChange={(e) => setRailId(e.target.value)}>
            {options.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label={`Amount (${t.payCurrency})`} htmlFor="rr-amt"><Input id="rr-amt" mono value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Refund reference" htmlFor="rr-ref"><Input id="rr-ref" mono value={ref} onChange={(e) => setRef(e.target.value)} required minLength={4} /></Field>
      </div>
      <Button type="submit" variant="secondary" busy={busy} disabled={!railId || !ref} icon={<RotateCcw size={15} />}>Record refund</Button>
    </form>
  );
}

function AcceptForCustomer({ t, act }: { t: TradeDetail; act: Act }) {
  const [open, setOpen] = useState(false);
  const [ben, setBen] = useState<Beneficiary>(t.beneficiary ?? emptyBeneficiary(t.receiveCurrency));
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Customer accepted by phone</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Accept on the customer’s behalf"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button busy={busy} disabled={!beneficiaryComplete(ben)} onClick={async () => { setBusy(true); const ok = await act('accept', { beneficiary: ben }, 'Accepted. Payment details are now on the customer link.'); setBusy(false); if (ok) setOpen(false); }}>Accept quote</Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-muted">Use this only when the customer clearly agreed to this rate. It is recorded under your name.</p>
        <BeneficiaryFields value={ben} onChange={setBen} currency={t.receiveCurrency} idPrefix="acc" />
      </Dialog>
    </>
  );
}

function NextStep({ t, rails, act }: { t: TradeDetail; rails: Rail[]; act: Act }) {
  const session = useSession();
  const trade = canTrade(session);
  const approver = canApprove(session);
  const [busy, setBusy] = useState(false);
  const run = async (action: string, payload?: Record<string, unknown>, msg?: string) => { setBusy(true); await act(action, payload, msg); setBusy(false); };

  let title: ReactNode = STATUS_META[t.status].hint;
  let body: ReactNode = null;
  switch (t.status) {
    case 'QUOTED':
      title = <span className="flex items-center justify-between gap-3">Waiting for the customer to accept <Countdown to={t.quoteExpiresAt} label="expires in" /></span>;
      body = (
        <div className="space-y-4">
          <ShareLink path={t.portalPath} deskName={session.orgName} customerName={t.customer.name} phone={t.customer.phone} payMinor={t.payMinor} payCurrency={t.payCurrency} receiveMinor={t.receiveMinor} receiveCurrency={t.receiveCurrency} rate={t.rate} expiresAt={t.quoteExpiresAt} />
          {trade && <div className="flex flex-wrap gap-2 border-t border-line pt-4"><AcceptForCustomer t={t} act={act} /></div>}
        </div>
      );
      break;
    case 'EXPIRED':
      title = t.closedReason ?? 'Expired';
      body = trade ? (
        <div className="flex flex-wrap gap-2">
          <Button busy={busy} icon={<RefreshCw size={15} />} onClick={() => run('requote', {}, 'Quote refreshed at today’s board rate. The same link still works.')}>Refresh quote at current rate</Button>
        </div>
      ) : null;
      break;
    case 'AWAITING_FUNDS':
      title = (
        <span className="flex flex-wrap items-center justify-between gap-3">
          Waiting for {formatMinor(t.payMinor - t.fundsReceivedMinor, t.payCurrency)}
          {t.fundsDueAt && <Countdown to={t.fundsDueAt} label="window closes in" />}
        </span>
      );
      body = (
        <div className="space-y-5">
          {t.collectionRail && (
            <div className="rounded-xl border border-line bg-paper p-4 text-sm">
              <div className="text-xs font-semibold text-muted">Customer was told to pay into</div>
              <div className="mt-1 font-semibold text-ink">{t.collectionRail.provider} · <span className="font-mono">{t.collectionRail.accountNumber}</span> · {t.collectionRail.accountName}</div>
              <div className="mt-0.5 text-xs text-subtle">With reference <span className="font-mono font-semibold text-ink">{t.ref}</span></div>
            </div>
          )}
          {t.evidence.some((e) => e.submittedBy === 'CUSTOMER') && <Notice tone="info" title="The customer sent proof of payment">See it under Payment proof. Proof can be edited or reused; confirm the credit on your statement.</Notice>}
          {trade && <RecordFunds t={t} rails={rails} act={act} />}
        </div>
      );
      break;
    case 'FUNDS_CONFIRMED':
      title = 'Funds confirmed. Review the checks and approve the payout.';
      body = <Approve t={t} act={act} />;
      break;
    case 'APPROVED':
      title = `Approved by ${t.approvedBy ?? 'an admin'}. Send the payout.`;
      body = trade ? <RecordPayout t={t} rails={rails} act={act} /> : null;
      break;
    case 'ON_HOLD':
      title = 'On hold';
      body = (
        <div className="space-y-4">
          <Notice tone="risk" title="Reason">{t.holdReason}</Notice>
          <div className="flex flex-wrap gap-2">
            {approver && <Button busy={busy} icon={<Play size={15} />} onClick={() => run('release', {}, 'Hold released')}>Release hold</Button>}
            {!approver && <p className="text-sm text-muted">An admin can release the hold or mark the trade for refund.</p>}
          </div>
        </div>
      );
      break;
    case 'REFUND_DUE':
      title = `Refund due: ${t.closedReason ?? ''}`;
      body = trade ? <RecordRefund t={t} rails={rails} act={act} /> : null;
      break;
    case 'COMPLETED':
      title = `Completed ${t.completedAt ? dateTime(t.completedAt) : ''}`;
      body = (
        <div className="space-y-4">
          <p className="text-sm text-muted">The customer’s link now shows a receipt with the payout reference and a verification code from the audit trail.</p>
          <a href={t.portalPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><FileText size={15} /> Open customer receipt</a>
          {t.fundsReceivedMinor - t.payMinor - t.refundedMinor > 0 && trade && (
            <div className="border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Customer overpaid. Refund the excess.</h3>
              <RecordRefund t={t} rails={rails} act={act} excessOnly />
            </div>
          )}
        </div>
      );
      break;
    default:
      title = t.closedReason ?? STATUS_META[t.status].hint;
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line bg-[#f9fbf8] px-5 py-3.5">
        <div className="text-[0.6875rem] font-mono font-semibold uppercase tracking-wider text-subtle">Next step</div>
        <div className="mt-0.5 text-sm font-semibold text-ink">{title}</div>
      </div>
      {body && <div className="p-5">{body}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------- secondary actions

function MoreActions({ t, act }: { t: TradeDetail; act: Act }) {
  const session = useSession();
  const [dialog, setDialog] = useState<null | 'hold' | 'cancel' | 'refund' | 'beneficiary' | 'link'>(null);
  const [reason, setReason] = useState('');
  const [ben, setBen] = useState<Beneficiary>(t.beneficiary ?? emptyBeneficiary(t.receiveCurrency));
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const trade = canTrade(session);
  const approver = canApprove(session);
  const items = [
    trade && ['AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'APPROVED'].includes(t.status) && { key: 'hold', label: 'Put on hold', icon: Pause },
    trade && ['QUOTED', 'AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'ON_HOLD'].includes(t.status) && { key: 'beneficiary', label: 'Change payout details', icon: ArrowRight },
    approver && t.fundsReceivedMinor - t.refundedMinor > 0 && ['AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'APPROVED', 'ON_HOLD'].includes(t.status) && { key: 'refund', label: 'Refund instead of paying out', icon: RotateCcw },
    trade && t.fundsReceivedMinor === 0 && ['QUOTED', 'AWAITING_FUNDS', 'ON_HOLD', 'EXPIRED'].includes(t.status) && { key: 'cancel', label: 'Cancel trade', icon: Ban },
    trade && !['CANCELLED', 'REFUNDED'].includes(t.status) && { key: 'link', label: 'Reissue customer link', icon: Link2 },
  ].filter(Boolean) as { key: typeof dialog; label: string; icon: typeof Pause }[];
  if (!items.length) return null;

  const close = () => { setDialog(null); setReason(''); };
  const submit = async (action: string, payload: Record<string, unknown>, msg: string) => {
    setBusy(true);
    const ok = await act(action, payload, msg);
    setBusy(false);
    if (ok) close();
  };

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" icon={<MoreHorizontal size={15} />} onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu">More</Button>
      {menu && (
        <ul role="menu" className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
          {items.map((it) => (
            <li key={it.key}>
              <button role="menuitem" type="button" onClick={() => { setMenu(false); setDialog(it.key); }} className={cx('flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-[#eef4ec] cursor-pointer', it.key === 'cancel' || it.key === 'refund' ? 'text-risk' : 'text-ink')}>
                <it.icon size={15} /> {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={dialog === 'hold'} onClose={close} title="Put trade on hold" footer={<><Button variant="ghost" onClick={close}>Back</Button><Button busy={busy} disabled={reason.trim().length < 5} onClick={() => submit('hold', { reason }, 'Trade on hold')}>Hold trade</Button></>}>
        <Field label="Why?" hint="Your team sees this. The customer sees “Under review”." htmlFor="hold-r"><Textarea id="hold-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sender name differs, calling customer" /></Field>
      </Dialog>
      <Dialog open={dialog === 'cancel'} onClose={close} title="Cancel trade" footer={<><Button variant="ghost" onClick={close}>Back</Button><Button variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => submit('cancel', { reason }, 'Trade cancelled')}>Cancel trade</Button></>}>
        <Field label="Reason" htmlFor="cancel-r"><Textarea id="cancel-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed their mind" /></Field>
      </Dialog>
      <Dialog open={dialog === 'refund'} onClose={close} title="Refund instead of paying out" footer={<><Button variant="ghost" onClick={close}>Back</Button><Button variant="danger" busy={busy} disabled={reason.trim().length < 5} onClick={() => submit('refund_due', { reason }, 'Marked for refund')}>Mark for refund</Button></>}>
        <p className="mb-3 text-sm text-muted">{formatMinor(t.fundsReceivedMinor - t.refundedMinor, t.payCurrency)} will be due back to the payer. You record the refund once you have sent it.</p>
        <Field label="Reason" htmlFor="refund-r"><Textarea id="refund-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Payer could not be verified" /></Field>
      </Dialog>
      <Dialog open={dialog === 'beneficiary'} onClose={close} title="Payout details" footer={<><Button variant="ghost" onClick={close}>Back</Button><Button busy={busy} disabled={!beneficiaryComplete(ben)} onClick={() => submit('beneficiary', { beneficiary: ben }, 'Payout details updated')}>Save</Button></>}>
        <BeneficiaryFields value={ben} onChange={setBen} currency={t.receiveCurrency} idPrefix="edit-ben" />
      </Dialog>
      <Dialog open={dialog === 'link'} onClose={close} title="Reissue customer link" footer={<><Button variant="ghost" onClick={close}>Back</Button><Button busy={busy} onClick={() => submit('reissue_link', {}, 'New link created. The old link no longer works.')}>Create new link</Button></>}>
        <p className="text-sm text-muted">The current link stops working immediately. Use this if the link was sent to the wrong person.</p>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- evidence

function Evidence({ t, onChanged }: { t: TradeDetail; onChanged: (t: TradeDetail) => void }) {
  const session = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <Card className="p-5">
      <h2 className="text-sm font-bold text-ink">Payment proof</h2>
      <p className="mt-0.5 text-xs text-muted">Screenshots and notes help you find the credit. They never confirm it.</p>
      <ul className="mt-4 space-y-3">
        {t.evidence.map((e) => {
          const url = `/api/trades/${t.id}/evidence/${e.id}`;
          const isImg = e.mime?.startsWith('image/');
          return (
            <li key={e.id} className="flex gap-3 rounded-xl border border-line p-3">
              {isImg ? (
                <button type="button" onClick={() => setPreview(url)} className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-line bg-paper cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Proof from ${e.submittedBy.toLowerCase()}`} className="h-full w-full object-cover" />
                </button>
              ) : e.mime ? (
                <a href={url} target="_blank" rel="noreferrer" className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-brand"><FileText size={20} /></a>
              ) : null}
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-ink">{e.submittedBy === 'CUSTOMER' ? t.customer.name : 'Desk'} <span className="font-normal text-subtle">· {timeAgo(e.at)}</span></div>
                {e.note && <div className="text-muted">“{e.note}”</div>}
                {e.fileName && <div className="truncate text-xs text-subtle">{e.fileName}{e.sizeBytes ? ` · ${Math.ceil(e.sizeBytes / 1024)} KB` : ''}</div>}
                {e.sha256 && <div className="font-mono text-[0.625rem] text-subtle" title="File fingerprint. Used to spot the same proof on two trades.">#{e.sha256.slice(0, 12)}</div>}
              </div>
            </li>
          );
        })}
        {!t.evidence.length && <li className="text-sm text-subtle">Nothing yet. The customer can upload proof from their link.</li>}
      </ul>
      {canTrade(session) && !['QUOTED', 'CANCELLED', 'REFUNDED'].includes(t.status) && (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const fd = new FormData();
              if (file) fd.append('file', file);
              if (note) fd.append('note', note);
              const d = await api<{ trade: TradeDetail }>(`/api/trades/${t.id}/evidence`, { method: 'POST', body: fd });
              onChanged(d.trade);
              setFile(null);
              setNote('');
              toast('Attached');
            } catch (err) {
              toast((err as Error).message, 'risk');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#c9d6c6] px-3 py-2.5 text-sm text-muted hover:bg-paper">
              <Upload size={15} /> <span className="truncate">{file ? file.name : 'Attach statement screenshot or PDF'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Evidence note" className="sm:max-w-[13.75rem]" />
            <Button type="submit" variant="secondary" busy={busy} disabled={!file && !note}>Attach</Button>
          </div>
        </form>
      )}
      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} title="Payment proof" wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Payment proof" className="mx-auto max-h-[70vh] rounded-lg" />}
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------- timeline

function Timeline({ t, act }: { t: TradeDetail; act: Act }) {
  const session = useSession();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Audit trail</h2>
        <span className="inline-flex items-center gap-1 text-[0.6875rem] text-subtle" title="Each entry is chained to the one before it. Editing history breaks the chain."><Hash size={12} /> tamper-evident</span>
      </div>
      <ol className="mt-4 space-y-0">
        {[...t.events].reverse().map((e, i, arr) => (
          <li key={e.seq} className="relative flex gap-3 pb-4">
            {i < arr.length - 1 && <span className="absolute left-[0.4375rem] top-4 h-full w-px bg-line" aria-hidden />}
            <span className={cx('relative mt-1 h-[0.9375rem] w-[0.9375rem] flex-shrink-0 rounded-full border-2', e.actorType === 'CUSTOMER' ? 'border-info bg-info-bg' : e.actorType === 'SYSTEM' ? 'border-subtle bg-white' : 'border-brand bg-lime-soft')} />
            <div className="min-w-0 text-sm">
              <div className="text-ink">{describeEvent(e)}</div>
              <div className="text-xs text-subtle">
                {e.actorLabel}{e.actorType === 'CUSTOMER' ? ' (customer)' : ''} · <span suppressHydrationWarning>{dateTime(e.at)}</span> · <span className="font-mono" title={e.hash}>#{e.hash.slice(0, 8)}</span>
              </div>
              {e.action === 'trade.approved' && Array.isArray(e.data.acknowledged) && (e.data.acknowledged as string[]).length > 0 && (
                <div className="mt-1 text-xs text-muted">Checked: {(e.data.acknowledged as string[]).join(', ').toLowerCase().replace(/_/g, ' ')}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {canTrade(session) && (
        <form
          className="flex gap-2 border-t border-line pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await act('note', { note }, 'Note added');
            setBusy(false);
            if (ok) setNote('');
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team" aria-label="Add a note" />
          <Button type="submit" variant="secondary" busy={busy} disabled={!note.trim()}>Add</Button>
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- page

export function TradeRoom({ id }: { id: string }) {
  const { data, setData, error, reload } = useLoad<{ trade: TradeDetail }>(`/api/trades/${id}`, { pollMs: 20_000 });
  const rails = useLoad<{ rails: Rail[] }>('/api/rails');
  const [stale, setStale] = useState(false);
  const t = data?.trade;

  const act: Act = async (action, payload = {}, okMessage) => {
    if (!t) return false;
    try {
      const d = await api<{ trade: TradeDetail }>(`/api/trades/${id}`, { method: 'POST', json: { action, version: t.version, ...payload } });
      setData({ trade: d.trade });
      setStale(false);
      if (['record_funds', 'record_payout', 'record_refund'].includes(action)) rails.reload();
      if (okMessage) toast(okMessage);
      return true;
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'STALE') {
        setStale(true);
        reload();
      }
      toast(err.message, 'risk');
      return false;
    }
  };

  const summary = useMemo(() => {
    if (!t) return null;
    return [
      { label: 'Rate', value: `1 GHS = ₦${t.rate}` },
      t.feeMinor > 0 && { label: 'Fee', value: formatMinor(t.feeMinor, t.payCurrency) },
      { label: 'Received', value: formatMinor(t.fundsReceivedMinor, t.payCurrency) },
      t.refundedMinor > 0 && { label: 'Refunded', value: formatMinor(t.refundedMinor, t.payCurrency) },
    ].filter(Boolean) as { label: string; value: string }[];
  }, [t]);

  useEffect(() => {
    if (t) document.title = `${t.ref} · ${t.customer.name} · Aksen OTC`;
  }, [t]);

  if (error && !t) return <Notice tone="risk" title="Could not open this trade">{error.message}</Notice>;
  if (!t) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/desk" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Desk</Link>
        <MoreActions t={t} act={act} />
      </div>

      {stale && <Notice tone="warn" title="This trade changed while you had it open">We loaded the latest version. Check it before trying again.</Notice>}

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold text-ink">{t.ref}</h1>
              <StatusBadge status={t.status} />
              <Pill>{CORRIDORS[t.corridor].label}</Pill>
            </div>
            <div className="mt-1 text-sm text-muted">
              <Link href={`/customers/${t.customer.id}`} className="font-semibold text-ink hover:text-brand">{t.customer.name}</Link>
              {t.customer.kycStatus === 'VERIFIED' ? <span className="ml-1.5 text-brand">· verified</span> : <span className="ml-1.5 text-amber">· not verified</span>}
              <span className="text-subtle"> · {t.createdBy ? `created by ${t.createdBy}` : t.conversationId ? 'raised by the chat assistant' : 'created by —'} <span suppressHydrationWarning>{timeAgo(t.createdAt)}</span></span>
              {t.conversationId && (
                <Link href={`/inbox?c=${t.conversationId}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                  <MessageSquare size={13} /> Open chat
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Customer sends</div>
              <div className="whitespace-nowrap font-mono text-lg font-bold tabular text-ink">{formatMinor(t.payMinor, t.payCurrency)}</div>
            </div>
            <ArrowRight size={18} className="text-subtle" />
            <div>
              <div className="text-[0.6875rem] font-mono uppercase tracking-wider text-subtle">Customer receives</div>
              <div className="whitespace-nowrap font-mono text-lg font-bold tabular text-brand">{formatMinor(t.receiveMinor, t.receiveCurrency)}</div>
            </div>
          </div>
        </div>
        <div className="mt-5"><Progress t={t} /></div>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-xs">
          {summary?.map((s) => (
            <div key={s.label} className="flex gap-1.5"><dt className="text-subtle">{s.label}</dt><dd className="font-mono font-semibold text-ink">{s.value}</dd></div>
          ))}
          {t.note && <div className="flex gap-1.5"><dt className="text-subtle">Note</dt><dd className="text-ink">{t.note}</dd></div>}
        </dl>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <NextStep t={t} rails={rails.data?.rails ?? []} act={act} />
          {t.status !== 'FUNDS_CONFIRMED' && t.signals.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-bold text-ink">Checks</h2>
              <SignalList signals={t.signals} />
            </Card>
          )}
          {t.beneficiary && t.status !== 'APPROVED' && t.status !== 'FUNDS_CONFIRMED' && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-bold text-ink">Payout details</h2>
              <BeneficiaryCard b={t.beneficiary} currency={t.receiveCurrency} amountMinor={t.receiveMinor} />
            </Card>
          )}
          {(t.receipts.length > 0 || t.payouts.length > 0) && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-bold text-ink">Money movements</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[0.6875rem] uppercase tracking-wider text-subtle">
                    <tr><th className="pb-2 font-semibold">When</th><th className="pb-2 font-semibold">What</th><th className="pb-2 font-semibold">Account</th><th className="pb-2 font-semibold">Reference</th><th className="pb-2 text-right font-semibold">Amount</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {t.receipts.map((r) => (
                      <tr key={r.id}><td className="py-2 text-xs text-subtle" suppressHydrationWarning>{dateTime(r.at)}</td><td className="py-2">In{r.payerName ? ` from ${r.payerName}` : ''}</td><td className="py-2 text-xs">{r.rail}</td><td className="py-2 font-mono text-xs">{r.bankReference}</td><td className="py-2 text-right font-mono tabular text-brand">+{formatMinor(r.amountMinor, r.currency)}</td></tr>
                    ))}
                    {t.payouts.map((p) => (
                      <tr key={p.id}><td className="py-2 text-xs text-subtle" suppressHydrationWarning>{dateTime(p.at)}</td><td className="py-2">{p.kind === 'REFUND' ? 'Refund' : 'Payout'}</td><td className="py-2 text-xs">{p.rail}</td><td className="py-2 font-mono text-xs">{p.reference}</td><td className="py-2 text-right font-mono tabular text-ink">−{formatMinor(p.amountMinor, p.currency)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Evidence t={t} onChanged={(nt) => setData({ trade: nt })} />
        </div>
        <div className="space-y-6">
          {!['QUOTED', 'CANCELLED', 'REFUNDED', 'EXPIRED'].includes(t.status) && (
            <Card className="p-5">
              <h2 className="text-sm font-bold text-ink">Customer link</h2>
              <p className="mt-0.5 text-xs text-muted">The customer follows progress here and gets their receipt.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={typeof window !== 'undefined' ? `${window.location.origin}${t.portalPath}` : t.portalPath} label="Copy link" />
                <a href={t.portalPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-brand hover:underline"><Check size={13} /> Open</a>
              </div>
            </Card>
          )}
          <Timeline t={t} act={act} />
        </div>
      </div>
    </div>
  );
}
