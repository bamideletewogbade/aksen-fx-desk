'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Activity as ActivityIcon, ArrowRight, Banknote, CheckCircle2, Circle, MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { CORRIDORS, formatMinor, type Corridor } from '@/lib/money';
import type { TradeStatus, TradeSummary } from '@/lib/trades';
import { clock, remaining, timeAgo } from '@/lib/time';
import { Button, Card, cx, Dialog, Empty, Notice, PageHeader, Skeleton } from '@/components/ui';
import type { Insights } from '@/server/insights';
import type { ConversationSummary } from '@/server/inbox';
import type { RateRow } from '@/server/desk';
import type { ActivityItem } from '@/server/activity';
import { useSession } from '@/components/app-shell';

function Setup() {
  const { data } = useLoad<{ steps: { key: string; label: string; href: string; done: boolean }[]; complete: boolean }>('/api/desk/setup');
  if (!data || data.complete) return null;
  const done = data.steps.filter((s) => s.done).length;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Set up your desk</h2>
          <p className="text-xs text-muted">{done} of {data.steps.length} done. Each step takes a minute or two.</p>
        </div>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-[#eef4ec]" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(done / data.steps.length) * 100}%` }} />
        </div>
      </div>
      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={cx('flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm', s.done ? 'text-subtle line-through' : 'text-ink hover:bg-[#eef4ec]')}>
              {s.done ? <CheckCircle2 size={16} className="text-brand" /> : <Circle size={16} className="text-subtle" />}
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BriefButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<{ text: string; facts: string[]; source: 'model' | 'facts'; model?: string; generatedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'facts' | 'writing' | 'slow'>('facts');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const run = async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setOpen(true);
    setBusy(true);
    setError(null);
    setPhase('facts');
    timers.current.push(setTimeout(() => setPhase('writing'), 900));
    timers.current.push(setTimeout(() => setPhase('slow'), 8_000));
    try {
      const d = await api<{ brief: NonNullable<typeof brief> }>('/api/desk/report', { method: 'POST' });
      setBrief(d.brief);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" icon={<Sparkles size={15} />} onClick={run}>Brief me</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Desk brief" wide footer={<Button variant="secondary" onClick={run} busy={busy} icon={<RefreshCw size={14} />}>Refresh</Button>}>
        {busy && (
          <Notice tone="info" title={phase === 'facts' ? 'Gathering desk facts…' : phase === 'writing' ? 'Writing the summary…' : 'The AI wording is taking longer than usual…'}>
            {phase === 'facts' ? 'Reading open trades, recent activity and today’s totals. Nothing is being changed.' : phase === 'writing' ? 'The facts are being turned into a short operator brief. Nothing will be sent.' : 'Keep this dialog open, or close it and retry. Your desk records are safe and unchanged.'}
          </Notice>
        )}
        {busy && !brief && <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>}
        {error && <Notice tone="risk" title="The brief could not be generated">{error} No records were changed. Use Refresh to try again.</Notice>}
        {brief && (
          <div className="space-y-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{brief.text}</div>
            <details className="rounded-xl border border-line bg-paper p-3 text-xs text-muted">
              <summary className="cursor-pointer font-semibold text-ink">The facts this brief is based on</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{brief.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </details>
            <p className="text-[0.6875rem] text-subtle">
              {brief.source === 'model' ? `Worded by ${brief.model} from the facts above only.` : 'Written directly from your records (no AI model configured or available).'} Generated {clock(brief.generatedAt)}.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- the work queue

type Stage = 'pay' | 'approve' | 'check' | 'attention' | 'waiting' | 'quoted';

const STAGES: Record<Stage, { label: string; action: string; statuses: TradeStatus[]; bar: string; rank: number }> = {
  pay: { label: 'Send payout', action: 'Send payout', statuses: ['APPROVED'], bar: 'bg-brand', rank: 0 },
  approve: { label: 'Approve', action: 'Review & approve', statuses: ['FUNDS_CONFIRMED'], bar: 'bg-lime', rank: 1 },
  check: { label: 'Receipt sent', action: 'Check statement', statuses: ['AWAITING_FUNDS'], bar: 'bg-amber', rank: 2 },
  attention: { label: 'Needs attention', action: 'Resolve', statuses: ['ON_HOLD', 'REFUND_DUE'], bar: 'bg-risk', rank: 3 },
  waiting: { label: 'Awaiting payment', action: 'Open', statuses: ['AWAITING_FUNDS'], bar: 'bg-[#cfdacb]', rank: 4 },
  quoted: { label: 'Quote out', action: 'Open', statuses: ['QUOTED'], bar: 'bg-[#e4ebe2]', rank: 5 },
};

/** Which step a trade is at. "Receipt sent" is split out because the customer is now waiting on us. */
function stageOf(t: TradeSummary): Stage {
  if (t.status === 'APPROVED') return 'pay';
  if (t.status === 'FUNDS_CONFIRMED') return 'approve';
  if (t.status === 'AWAITING_FUNDS') return t.evidenceCount > 0 ? 'check' : 'waiting';
  if (t.status === 'ON_HOLD' || t.status === 'REFUND_DUE') return 'attention';
  return 'quoted';
}

function waitingFor(t: TradeSummary): string {
  if (t.status === 'QUOTED') {
    const r = remaining(t.quoteExpiresAt);
    return r.ms > 0 ? `rate held ${r.text}` : 'rate expired';
  }
  if (t.status === 'AWAITING_FUNDS' && t.evidenceCount === 0 && t.fundsDueAt) {
    const r = remaining(t.fundsDueAt);
    return r.ms > 0 ? `pay within ${r.text}` : 'payment window passed';
  }
  return `waiting ${timeAgo(t.updatedAt).replace(' ago', '')}`;
}

function QueueRow({ t }: { t: TradeSummary }) {
  const s = STAGES[stageOf(t)];
  const hot = s.rank <= 2;
  return (
    <li>
      <Link href={`/trades/${t.id}`} className="group flex items-stretch gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[#f3f7f1]">
        <span className={cx('w-1 flex-shrink-0 rounded-full', s.bar)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-ink">{t.customer.name}</span>
            <span className="flex-shrink-0 font-mono text-xs text-subtle">{t.ref}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="font-mono tabular text-ink">{formatMinor(t.payMinor, t.payCurrency, { compact: true })} → {formatMinor(t.receiveMinor, t.receiveCurrency, { compact: true })}</span>
            <span aria-hidden>·</span>
            <span suppressHydrationWarning>{waitingFor(t)}</span>
            {t.customer.kycStatus !== 'VERIFIED' && <span className="text-amber">· not verified</span>}
            {t.isTest && <span className="rounded-full bg-amber-bg px-1.5 text-[0.625rem] font-semibold text-amber">Test</span>}
          </div>
        </div>
        <span className={cx('hidden flex-shrink-0 items-center gap-1 self-center rounded-lg px-2.5 py-1 text-xs font-semibold sm:inline-flex', hot ? 'bg-brand text-white group-hover:bg-brand-deep' : 'text-brand')}>
          {s.action} <ArrowRight size={13} />
        </span>
      </Link>
    </li>
  );
}

type Tab = 'next' | Stage;

function WorkQueue({ trades, loading }: { trades: TradeSummary[]; loading: boolean }) {
  const [tab, setTab] = useState<Tab>('next');
  const sorted = useMemo(
    () => [...trades].sort((a, b) => STAGES[stageOf(a)].rank - STAGES[stageOf(b)].rank || a.updatedAt.localeCompare(b.updatedAt)),
    [trades],
  );
  const count = (s: Stage) => trades.filter((t) => stageOf(t) === s).length;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'next', label: `All (${trades.length})` },
    ...(['pay', 'approve', 'check', 'attention', 'waiting', 'quoted'] as Stage[]).filter((s) => count(s) > 0).map((s) => ({ value: s, label: `${STAGES[s].label} (${count(s)})` })),
  ];
  const shown = tab === 'next' ? sorted : sorted.filter((t) => stageOf(t) === tab);
  return (
    <Card className="flex min-h-[22rem] flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Your queue</h2>
          <p className="text-xs text-muted">Most urgent first: money going out, then approvals, then receipts to check.</p>
        </div>
      </div>
      {tabs.length > 2 && (
        <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cx('whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer', tab === t.value ? 'border-brand bg-brand text-white' : 'border-line text-muted hover:text-ink')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex-1">
        {loading && !trades.length ? (
          <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : !shown.length ? (
          <Empty icon={<CheckCircle2 size={20} />} title="You’re all caught up">
            New trades arrive here as customers lock rates on WhatsApp, then move along as money comes in and goes out.
          </Empty>
        ) : (
          <ul className="-mx-2 divide-y divide-line">{shown.slice(0, 40).map((t) => <QueueRow key={t.id} t={t} />)}</ul>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- today strip

function TodayTile({ href, label, value, sub, tone }: { href: string; label: string; value: React.ReactNode; sub: string; tone?: 'urgent' | 'good' }) {
  return (
    <Link href={href} className={cx('group rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm', tone === 'urgent' ? 'border-[#f1d4a6] bg-[#fffaf1]' : 'border-line')}>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={cx('mt-1 font-mono text-2xl font-bold tabular', tone === 'urgent' ? 'text-amber' : tone === 'good' ? 'text-brand' : 'text-ink')}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-subtle">{sub}</div>
    </Link>
  );
}

function TodayStrip({ chatsNeedingYou }: { chatsNeedingYou: number }) {
  const { data } = useLoad<{ insights: Insights }>('/api/insights?days=1', { pollMs: 30_000 });
  const i = data?.insights;
  if (!i) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-24" />)}</div>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <TodayTile href="/insights" label="Completed today" value={i.completed} sub={i.completed ? `${formatMinor(i.volumeNgnMinor, 'NGN', { compact: true })} · ${formatMinor(i.volumeGhsMinor, 'GHS', { compact: true })}` : 'No payouts yet today'} tone={i.completed ? 'good' : undefined} />
      <TodayTile href="/trades?status=AWAITING_FUNDS" label="Customers paying now" value={i.attention.awaitingFunds.count} sub={i.attention.awaitingFunds.count ? `${formatMinor(i.attention.awaitingFunds.expectedNgnMinor, 'NGN', { compact: true })} expected in` : 'No payments expected'} />
      <TodayTile href="/trades?status=OPEN" label="Owed to customers" value={i.attention.toApprove.count + i.attention.toPay.count} sub={i.attention.toApprove.count + i.attention.toPay.count ? `${i.attention.toApprove.count} to approve · ${i.attention.toPay.count} to pay` : 'Nothing owed right now'} tone={i.attention.toApprove.count + i.attention.toPay.count ? 'urgent' : undefined} />
      <TodayTile href="/inbox?filter=needs_you" label="Chats needing you" value={chatsNeedingYou} sub={chatsNeedingYou ? 'The assistant handed these over' : 'The assistant has it covered'} tone={chatsNeedingYou ? 'urgent' : undefined} />
    </div>
  );
}

// ---------------------------------------------------------------- side column

function LiveChats({ conversations }: { conversations: ConversationSummary[] | null }) {
  const list = (conversations ?? []).slice(0, 5);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><MessageSquare size={15} className="text-brand" /> WhatsApp</h2>
        <Link href="/inbox" className="text-xs font-semibold text-brand hover:underline">Open inbox</Link>
      </div>
      {!conversations ? (
        <Skeleton className="mt-3 h-24" />
      ) : !list.length ? (
        <p className="mt-3 text-xs text-muted">No chats yet. When customers message your number, the assistant replies and they show up here.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox?c=${c.id}`} className="flex items-start gap-2.5 py-2.5">
                <span className={cx('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', c.needsHuman ? 'bg-amber' : c.mode === 'ASSISTANT' ? 'bg-brand' : 'bg-[#4a7fc1]')} title={c.needsHuman ? 'Needs you' : c.mode === 'ASSISTANT' ? 'Assistant replying' : 'A person is replying'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cx('truncate text-sm text-ink', c.unread ? 'font-bold' : 'font-medium')}>{c.displayName}</span>
                    <span className="flex-shrink-0 text-[0.625rem] text-subtle" suppressHydrationWarning>{timeAgo(c.lastMessageAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{c.needsHuman ? `Needs you: ${c.handoffReason ?? 'handed over'}` : c.lastPreview?.replace(/[*_]([^*_\n]+)[*_]/g, '$1') ?? ''}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RatesNow() {
  const { data } = useLoad<{ rates: RateRow[] }>('/api/rates', { pollMs: 60_000 });
  const rates = data?.rates.filter((r) => r.active) ?? null;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Today’s rates</h2>
        <Link href="/rates" className="text-xs font-semibold text-brand hover:underline">Change</Link>
      </div>
      {!rates ? <Skeleton className="mt-3 h-14" /> : !rates.length ? (
        <p className="mt-2 text-xs text-amber">No active rates. The assistant can’t quote until you set one.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {rates.map((r) => {
            const usd = r.corridor === 'USD_NGN';
            return (
              <div key={r.corridor} className="rounded-xl bg-paper px-3 py-2">
                <div className="text-[0.6875rem] text-muted">{usd ? 'US dollar benchmark' : CORRIDORS[r.corridor as Corridor].label}</div>
                <div className="font-mono text-base font-bold tabular text-ink">₦{Number(r.customerRate).toFixed(2)}</div>
                <div className="text-[0.625rem] text-subtle" suppressHydrationWarning>per {usd ? '$1' : 'GH₵1'} · set {timeAgo(r.updatedAt)}</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Activity() {
  const { data } = useLoad<{ activity: ActivityItem[] }>('/api/activity?limit=10', { pollMs: 20_000 });
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><ActivityIcon size={15} className="text-brand" /> Latest activity</h2>
      {!data ? <Skeleton className="mt-3 h-32" /> : !data.activity.length ? (
        <p className="mt-2 text-xs text-muted">Every quote, payment and payout shows up here as it happens.</p>
      ) : (
        <ol className="mt-3 space-y-3 border-l border-line pl-4">
          {data.activity.map((a) => (
            <li key={a.seq} className="relative">
              <span className={cx('absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full ring-2 ring-white', a.actorType === 'CUSTOMER' ? 'bg-[#4a7fc1]' : a.actorType === 'SYSTEM' ? 'bg-subtle' : 'bg-brand')} />
              <Link href={`/trades/${a.tradeId}`} className="block text-xs leading-snug hover:text-brand">
                <span className="font-semibold text-ink">{a.text}</span>
                <span className="block text-subtle" suppressHydrationWarning>{a.customer} · {a.tradeRef} · {timeAgo(a.at)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function DeskView() {
  const session = useSession();
  const { data, error, loading, loadedAt, reload } = useLoad<{ trades: TradeSummary[] }>('/api/trades?status=OPEN&limit=300', { pollMs: 15_000 });
  const chats = useLoad<{ conversations: ConversationSummary[] }>('/api/inbox?filter=all', { pollMs: 15_000 });
  const trades = useMemo(() => data?.trades ?? [], [data]);
  const needsYou = chats.data?.conversations.filter((c) => c.needsHuman).length ?? 0;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<span suppressHydrationWarning>{today}</span>}
        title={`${greeting}, ${session.userName.split(' ')[0]}`}
        subtitle={trades.length ? `${trades.length} trade${trades.length === 1 ? '' : 's'} in progress at ${session.orgName}.` : `Nothing in progress at ${session.orgName} right now.`}
        actions={<BriefButton />}
      />
      <TodayStrip chatsNeedingYou={needsYou} />
      <Setup />
      {error && <Notice tone="risk" title="Could not refresh the queue">{error.message}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-2">
          <WorkQueue trades={trades} loading={loading} />
          <div className="flex items-center justify-between px-1 text-[0.6875rem] text-subtle">
            <span className="flex items-center gap-1.5"><Banknote size={12} /> A receipt never moves a trade; only a credit you find on your statement does.</span>
            <button type="button" onClick={reload} className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-brand hover:underline cursor-pointer" suppressHydrationWarning>
              <RefreshCw size={11} /> {loadedAt ? clock(loadedAt) : '…'}
            </button>
          </div>
        </div>
        <div className="space-y-4">
          <LiveChats conversations={chats.data?.conversations ?? null} />
          <RatesNow />
          <Activity />
        </div>
      </div>
    </div>
  );
}
