'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, CheckCircle2, Info, MessageSquare } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { computeQuote, CORRIDORS, formatMinor, parseMajor, parseRate, spreadEarnedNgn, type Corridor } from '@/lib/money';
import type { Beneficiary } from '@/lib/trades';
import { canApprove } from '@/lib/auth';
import { clock } from '@/lib/time';
import { Button, Card, cx, Field, Input, Notice, PageHeader, Segmented, Select, Skeleton, Textarea } from '@/components/ui';
import { CustomerPicker } from '@/components/customer-picker';
import { BeneficiaryFields, beneficiaryComplete, emptyBeneficiary } from '@/components/beneficiary-fields';
import { ShareLink } from '@/components/share-link';
import { useSession } from '@/components/app-shell';
import type { CustomerRow, DeskSettings, RateRow } from '@/server/desk';

export function QuoteBuilder({ initialCustomerId, conversationId }: { initialCustomerId?: string; conversationId?: string }) {
  const session = useSession();
  const rates = useLoad<{ rates: RateRow[] }>('/api/rates');
  const settings = useLoad<{ settings: DeskSettings }>('/api/settings');
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [corridor, setCorridor] = useState<Corridor>('NGN_GHS');
  const [mode, setMode] = useState<'PAY' | 'RECEIVE'>('PAY');
  const [amount, setAmount] = useState('');
  const [customRate, setCustomRate] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [ttl, setTtl] = useState<number | null>(null);
  const [addPayout, setAddPayout] = useState(false);
  const [ben, setBen] = useState<Beneficiary>(emptyBeneficiary('GHS'));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; ref: string; portalPath: string; expiresAt: string; payMinor: number; receiveMinor: number; rate: string } | null>(null);

  // Quoting inside a chat: the chat decides who the customer is.
  const chat = useLoad<{ conversation: { id: string; displayName: string; phone: string; customer: { id: string } | null } }>(conversationId ? `/api/inbox/${conversationId}` : null);
  const chatName = chat.data?.conversation.displayName ?? null;
  const customerIdToLoad = initialCustomerId ?? chat.data?.conversation.customer?.id;
  useEffect(() => {
    if (!customerIdToLoad) return;
    api<{ customer: CustomerRow }>(`/api/customers/${customerIdToLoad}`).then((d) => setCustomer(d.customer)).catch(() => {});
  }, [customerIdToLoad]);

  const { pay, receive } = CORRIDORS[corridor];
  useEffect(() => setBen(emptyBeneficiary(receive)), [receive]);

  const board = rates.data?.rates.find((r) => r.corridor === corridor && r.active);
  const ttlMinutes = ttl ?? settings.data?.settings.quoteTtlMinutes ?? 15;

  const preview = useMemo(() => {
    if (!board || !amount.trim()) return null;
    try {
      const rate = parseRate(useCustom && customRate ? customRate : board.customerRate);
      const amountMinor = parseMajor(amount);
      const q = computeQuote({ corridor, mode, amountMinor, rate, feeMinor: board.feeMinor });
      const spread = spreadEarnedNgn({ corridor, ...q, referenceRate: board.referenceRate ? parseRate(board.referenceRate) : null });
      const belowMin = q.payMinor < board.minPayMinor;
      const aboveMax = board.maxPayMinor !== null && q.payMinor > board.maxPayMinor;
      return { ...q, rate, spread, belowMin, aboveMax, error: null as string | null };
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [board, amount, corridor, mode, useCustom, customRate]);

  const ngnSide = preview && !('error' in preview && preview.error) && 'payMinor' in preview ? (pay === 'NGN' ? preview.payMinor : preview.receiveMinor) : 0;
  const overLimit = customer?.perTradeLimitNgn ? ngnSide > customer.perTradeLimitNgn : false;

  const submit = async () => {
    if (!customer && !conversationId) return setError('Choose a customer first.');
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ id: string; ref: string; portalPath: string }>('/api/trades', {
        method: 'POST',
        json: {
          customerId: customer?.id ?? null,
          conversationId: conversationId ?? null,
          corridor,
          mode,
          amount,
          customRate: useCustom && customRate ? customRate : null,
          ttlMinutes,
          beneficiary: addPayout && beneficiaryComplete(ben) ? ben : null,
          note: note || null,
        },
      });
      const p = preview as { payMinor: number; receiveMinor: number; rate: bigint };
      setCreated({ ...d, expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(), payMinor: p.payMinor, receiveMinor: p.receiveMinor, rate: useCustom && customRate ? customRate : board!.customerRate });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created && conversationId) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-brand" size={22} />
            <div>
              <h1 className="text-xl font-bold text-ink">Quote {created.ref} sent to {chatName ?? 'the customer'}</h1>
              <p className="mt-1 text-sm text-muted">They got the locked rate in WhatsApp and were asked where to send the money. Collect the payout details in the chat, or hand the chat back to the assistant to do it. The rate holds until {clock(created.expiresAt)}.</p>
            </div>
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Link href={`/inbox?c=${conversationId}`}><Button icon={<MessageSquare size={15} />}>Back to the chat</Button></Link>
          <Link href={`/trades/${created.id}`}><Button variant="secondary">Open the trade</Button></Link>
        </div>
      </div>
    );
  }

  if (created && customer) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-brand" size={22} />
            <div>
              <h1 className="text-xl font-bold text-ink">Quote {created.ref} is ready to send</h1>
              <p className="mt-1 text-sm text-muted">Send the link to {customer.name}. They accept, add payout details if needed, and see where to pay. It expires at {clock(created.expiresAt)}.</p>
            </div>
          </div>
          <div className="mt-5">
            <ShareLink path={created.portalPath} deskName={session.orgName} customerName={customer.name} phone={customer.phone} payMinor={created.payMinor} payCurrency={pay} receiveMinor={created.receiveMinor} receiveCurrency={receive} rate={created.rate} expiresAt={created.expiresAt} />
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Link href={`/trades/${created.id}`}><Button>Open the trade</Button></Link>
          <Button variant="secondary" onClick={() => { setCreated(null); setAmount(''); setNote(''); setAddPayout(false); }}>Another quote for {customer.name.split(' ')[0]}</Button>
          <Link href="/desk"><Button variant="ghost">Back to desk</Button></Link>
        </div>
      </div>
    );
  }

  const hasPreview = preview && 'payMinor' in preview;

  return (
    <div className="space-y-6">
      {conversationId ? (
        <Link href={`/inbox?c=${conversationId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Back to the chat</Link>
      ) : (
        <Link href="/trades" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Trades</Link>
      )}
      <PageHeader
        title={conversationId ? `Quote for ${chatName ?? '…'}` : 'Quote by phone or in person'}
        subtitle={conversationId ? 'Price it here and it is sent straight into the WhatsApp chat. Use this for special rates or amounts the assistant can’t quote.' : 'For customers who call or walk in. You get a link to send them; customers who message on WhatsApp get quotes from the assistant automatically.'}
      />
      {rates.loading ? (
        <Skeleton className="h-96" />
      ) : !rates.data?.rates.some((r) => r.active) ? (
        <Notice tone="warn" title="Set your rates first">You need at least one active rate before you can quote. <Link className="font-semibold underline" href="/rates">Go to Rates</Link></Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="space-y-5 p-5">
              {conversationId ? (
                <div className="flex items-center gap-2 rounded-xl bg-paper px-3.5 py-2.5 text-sm"><MessageSquare size={15} className="text-brand" /> <span className="font-semibold text-ink">{customer?.name ?? chatName ?? '…'}</span> <span className="text-muted">· WhatsApp {chat.data?.conversation.phone}</span></div>
              ) : (
                <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
              )}
              {customer?.kycStatus === 'REJECTED' && <Notice tone="risk">This customer is marked rejected. You can’t quote for them.</Notice>}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Direction">
                  <Segmented value={corridor} onChange={setCorridor} options={(Object.keys(CORRIDORS) as Corridor[]).filter((c) => rates.data!.rates.some((r) => r.corridor === c && r.active)).map((c) => ({ value: c, label: CORRIDORS[c].label }))} />
                </Field>
                <Field label="Quote by">
                  <Segmented value={mode} onChange={setMode} options={[{ value: 'PAY', label: 'Amount they send' }, { value: 'RECEIVE', label: 'Amount they get' }]} />
                </Field>
              </div>
              <Field label={mode === 'PAY' ? `Customer sends (${pay})` : `Customer receives (${receive})`} htmlFor="amount" hint="You can type 1.5m or 250k." error={preview && 'error' in preview && preview.error ? preview.error : null}>
                <Input id="amount" mono inputMode="decimal" autoComplete="off" className="text-lg font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === 'PAY' ? (pay === 'NGN' ? '1,500,000' : '10,000') : receive === 'GHS' ? '10,000' : '1,000,000'} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Rate (1 GHS in NGN)" hint={board ? `Board rate ${board.customerRate}${board.updatedAt ? `, set ${clock(board.updatedAt)}` : ''}` : undefined}>
                  {useCustom ? (
                    <div className="flex gap-2">
                      <Input mono value={customRate} onChange={(e) => setCustomRate(e.target.value)} placeholder={board?.customerRate} aria-label="Custom rate" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setUseCustom(false); setCustomRate(''); }}>Board</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5">
                      <span className="font-mono text-sm font-semibold">{board?.customerRate ?? '—'}</span>
                      {canApprove(session) && <button type="button" className="text-xs font-semibold text-brand hover:underline cursor-pointer" onClick={() => setUseCustom(true)}>Custom rate</button>}
                    </div>
                  )}
                </Field>
                <Field label="Quote valid for" htmlFor="ttl">
                  <Select id="ttl" value={ttlMinutes} onChange={(e) => setTtl(Number(e.target.value))}>
                    {[5, 10, 15, 30, 60, 120].concat(settings.data ? [settings.data.settings.quoteTtlMinutes] : []).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} minutes</option>)}
                  </Select>
                </Field>
              </div>
            </Card>

            <Card className="p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#175b3b]" checked={addPayout} onChange={(e) => setAddPayout(e.target.checked)} />
                <span>
                  <span className="block text-sm font-semibold text-ink">I already have the payout details</span>
                  <span className="block text-xs text-muted">Otherwise the customer enters who receives the {CORRIDORS[corridor].receive === 'GHS' ? 'cedis' : 'naira'} when they accept.</span>
                </span>
              </label>
              {addPayout && <div className="mt-5"><BeneficiaryFields value={ben} onChange={setBen} currency={receive} /></div>}
            </Card>

            <Card className="p-5">
              <Field label="Internal note" optional htmlFor="note" hint="Only your team sees this.">
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Agreed by phone, regular Thursday transfer" />
              </Field>
            </Card>
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card className="overflow-hidden">
              <div className="bg-[#10261d] p-5 text-white">
                <div className="text-[0.6875rem] font-mono uppercase tracking-wider text-[#a3b8ac]">Customer sends</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular">{hasPreview ? formatMinor(preview.payMinor, pay) : '—'}</div>
                <div className="my-3 flex items-center gap-2 text-xs text-[#a3b8ac]"><ArrowDown size={14} /> at 1 GHS = ₦{hasPreview ? (useCustom && customRate ? customRate : board?.customerRate) : board?.customerRate ?? '—'}</div>
                <div className="text-[0.6875rem] font-mono uppercase tracking-wider text-[#a3b8ac]">Customer receives</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular text-lime">{hasPreview ? formatMinor(preview.receiveMinor, receive) : '—'}</div>
              </div>
              <div className="space-y-2.5 p-5 text-sm">
                {hasPreview && preview.feeMinor > 0 && <Row label="Fee (included)" value={formatMinor(preview.feeMinor, pay)} />}
                {hasPreview && preview.spread !== null && (
                  <Row label="Your margin vs reference" value={<span className={cx(preview.spread < 0 ? 'text-risk' : 'text-brand', 'font-semibold')}>{formatMinor(preview.spread, 'NGN')}</span>} />
                )}
                <Row label="Expires" value={`${ttlMinutes} min after sending`} />
                {hasPreview && preview.belowMin && <Notice tone="warn">Below your minimum of {formatMinor(board!.minPayMinor, pay)}.</Notice>}
                {hasPreview && preview.aboveMax && <Notice tone="warn">Above your maximum of {formatMinor(board!.maxPayMinor!, pay)}.</Notice>}
                {overLimit && <Notice tone="warn">Above {customer!.name.split(' ')[0]}’s per-trade limit. An admin will see a warning before payout.</Notice>}
                {useCustom && <Notice tone="info">Custom rates are recorded on the trade and shown at approval.</Notice>}
                <p className="flex gap-1.5 pt-1 text-xs text-subtle"><Info size={13} className="mt-0.5 flex-shrink-0" /> {mode === 'PAY' ? 'The amount received is rounded down to the nearest kobo/pesewa.' : 'The amount to send is rounded up to the nearest kobo/pesewa.'}</p>
                {error && <Notice tone="risk">{error}</Notice>}
                <Button className="w-full" size="lg" busy={busy} disabled={(!customer && !conversationId) || !hasPreview || customer?.kycStatus === 'REJECTED' || preview.belowMin || preview.aboveMax} onClick={submit}>
                  {conversationId ? 'Send quote in the chat' : 'Create quote and get link'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular text-ink">{value}</span>
    </div>
  );
}
