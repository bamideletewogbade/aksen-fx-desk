'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, CheckCircle2, Clock, FileCheck2, Lock, Phone, Printer, ShieldCheck, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { CORRIDORS, formatMinor, minorToMajorString } from '@/lib/money';
import { STATUS_META, type Beneficiary } from '@/lib/trades';
import { dateTime } from '@/lib/time';
import type { PortalView } from '@/server/trades';
import { Button, Card, CopyButton, Countdown, cx, Notice, Toaster, toast } from '@/components/ui';
import { BeneficiaryFields, beneficiaryComplete, emptyBeneficiary } from '@/components/beneficiary-fields';

const STEPS = ['Quote', 'Accepted', 'You paid', 'Received', 'Paid out'];

function stepIndex(v: PortalView): number {
  const s = v.trade.status;
  if (s === 'QUOTED') return 0;
  if (s === 'AWAITING_FUNDS') return v.trade.evidenceCount > 0 ? 2 : 1;
  if (s === 'FUNDS_CONFIRMED' || s === 'APPROVED') return 3;
  if (s === 'COMPLETED') return 5;
  if (s === 'ON_HOLD') return v.trade.fundsReceivedMinor > 0 ? 3 : 2;
  return 0;
}

function Detail({ label, value, copy, mono }: { label: string; value: string; copy?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-subtle">{label}</div>
        <div className={cx('truncate text-[0.9375rem] font-semibold text-ink', mono && 'font-mono tabular')}>{value}</div>
      </div>
      {copy !== undefined && <CopyButton text={copy} label="Copy" copiedLabel="Copied" />}
    </div>
  );
}

export function CustomerTrade({ token, initial }: { token: string; initial: PortalView }) {
  const [view, setView] = useState(initial);
  const [ben, setBen] = useState<Beneficiary>(emptyBeneficiary(initial.trade.receiveCurrency));
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const t = view.trade;
  const { pay, receive } = CORRIDORS[t.corridor];

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const d = await api<{ view: PortalView }>(`/api/portal/${token}`);
        setView(d.view);
      } catch {
        /* keep last view */
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    document.title = `${t.ref} · ${view.desk.name}`;
  }, [t.ref, view.desk.name]);

  const accept = async () => {
    setBusy(true);
    try {
      const d = await api<{ view: PortalView }>(`/api/portal/${token}`, { method: 'POST', json: { action: 'accept', beneficiary: t.beneficiary ? null : ben } });
      setView(d.view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast((e as Error).message, 'risk');
    } finally {
      setBusy(false);
    }
  };

  const sendProof = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (note) fd.append('note', note);
      const d = await api<{ view: PortalView }>(`/api/portal/${token}`, { method: 'POST', body: fd });
      setView(d.view);
      setFile(null);
      setNote('');
      setSent(true);
    } catch (e) {
      toast((e as Error).message, 'risk');
    } finally {
      setBusy(false);
    }
  };

  const idx = stepIndex(view);
  const meta = STATUS_META[t.status];
  const support = view.desk.supportPhone?.replace(/[^\d+]/g, '');

  return (
    <div className="min-h-dvh bg-paper pb-16">
      <header className="no-print bg-[#10261d] px-4 pb-20 pt-5 text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <div className="text-sm font-bold">{view.desk.name}</div>
            <div className="font-mono text-[0.6875rem] text-[#a3b8ac]">Trade {t.ref}</div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#1b3a2a] px-2.5 py-1 text-[0.6875rem] text-lime"><Lock size={11} /> Private link</span>
        </div>
      </header>

      <main className="mx-auto -mt-16 max-w-lg space-y-4 px-4">
        {view.desk.isDemo && <Notice tone="warn">Sample desk. This is a demonstration; do not send real money.</Notice>}

        <Card className="print-card overflow-hidden shadow-sm">
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-bold text-ink">{meta.customerLabel}</div>
              {t.status === 'QUOTED' && <Countdown to={t.quoteExpiresAt} label="expires in" className="!text-sm" />}
              {t.status === 'AWAITING_FUNDS' && t.fundsDueAt && <Countdown to={t.fundsDueAt} label="pay within" className="!text-sm" />}
            </div>
            <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <div className={cx('h-1.5 rounded-full', i < idx ? 'bg-brand' : i === idx && t.status !== 'COMPLETED' ? (t.status === 'ON_HOLD' ? 'bg-amber' : 'bg-lime') : 'bg-[#e3ebe1]')} />
                  <div className={cx('mt-1 text-[0.625rem] font-semibold', i <= idx ? 'text-ink' : 'text-subtle')}>{s}</div>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-line bg-[#fbfcfa] p-5">
            <div className="text-xs text-subtle">You send</div>
            <div className="font-mono text-2xl font-bold tabular text-ink">{formatMinor(t.payMinor, pay)}</div>
            <div className="my-2 flex items-center gap-2 text-xs text-muted"><ArrowDown size={14} /> 1 GHS = ₦{t.rate}{t.feeMinor > 0 ? ` · fee ${formatMinor(t.feeMinor, pay)} included` : ''}</div>
            <div className="text-xs text-subtle">{t.beneficiary ? `${t.beneficiary.accountName} receives` : 'You receive'}</div>
            <div className="font-mono text-2xl font-bold tabular text-brand">{formatMinor(t.receiveMinor, receive)}</div>
            {t.beneficiary && <div className="mt-1 text-xs text-muted">{t.beneficiary.provider} · {t.beneficiary.accountNumber}</div>}
          </div>
        </Card>

        {t.status === 'QUOTED' && (
          <Card className="space-y-4 p-5">
            <h2 className="text-base font-bold text-ink">Accept this quote</h2>
            {t.beneficiary ? (
              <p className="text-sm text-muted">The desk already has the payout details shown above. Accept to get payment instructions.</p>
            ) : (
              <>
                <p className="text-sm text-muted">Who should receive the {receive === 'GHS' ? 'cedis' : 'naira'}?</p>
                <BeneficiaryFields value={ben} onChange={setBen} currency={receive} customerFacing idPrefix="cust" />
              </>
            )}
            <label className="flex cursor-pointer gap-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#175b3b]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I agree to send {formatMinor(t.payMinor, pay)} at this rate before the payment window closes.</span>
            </label>
            <Button size="lg" className="w-full" busy={busy} disabled={!agree || (!t.beneficiary && !beneficiaryComplete(ben))} onClick={accept}>Accept and show payment details</Button>
          </Card>
        )}

        {t.paymentInstructions && (
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">Pay {formatMinor(t.payMinor - t.fundsReceivedMinor, pay)}</h2>
            <p className="mt-1 text-sm text-muted">Transfer from an account in your own name if you can. Put the reference in the narration or remark.</p>
            <div className="mt-3 divide-y divide-line">
              <Detail label={t.paymentInstructions.kind === 'MOMO' ? 'Network' : 'Bank'} value={t.paymentInstructions.provider} />
              <Detail label={t.paymentInstructions.kind === 'MOMO' ? 'Number' : 'Account number'} value={t.paymentInstructions.accountNumber} copy={t.paymentInstructions.accountNumber} mono />
              <Detail label="Account name" value={t.paymentInstructions.accountName} />
              <Detail label="Amount" value={formatMinor(t.payMinor - t.fundsReceivedMinor, pay)} copy={minorToMajorString(t.payMinor - t.fundsReceivedMinor)} mono />
              <Detail label="Reference / narration" value={t.paymentInstructions.reference} copy={t.paymentInstructions.reference} mono />
            </div>
            {t.fundsReceivedMinor > 0 && <Notice tone="warn" className="mt-3">The desk has received {formatMinor(t.fundsReceivedMinor, pay)} so far.</Notice>}
          </Card>
        )}

        {(t.status === 'AWAITING_FUNDS' || t.status === 'ON_HOLD') && (
          <Card className="space-y-3 p-5">
            <h2 className="text-base font-bold text-ink">Sent the money?</h2>
            <p className="text-sm text-muted">Upload your transfer receipt so the desk can find your payment faster. Your payout is sent once the money shows in their account.</p>
            {(sent || t.evidenceCount > 0) && <Notice tone="good">{t.evidenceCount} file{t.evidenceCount === 1 ? '' : 's'} received by the desk.</Notice>}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#c9d6c6] bg-white px-3 py-3 text-sm text-muted hover:bg-paper">
              <Upload size={16} /> <span className="truncate">{file ? file.name : 'Choose receipt (photo or PDF, max 4 MB)'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional), e.g. sent from Kuda" aria-label="Note for the desk" className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm focus:border-brand focus:outline-none" />
            <Button variant="secondary" className="w-full" busy={busy} disabled={!file && !note.trim()} onClick={sendProof} icon={<FileCheck2 size={15} />}>Send to the desk</Button>
          </Card>
        )}

        {(t.status === 'FUNDS_CONFIRMED' || t.status === 'APPROVED') && (
          <Notice tone="good" title="Your payment arrived">The desk is preparing your payout to {t.beneficiary?.accountName ?? 'your account'}. This page updates on its own.</Notice>
        )}
        {t.status === 'ON_HOLD' && <Notice tone="warn" title="Under review">{t.holdReasonPublic}</Notice>}
        {(t.status === 'EXPIRED' || t.status === 'CANCELLED') && (
          <Notice tone="info" title={t.status === 'EXPIRED' ? 'This quote has expired' : 'This trade was cancelled'}>
            {t.closedReason} {t.status === 'EXPIRED' ? 'Contact the desk for a fresh quote. Do not send money for this one.' : ''}
          </Notice>
        )}
        {(t.status === 'REFUND_DUE' || t.status === 'REFUNDED') && (
          <Notice tone="info" title={t.status === 'REFUNDED' ? 'Refunded' : 'Refund in progress'}>
            {t.status === 'REFUNDED' ? `${formatMinor(t.refundedMinor, pay)} has been returned.` : 'The desk is returning your money. They will contact you if they need anything.'}
          </Notice>
        )}

        {t.status === 'COMPLETED' && (
          <Card className="print-card p-5">
            <div className="flex items-center gap-2 text-brand"><CheckCircle2 size={20} /> <h2 className="text-base font-bold">Receipt</h2></div>
            <div className="mt-3 divide-y divide-line">
              <Detail label="Paid to" value={`${t.beneficiary?.accountName ?? ''} · ${t.beneficiary?.provider ?? ''} ${t.beneficiary?.accountNumber ?? ''}`} />
              <Detail label="Amount paid out" value={formatMinor(t.receiveMinor, receive)} mono />
              <Detail label="Payout reference" value={t.payoutReference ?? '—'} copy={t.payoutReference ?? undefined} mono />
              <Detail label="Completed" value={dateTime(t.updatedAt)} />
              {view.proof && <Detail label="Verification code" value={view.proof.head.slice(0, 16).toUpperCase()} mono />}
            </div>
            <p className="mt-3 flex gap-1.5 text-xs text-subtle"><ShieldCheck size={14} className="mt-0.5 flex-shrink-0" /> The verification code is taken from the desk’s tamper-evident record of this trade. If there is ever a dispute, the desk can show the record matches this code.</p>
            <Button variant="secondary" className="no-print mt-4 w-full" icon={<Printer size={15} />} onClick={() => window.print()}>Print or save as PDF</Button>
          </Card>
        )}

        {view.timeline.length > 0 && (
          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink">History</h2>
            <ol className="mt-3 space-y-2.5">
              {[...view.timeline].reverse().map((e, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <Clock size={14} className="mt-0.5 flex-shrink-0 text-subtle" />
                  <span className="flex-1 text-ink">{CUSTOMER_EVENT[e.action] ?? 'Updated'}{e.actor === 'YOU' ? ' (you)' : ''}</span>
                  <span className="whitespace-nowrap text-xs text-subtle" suppressHydrationWarning>{dateTime(e.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        <footer className="no-print space-y-2 px-1 pt-2 text-center text-xs text-subtle">
          {view.desk.customerNote && <p>{view.desk.customerNote}</p>}
          {support && (
            <p className="flex items-center justify-center gap-3">
              <a href={`tel:${support}`} className="inline-flex items-center gap-1 font-semibold text-brand"><Phone size={12} /> Call the desk</a>
              <a href={`https://wa.me/${support.replace('+', '')}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">WhatsApp the desk</a>
            </p>
          )}
          <p>This page is private to you. The desk will never ask for your PIN or password.</p>
          <p>Trade software by Aksen OTC. {view.desk.name} handles your money and is responsible for this trade.</p>
        </footer>
      </main>
      <Toaster />
    </div>
  );
}

const CUSTOMER_EVENT: Record<string, string> = {
  'trade.quoted': 'Quote created',
  'trade.requoted': 'Quote refreshed',
  'trade.accepted': 'Quote accepted',
  'trade.evidence_added': 'Payment receipt sent',
  'trade.funds_confirmed': 'Payment received by the desk',
  'trade.approved': 'Payout approved',
  'trade.paid_out': 'Payout sent',
  'trade.held': 'Placed under review',
  'trade.released': 'Review finished',
  'trade.cancelled': 'Cancelled',
  'trade.expired': 'Expired',
  'trade.refund_due': 'Refund started',
  'trade.refunded': 'Refund sent',
};
