'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, Check, CheckCheck, Clock, FlaskConical, Hand, Headset, Inbox, MessageSquare, Paperclip, Receipt, Search, Send, Smartphone, UserRound } from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import { canTrade } from '@/lib/auth';
import { dayLabel, remaining, timeAgo } from '@/lib/time';
import { useSession } from '@/components/app-shell';
import { Button, Card, cx, Empty, Input, Notice, PageHeader, Pill, Segmented, Skeleton, StatusBadge, Textarea, toast } from '@/components/ui';
import type { ConversationSummary, MessageView } from '@/server/inbox';

type Filter = 'all' | 'needs_you' | 'assistant' | 'human';
type Thread = { conversation: ConversationSummary; messages: MessageView[] };

const STEP_LABEL: Record<string, string> = {
  IDLE: 'Chatting',
  ASK_CURRENCY: 'Checking currency',
  CONFIRM_QUOTE: 'Quote offered',
  ASK_NAME: 'Asking name',
  ASK_PAYOUT: 'Collecting payout details',
  CONFIRM_LAST_PAYOUT: 'Confirming payout account',
  CONFIRM_PAYOUT: 'Confirming payout details',
  AWAITING_PAYMENT: 'Waiting for payment',
};

/** Re-runs `onChange` whenever the desk's inbox moves, via the SSE stream. */
function useInboxStream(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const [live, setLive] = useState(false);
  useEffect(() => {
    const es = new EventSource('/api/inbox/stream');
    es.addEventListener('change', () => cb.current());
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, []);
  return live;
}

function ChannelIcon({ kind }: { kind: 'WHATSAPP' | 'SMS' }) {
  return kind === 'WHATSAPP' ? <MessageSquare size={12} /> : <Smartphone size={12} />;
}

function Ticks({ m }: { m: MessageView }) {
  if (m.direction !== 'OUT') return null;
  const s = m.status;
  if (s === 'simulated') return <span className="text-[0.625rem] opacity-70">test · not sent</span>;
  if (s === 'not_sent') return <span className="text-[0.625rem] text-[#ffd6d1]" title={m.error ?? ''}>not sent</span>;
  if (s === 'failed' || s === 'undelivered') return <span className="inline-flex items-center gap-0.5 text-[0.625rem] font-semibold text-[#ffd6d1]"><AlertTriangle size={11} /> failed</span>;
  if (s === 'read') return <CheckCheck size={13} className="text-[#7cc4ff]" aria-label="Read" />;
  if (s === 'delivered') return <CheckCheck size={13} aria-label="Delivered" />;
  if (s === 'sent') return <Check size={13} aria-label="Sent" />;
  return <Clock size={11} aria-label="Sending" />;
}

function MediaBlock({ m }: { m: MessageView }) {
  if (!m.hasMedia) return m.mediaCount > 0 ? <div className="text-xs italic opacity-70">[attachment could not be downloaded]</div> : null;
  const src = `/api/inbox/media/${m.id}`;
  if (m.mediaMime?.startsWith('image/')) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Customer attachment" className="max-h-64 max-w-full rounded-lg border border-line bg-white object-contain" />
      </a>
    );
  }
  if (m.mediaMime?.startsWith('audio/')) return <audio controls src={src} className="max-w-full" />;
  if (m.mediaMime?.startsWith('video/')) return <video controls src={src} className="max-h-64 max-w-full rounded-lg" />;
  return <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline"><Paperclip size={12} /> Open attachment</a>;
}

/** WhatsApp formatting the assistant uses: *bold* and _italic_. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : /^_[^_]+_$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/** What the AI model read in a message the chat rules couldn't follow. */
function AiLine({ ai }: { ai: NonNullable<MessageView['ai']> }) {
  const label = ai.status === 'used' ? 'AI read this as' : ai.status === 'failed' ? 'AI couldn’t read this' : 'AI read this, but it wasn’t actionable';
  return (
    <div className={cx('rounded-lg border px-2 py-1 text-[0.6875rem] leading-snug', ai.status === 'used' ? 'border-[#cfeea0] bg-lime-soft text-brand' : 'border-line bg-paper text-subtle')} title={ai.error ?? ai.summary ?? ''}>
      <span className="inline-flex items-center gap-1 font-semibold"><Bot size={11} /> {label}</span>
      {ai.reading && <span>: {ai.reading}</span>}
      {ai.summary && <span className="block opacity-80">“{ai.summary}”</span>}
      <span className="block font-mono text-[0.5625rem] opacity-60">{ai.model ?? 'no model'} · {(ai.ms / 1000).toFixed(1)} s</span>
    </div>
  );
}

function Bubble({ m }: { m: MessageView }) {
  const time = new Date(m.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (m.direction === 'NOTE') {
    return (
      <div className="my-2 flex justify-center">
        <span className="max-w-[85%] rounded-full bg-[#eef1f5] px-3 py-1 text-center text-[0.6875rem] font-medium text-[#3d4b5c]">{m.body} · {time}</span>
      </div>
    );
  }
  const mine = m.direction === 'OUT';
  const bot = m.author === 'ASSISTANT';
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          !mine && 'rounded-bl-md border border-line bg-white text-ink',
          mine && bot && 'rounded-br-md bg-[#dff3d6] text-ink',
          mine && !bot && 'rounded-br-md bg-brand text-white',
        )}
      >
        {mine && (
          <div className={cx('mb-0.5 flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider', bot ? 'text-brand' : 'text-lime')}>
            {bot ? <Bot size={11} /> : <Headset size={11} />} {m.authorLabel ?? (bot ? 'Assistant' : 'Operator')}
          </div>
        )}
        <div className="space-y-1.5">
          <MediaBlock m={m} />
          {m.body && <div className="whitespace-pre-wrap break-words leading-relaxed"><Rich text={m.body} /></div>}
          {!mine && m.ai && <AiLine ai={m.ai} />}
        </div>
        <div className={cx('mt-1 flex items-center justify-end gap-1.5 text-[0.625rem]', mine && !bot ? 'text-[#cfe3d6]' : 'text-subtle')}>
          {time}
          <span className={cx(mine && bot && 'text-brand')}><Ticks m={m} /></span>
        </div>
        {m.error && (m.status === 'failed' || m.status === 'undelivered' || m.status === 'not_sent') && (
          <div className={cx('mt-1 rounded-md px-2 py-1 text-[0.6875rem]', mine && !bot ? 'bg-[#0b3a22] text-[#ffd6d1]' : 'bg-risk-bg text-risk')}>{m.error}</div>
        )}
      </div>
    </div>
  );
}

function WindowBadge({ c }: { c: ConversationSummary }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (c.channel.kind !== 'WHATSAPP' || c.isTest) return null;
  if (!c.windowClosesAt) return <Pill tone="risk">Reply window closed</Pill>;
  const r = remaining(c.windowClosesAt);
  if (r.ms <= 0) return <Pill tone="risk" className="whitespace-nowrap">Reply window closed</Pill>;
  return <Pill tone={r.ms < 2 * 3600_000 ? 'waiting' : 'neutral'} className="whitespace-nowrap">Reply window {r.text} left</Pill>;
}

function ConversationRow({ c, active, onOpen }: { c: ConversationSummary; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx('flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors cursor-pointer', active ? 'bg-[#eef4ec]' : 'hover:bg-[#f6f9f5]', c.needsHuman && !active && 'bg-[#fff8f0]')}
    >
      <div className={cx('mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold', c.needsHuman ? 'bg-amber-bg text-amber' : 'bg-[#eef4ec] text-brand')}>
        {c.displayName.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || <UserRound size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cx('truncate text-sm text-ink', c.unread ? 'font-bold' : 'font-semibold')}>{c.displayName}</span>
          <span className="flex-shrink-0 text-[0.6875rem] text-subtle">{timeAgo(c.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cx('min-w-0 flex-1 truncate text-xs', c.unread ? 'text-ink' : 'text-muted')}>{c.lastPreview?.replace(/[*_]([^*_\n]+)[*_]/g, '$1') ?? '—'}</span>
          {c.unread > 0 && <span className="flex-shrink-0 rounded-full bg-brand px-1.5 text-[0.625rem] font-bold text-white">{c.unread}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {c.needsHuman ? (
            <Pill tone="risk"><Hand size={10} /> Needs you</Pill>
          ) : c.mode === 'ASSISTANT' ? (
            <Pill tone="good"><Bot size={10} /> Assistant</Pill>
          ) : (
            <Pill tone="action"><Headset size={10} /> {c.assignedTo?.name.split(' ')[0] ?? 'Team'}</Pill>
          )}
          {c.trade && <StatusBadge status={c.trade.status} />}
          {c.isTest && <Pill><FlaskConical size={10} /> Test</Pill>}
        </div>
      </div>
    </button>
  );
}

function Composer({ thread, onSent }: { thread: Thread; onSent: (t: Thread) => void }) {
  const session = useSession();
  const c = thread.conversation;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const closed = c.channel.kind === 'WHATSAPP' && !c.isTest && (!c.windowClosesAt || new Date(c.windowClosesAt) < new Date());
  const allowed = canTrade(session);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      onSent(await api<Thread>(`/api/inbox/${c.id}`, { method: 'POST', json: { action: 'reply', text } }));
      setText('');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not send.', 'risk');
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) return <div className="border-t border-line px-4 py-3 text-xs text-muted">Your role can read conversations but not reply.</div>;
  return (
    <div className="border-t border-line bg-white p-3">
      {closed ? (
        <Notice tone="warn">WhatsApp only allows replies within 24 hours of the customer’s last message. You can reply as soon as they write again.</Notice>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={`Reply to ${c.displayName.split(' ')[0]}…`}
              aria-label="Reply"
              className="min-h-[2.75rem] flex-1 resize-none"
            />
            <Button onClick={send} busy={busy} disabled={!text.trim()} icon={<Send size={15} />} aria-label="Send">
              Send
            </Button>
          </div>
          <div className="mt-1.5 text-[0.6875rem] text-subtle">
            {c.mode === 'ASSISTANT' ? 'Sending takes over from the assistant. ' : ''}Enter to send · Shift+Enter for a new line{c.isTest ? ' · test chat: nothing is sent' : ''}
          </div>
        </>
      )}
    </div>
  );
}

/** For test chats only: type as the customer to rehearse the flow end to end. */
function PlayCustomer({ c, onDone }: { c: ConversationSummary; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const play = async (receipt = false) => {
    if (!receipt && !text.trim()) return;
    setBusy(true);
    try {
      await api('/api/inbox/simulate', { method: 'POST', json: { phone: c.phone, name: c.profileName, text: receipt ? text || null : text, sampleReceipt: receipt, channelId: c.channel.id } });
      setText('');
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not play the message.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-[#d9c7a6] bg-[#fffaf1] px-3 py-2">
      <FlaskConical size={14} className="flex-shrink-0 text-amber" />
      <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && play()} placeholder="Reply as the customer (test)…" aria-label="Customer message" className="min-w-[12rem] flex-1 py-1.5 text-xs" />
      <Button size="sm" variant="secondary" busy={busy} onClick={() => play()}>Send as customer</Button>
      <Button size="sm" variant="ghost" onClick={() => play(true)} title="Send a sample receipt image" icon={<Paperclip size={13} />}>Receipt</Button>
    </div>
  );
}

function ThreadPane({ id, rev, onBack, onChanged }: { id: string; rev: number; onBack: () => void; onChanged: () => void }) {
  const session = useSession();
  const { data, setData, error, reload } = useLoad<Thread>(`/api/inbox/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    if (rev) reload();
  }, [rev, reload]);

  useEffect(() => {
    if (data?.conversation.unread) api(`/api/inbox/${id}`, { method: 'POST', json: { action: 'read' } }).catch(() => {});
  }, [data?.conversation.unread, id]);

  useEffect(() => {
    const n = data?.messages.length ?? 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }));
    }
  }, [data?.messages.length]);

  const act = async (action: 'take_over' | 'hand_back') => {
    setBusy(action);
    try {
      setData(await api<Thread>(`/api/inbox/${id}`, { method: 'POST', json: { action } }));
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong.', 'risk');
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="p-6"><Notice tone="risk">{error.message}</Notice></div>;
  if (!data) return <div className="space-y-3 p-6"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-16" /></div>;
  const c = data.conversation;
  const allowed = canTrade(session);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg p-1 text-muted hover:bg-[#eef4ec] lg:hidden cursor-pointer" aria-label="Back to conversations"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-ink">{c.displayName}</h2>
            <Pill><ChannelIcon kind={c.channel.kind} /> {c.channel.label}</Pill>
            {c.isTest && <Pill tone="waiting"><FlaskConical size={10} /> Test chat</Pill>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-mono">{c.phone}</span>
            {c.profileName && c.customer && c.profileName !== c.customer.name && <span>WhatsApp name “{c.profileName}”</span>}
            {c.customer ? (
              <Link href={`/customers/${c.customer.id}`} className="font-semibold text-brand hover:underline">{c.customer.ref} · {c.customer.kycStatus === 'VERIFIED' ? 'Verified' : c.customer.kycStatus === 'REJECTED' ? 'Rejected' : 'Not verified'}</Link>
            ) : (
              <span>New contact</span>
            )}
            {c.trade && (
              <Link href={`/trades/${c.trade.id}`} className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                {c.trade.ref} <StatusBadge status={c.trade.status} />
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WindowBadge c={c} />
          {allowed && c.mode === 'HUMAN' && (!c.trade || ['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(c.trade.status)) && (
            <Link href={`/trades/new?conversation=${c.id}`}>
              <Button size="sm" icon={<Receipt size={14} />}>Send a quote</Button>
            </Link>
          )}
          {allowed &&
            (c.mode === 'ASSISTANT' ? (
              <Button size="sm" variant="secondary" icon={<Headset size={14} />} busy={busy === 'take_over'} onClick={() => act('take_over')}>Take over</Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Bot size={14} />} busy={busy === 'hand_back'} onClick={() => act('hand_back')}>Hand back to assistant</Button>
            ))}
        </div>
      </div>

      {c.needsHuman ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1d4a6] bg-amber-bg px-4 py-2 text-xs text-[#6b3d00]">
          <span className="flex items-center gap-1.5"><Hand size={13} /> <strong>Needs you:</strong> {c.handoffReason ?? 'The assistant handed this chat over.'} The assistant is silent until you hand it back.</span>
          {allowed && <Button size="sm" variant="lime" busy={busy === 'take_over'} onClick={() => act('take_over')}>I’ve got it</Button>}
        </div>
      ) : (
        <div className="border-b border-line bg-[#f8faf7] px-4 py-1.5 text-[0.6875rem] text-muted">
          {c.mode === 'ASSISTANT' ? (
            <span className="inline-flex items-center gap-1.5"><Bot size={12} className="text-brand" /> The assistant is replying · {STEP_LABEL[c.step] ?? c.step}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5"><Headset size={12} className="text-brand" /> {c.assignedTo ? `${c.assignedTo.name} is handling this chat` : 'A person is handling this chat'}; the assistant is silent</span>
          )}
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f3f6f2] px-4 py-4">
        {data.messages.map((m, i) => {
          const prev = data.messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          return (
            <Fragment key={m.id}>
              {newDay && <div className="py-1 text-center text-[0.625rem] font-mono font-bold uppercase tracking-wider text-subtle">{dayLabel(m.createdAt)}</div>}
              <Bubble m={m} />
            </Fragment>
          );
        })}
      </div>

      {c.isTest && <PlayCustomer c={c} onDone={reload} />}
      <Composer thread={data} onSent={(t) => { setData(t); onChanged(); }} />
    </div>
  );
}

export function InboxView() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get('c');
  const [filter, setFilter] = useState<Filter>(() => (['all', 'needs_you', 'assistant', 'human'] as Filter[]).find((f) => f === params.get('filter')) ?? 'all');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const url = `/api/inbox?filter=${filter}${debounced.trim() ? `&q=${encodeURIComponent(debounced.trim())}` : ''}`;
  const { data, error, loading, reload } = useLoad<{ conversations: ConversationSummary[]; rev: number }>(url, { pollMs: 30_000 });
  const onChange = useCallback(() => {
    reload();
    setRev((r) => r + 1);
  }, [reload]);
  const live = useInboxStream(onChange);

  const open = (id: string | null) => router.replace(id ? `/inbox?c=${id}` : '/inbox', { scroll: false });
  const list = data?.conversations ?? [];
  const needs = useMemo(() => list.filter((c) => c.needsHuman).length, [list]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={live ? undefined : <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-subtle" /> Reconnecting…</span>}
        title="Inbox"
        subtitle="Every WhatsApp and SMS conversation with your customers. The assistant handles routine quotes; anything it hands over shows up here as “Needs you”."
        actions={<Link href="/whatsapp" className="text-sm font-semibold text-brand hover:underline">Numbers & test chats</Link>}
      />
      <Card className="grid h-[calc(100dvh-12.5rem)] min-h-[520px] overflow-hidden lg:grid-cols-[22rem_1fr]">
        <div className={cx('flex min-h-0 flex-col border-line lg:border-r', selected && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or trade ref" aria-label="Search conversations" className="pl-8" />
            </div>
            <Segmented<Filter>
              size="sm"
              value={filter}
              onChange={setFilter}
              className="w-full"
              options={[
                { value: 'all', label: 'All' },
                { value: 'needs_you', label: needs ? `Needs you (${needs})` : 'Needs you' },
                { value: 'assistant', label: 'Assistant' },
                { value: 'human', label: 'People' },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && <div className="p-4"><Notice tone="risk">{error.message}</Notice></div>}
            {loading && !data && <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
            {data && !list.length && (
              <Empty icon={<Inbox size={20} />} title={filter === 'needs_you' ? 'Nothing needs you' : 'No conversations yet'}>
                {filter === 'needs_you' ? 'When the assistant hands a chat over, it appears here.' : 'Connect a number on the WhatsApp page, or start a test chat there.'}
              </Empty>
            )}
            {list.map((c) => <ConversationRow key={c.id} c={c} active={c.id === selected} onOpen={() => open(c.id)} />)}
          </div>
        </div>
        <div className={cx('min-h-0', !selected && 'hidden lg:block')}>
          {selected ? (
            <ThreadPane key={selected} id={selected} rev={rev} onBack={() => open(null)} onChanged={reload} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Empty icon={<MessageSquare size={20} />} title="Pick a conversation">Messages, delivery ticks and handovers update live.</Empty>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
