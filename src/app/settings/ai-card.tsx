'use client';

import { useEffect, useState } from 'react';
import { Bot, FlaskConical, Wallet } from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import type { AiOverview } from '@/server/ai/settings';
import { Button, Card, cx, Field, Input, Notice, Pill, Skeleton, toast } from '@/components/ui';
import { useSession } from '@/components/app-shell';

type TestResult = { text: string; ok: boolean; model: string | null; ms: number; reading: string | null; reply: string | null; error?: string };

/**
 * The desk's AI assistant: which OpenRouter model reads customer chat, whether
 * the account has credit, and a test on sample messages. Switching to a paid
 * model after topping up OpenRouter is just a model-name change here.
 */
export function AiCard() {
  const session = useSession();
  const owner = session.role === 'OWNER';
  const { data, setData } = useLoad<{ ai: AiOverview }>('/api/settings/ai');
  const [model, setModel] = useState('');
  const [fallbacks, setFallbacks] = useState('');
  const [readsChat, setReadsChat] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [results, setResults] = useState<TestResult[] | null>(null);

  useEffect(() => {
    if (!data) return;
    setModel(data.ai.own.model ?? '');
    setFallbacks(data.ai.own.fallbacks ?? '');
    setReadsChat(data.ai.readsChat);
  }, [data]);

  if (!data) return <Card className="p-5"><Skeleton className="h-40" /></Card>;
  const ai = data.ai;
  const acc = ai.account;
  const preset = ai.presets.find((p) => p.id === ai.models.model);
  const paid = !ai.models.model.endsWith(':free');
  const noCredit = acc.balanceUsd !== null && acc.balanceUsd <= 0;

  const save = async () => {
    setBusy('save');
    try {
      setData(await api<{ ai: AiOverview }>('/api/settings/ai', { method: 'PUT', json: { readsChat, model: model.trim() || null, fallbacks: fallbacks.trim() || null } }));
      toast('AI settings saved');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save.', 'risk');
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setResults(null);
    try {
      setResults((await api<{ results: TestResult[] }>('/api/settings/ai/test', { method: 'POST', json: { model: model.trim() || null } })).results);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Test failed.', 'risk');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-4 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Bot size={16} /> AI assistant</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The chat rules answer every message they understand, instantly and at no cost. When a customer writes something the rules can’t follow (Pidgin, typos, a long sentence), the AI model reads it and the rules act on what it read. The AI never sets a rate, confirms a payment or moves a trade, and it never sees phone or account numbers.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!acc.configured ? <Pill tone="risk">No API key</Pill> : !acc.keyWorks ? <Pill tone="risk">Key rejected</Pill> : <Pill tone="good">Connected</Pill>}
          <Pill tone={paid ? 'action' : 'neutral'}>{paid ? 'Paid model' : 'Free model'}</Pill>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-paper p-3">
          <div className="flex items-center gap-1.5 text-xs text-subtle"><Wallet size={13} /> OpenRouter balance</div>
          <div className={cx('mt-0.5 font-mono text-lg font-bold', noCredit ? 'text-amber' : 'text-ink')}>{acc.balanceUsd === null ? 'n/a' : `$${acc.balanceUsd.toFixed(2)}`}</div>
          <div className="text-xs text-subtle">{noCredit ? 'Top up to use paid models. Free models still work.' : 'Paid models draw from this.'}</div>
        </div>
        <div className="rounded-xl bg-paper p-3">
          <div className="text-xs text-subtle">Free requests today</div>
          <div className="mt-0.5 font-mono text-lg font-bold text-ink">{acc.freeRequests ? `${acc.freeRequests.used} / ${acc.freeRequests.limit}` : 'n/a'}</div>
          <div className="text-xs text-subtle">OpenRouter’s daily allowance for :free models.</div>
        </div>
        <div className="rounded-xl bg-paper p-3">
          <div className="text-xs text-subtle">Last 7 days</div>
          <div className="mt-0.5 font-mono text-lg font-bold text-ink">{ai.usage.usedLast7Days} of {ai.usage.readLast7Days}</div>
          <div className="text-xs text-subtle">messages rescued by AI{ai.usage.avgMs ? ` · avg ${(ai.usage.avgMs / 1000).toFixed(1)} s` : ''}{ai.usage.failedLast7Days ? ` · ${ai.usage.failedLast7Days} failed` : ''}</div>
        </div>
      </div>
      {acc.error && <Notice tone="risk">{acc.error}</Notice>}
      {ai.cooling.length > 0 && (
        <Notice tone="warn" title="Skipping for now">
          {ai.cooling.map((c) => `${c.model} (${c.code === 'RATE_LIMITED' ? 'busy' : c.code === 'UNAVAILABLE' ? 'not available' : c.code === 'NO_CREDIT' ? 'no credit' : 'failing'}, ${c.secondsLeft}s)`).join(' · ')}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Model" htmlFor="ai-model" hint={<>In use: <span className="font-mono">{ai.models.model}</span> ({ai.models.source === 'desk' ? 'this desk' : ai.models.source === 'environment' ? 'server default' : 'built-in default'}){preset ? `. ${preset.note}` : ''}</>}>
            <Input id="ai-model" mono list="ai-presets" value={model} onChange={(e) => setModel(e.target.value)} disabled={!owner} placeholder={ai.models.model} />
          </Field>
          <datalist id="ai-presets">{ai.presets.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.tier}</option>)}</datalist>
          <Field label="Fallback models" htmlFor="ai-fb" optional hint="Tried in order when the model is busy or unavailable. Comma-separated.">
            <Input id="ai-fb" mono value={fallbacks} onChange={(e) => setFallbacks(e.target.value)} disabled={!owner} placeholder={ai.models.fallbacks.join(', ')} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={readsChat} onChange={(e) => setReadsChat(e.target.checked)} disabled={!owner} className="h-4 w-4 accent-[#175b3b]" />
            Let AI read customer messages the rules don’t understand
          </label>
          <div className="flex flex-wrap gap-2">
            {owner && <Button busy={busy === 'save'} onClick={save}>Save</Button>}
            <Button variant="secondary" icon={<FlaskConical size={15} />} busy={busy === 'test'} onClick={test} disabled={!acc.configured}>Test on sample messages</Button>
          </div>
          {!owner && <p className="text-xs text-subtle">Only a desk owner can change the model.</p>}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink">Models to choose from</div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {ai.presets.map((p) => (
              <li key={p.id}>
                <button type="button" disabled={!owner} onClick={() => setModel(p.id)} className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[#f6f9f5] disabled:cursor-default">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{p.label}</span>
                    <span className="block text-xs text-subtle">{p.note}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Pill tone={p.tier === 'free' ? 'neutral' : 'action'}>{p.tier}</Pill>
                    {p.price && <span className="mt-0.5 block font-mono text-[0.625rem] text-subtle">${p.price[0]} / ${p.price[1]} per 1M</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {results && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink">Test results (nothing was saved or sent)</div>
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {results.map((r) => (
              <li key={r.text} className="space-y-0.5 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">“{r.text}”</span>
                  <span className="shrink-0 font-mono text-[0.625rem] text-subtle">{r.model ?? 'no model'} · {(r.ms / 1000).toFixed(1)} s</span>
                </div>
                {r.ok ? <div className="text-xs text-brand">Read as: {r.reading}</div> : <div className="text-xs text-risk">{r.error ?? 'No usable reading.'}</div>}
                {r.reply && <div className="text-xs text-muted">Assistant would reply: {r.reply.slice(0, 160)}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
