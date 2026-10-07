'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { CalendarCheck, Flame, PiggyBank, Plus, RefreshCw, Search, Sparkles, Phone, Wand2 } from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import { canTrade } from '@/lib/auth';
import { cedis, periodLabel, splitCash } from '@/lib/susu';
import { timeAgo } from '@/lib/time';
import { useSession } from '@/components/app-shell';
import { Button, Card, cx, Dialog, Empty, Field, Input, Notice, PageHeader, Pill, Segmented, Select, Skeleton, Textarea, toast } from '@/components/ui';
import type { ParsedLine, SaverSummary, SusuOverview } from '@/server/susu';
import type { Nudge } from '@/server/susu-ai';

type Data = { savers: SaverSummary[]; overview: SusuOverview };

/** "Ama 50" → whole numbers of cedis; accepts 50, 50.00, GH₵50. */
function toMinor(v: string): number | null {
  const m = v.replace(/[^\d.]/g, '');
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function StandingPill({ s }: { s: SaverSummary }) {
  if (!s.page) return <Pill tone="done">No page</Pill>;
  const st = s.page.standing;
  if (st.kind === 'behind') return <Pill tone={st.days >= 3 ? 'risk' : 'waiting'}>{st.days} day{st.days === 1 ? '' : 's'} behind</Pill>;
  if (st.kind === 'ahead') return <Pill tone="good">{st.days} day{st.days === 1 ? '' : 's'} ahead</Pill>;
  return <Pill tone="good">On track</Pill>;
}

/** Thin bar of the page's boxes: filled, and a tick where they should be by today. */
function PageBar({ s }: { s: SaverSummary }) {
  if (!s.page) return null;
  const p = s.page;
  const pct = p.capacity ? (p.daysPaid / p.capacity) * 100 : 0;
  const exp = p.capacity ? (p.expected / p.capacity) * 100 : 0;
  return (
    <div className="w-full min-w-[7rem]">
      <div className="relative h-2 overflow-hidden rounded-full bg-[#eef4ec]">
        <div className={cx('h-full rounded-full', p.standing.kind === 'behind' ? 'bg-amber' : 'bg-brand')} style={{ width: `${pct}%` }} />
        {exp > 0 && exp < 100 && <span className="absolute top-0 h-full w-0.5 bg-ink/40" style={{ left: `${exp}%` }} title="Where they should be by today" />}
      </div>
      <div className="mt-1 text-[0.6875rem] text-subtle">{p.daysPaid} of {p.capacity} days</div>
    </div>
  );
}

function Tile({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: 'good' | 'amber' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs font-semibold text-muted">{label}<span className="text-subtle">{icon}</span></div>
      <div className={cx('mt-1 font-mono text-2xl font-bold tabular', tone === 'good' ? 'text-brand' : tone === 'amber' ? 'text-amber' : 'text-ink')}>{value}</div>
      <div className="mt-0.5 line-clamp-2 text-xs text-subtle">{sub}</div>
    </Card>
  );
}

function AddSaver({ today, onClose, onSaved }: { today: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [daily, setDaily] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>('/api/susu', { method: 'POST', json: { name, phone: phone || null, daily, notes: notes || null, smsEnabled: !!phone && smsEnabled } });
      toast(`${name.split(' ')[0]} added`);
      onSaved(r.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the saver.');
    } finally {
      setBusy(false);
    }
  };
  const [year, month, day] = today.split('-').map(Number);
  const left = new Date(Date.UTC(year, month, 0)).getUTCDate() - day + 1;
  return (
    <Dialog open onClose={onClose} title="Add a saver" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save} disabled={name.trim().length < 2 || !toMinor(daily)}>Add saver</Button></>}>
      <div className="space-y-4">
        <Field label="Full name" htmlFor="sv-name"><Input id="sv-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Daily contribution (GH₵)" htmlFor="sv-daily"><Input id="sv-daily" mono inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="10" /></Field>
          <Field label="Phone" htmlFor="sv-phone" optional><Input id="sv-phone" mono value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 412 3456" /></Field>
        </div>
        <Field label="Notes" htmlFor="sv-notes" optional><Input id="sv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Shop at Makola, collect after 4pm" /></Field>
        <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" className="mt-1" checked={smsEnabled} disabled={!phone} onChange={e => setSmsEnabled(e.target.checked)} /><span>Send welcome and savings receipts to this number. Confirm it belongs to the saver. SMS must also be enabled in Settings.</span></label>
        {toMinor(daily) && (
          <div className="rounded-xl bg-paper p-4 text-sm">
            <div className="mb-2 font-semibold text-ink">This month’s booklet, if they contribute every day</div>
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-muted">Days left this month (from today)</dt><dd className="font-mono tabular text-ink">{left}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Saved: {left} × {cedis(toMinor(daily)!)}</dt><dd className="font-mono tabular text-ink">{cedis(toMinor(daily)! * left)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Collection fee: one day’s contribution</dt><dd className="font-mono tabular text-ink">− {cedis(toMinor(daily)!)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-line pt-1"><dt className="font-semibold text-ink">Available for payout at month end</dt><dd className="font-mono font-semibold tabular text-ink">{cedis(toMinor(daily)! * (left - 1))}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-subtle">From next month each page covers the whole month (28–31 days). Missed days just mean fewer days saved; the fee is still one day.</p>
          </div>
        )}
        {error && <Notice tone="risk">{error}</Notice>}
      </div>
    </Dialog>
  );
}

function OneCollection({ savers, onSaved }: { savers: SaverSummary[]; onSaved: () => void }) {
  const active = savers.filter((s) => s.status === 'ACTIVE');
  const [saverId, setSaverId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const saver = active.find((s) => s.id === saverId);
  const minor = toMinor(amount);
  const daily = saver?.page?.dailyMinor ?? saver?.dailyMinor ?? 0;
  const split = saver && minor ? splitCash(minor, daily) : null;
  const save = async () => {
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const r = await api<{ result: { days: number; changeMinor: number; name: string } }>(`/api/susu/${saverId}`, { method: 'POST', json: { action: 'collect', amount, requestId: requestId.current } });
      toast(`${r.result.name.split(' ')[0]}: ${r.result.days} day${r.result.days === 1 ? '' : 's'} recorded${r.result.changeMinor ? ` · give back ${cedis(r.result.changeMinor)}` : ''}${saver?.smsEnabled ? ' · SMS draft ready on their page' : ''}`);
      requestId.current = null;
      setAmount('');
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not record.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="@container space-y-3">
      <div className="grid gap-3 @md:grid-cols-[minmax(0,1fr)_9rem_auto] @md:items-end">
        <Field label="Saver" htmlFor="c-saver">
          <Select id="c-saver" value={saverId} onChange={(e) => { requestId.current = null; setSaverId(e.target.value); }}>
            <option value="">Choose a saver</option>
            {active.map((s) => <option key={s.id} value={s.id}>{s.name} · {cedis(s.page?.dailyMinor ?? s.dailyMinor)}/day</option>)}
          </Select>
        </Field>
        <Field label="Cash received" htmlFor="c-amt"><Input id="c-amt" mono inputMode="decimal" value={amount} onChange={(e) => { requestId.current = null; setAmount(e.target.value); }} placeholder="GH₵" onKeyDown={(e) => e.key === 'Enter' && split?.days && save()} /></Field>
        <Button busy={busy} disabled={!saver || !split?.days} onClick={save}>Record</Button>
      </div>
      {saver && minor && split && (
        <p className={cx('text-xs', split.days ? 'text-muted' : 'text-risk')}>
          {split.days
            ? <>That’s <strong className="text-ink">{split.days} day{split.days === 1 ? '' : 's'}</strong>{split.changeMinor ? <> · give back <strong className="text-amber">{cedis(split.changeMinor)}</strong> change</> : null}{saver.page && split.days > saver.page.capacity - saver.page.daysPaid ? ' · extra days go onto next month’s page' : ''}.</>
            : `Less than one day (${cedis(daily)}).`}
        </p>
      )}
    </div>
  );
}

function RoundEntry({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('');
  const [lines, setLines] = useState<ParsedLine[] | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const check = async () => {
    setBusy(true);
    try {
      const d = await api<{ lines: ParsedLine[] }>('/api/susu/collect', { method: 'POST', json: { preview: text } });
      setLines(d.lines);
      setPicks({});
      requestId.current = null;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not read that.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  const checked = (lines ?? []).map((l, i) => {
    const picked = l.candidates.find((c) => c.id === picks[i]);
    const saverId = l.saverId ?? picked?.id;
    const split = picked && l.amountMinor ? splitCash(l.amountMinor, picked.dailyMinor) : { days: l.days, changeMinor: l.changeMinor };
    return { l, saverId, split, ready: Boolean(saverId && l.amountMinor && split.days > 0 && (!l.problem || picked)) };
  });
  const ready = checked.filter((x) => x.ready);
  const allReady = checked.length > 0 && ready.length === checked.length;
  const save = async () => {
    setBusy(true);
    try {
      if (!allReady) return;
      requestId.current ??= crypto.randomUUID();
      const d = await api<{ results: { days: number; changeMinor: number; name: string }[] }>('/api/susu/collect', { method: 'POST', json: { rows: ready.map((r) => ({ saverId: r.saverId, amount: (r.l.amountMinor! / 100).toFixed(2) })), requestId: requestId.current } });
      const change = d.results.filter((r) => r.changeMinor > 0);
      toast(`${d.results.length} collection${d.results.length === 1 ? '' : 's'} recorded${change.length ? ` · give change to ${change.map((c) => `${c.name.split(' ')[0]} ${cedis(c.changeMinor)}`).join(', ')}` : ''} · SMS drafts are ready on saver pages`);
      setText('');
      setLines(null);
      requestId.current = null;
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Nothing was saved.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {!lines ? (
        <>
          <Textarea rows={4} value={text} onChange={(e) => { requestId.current = null; setText(e.target.value); }} placeholder={'Type or paste the round, one per line or separated by commas:\nAma 50\nKofi 30, Esi 100'} aria-label="Collection round" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-subtle">First names are enough. You’ll check every line before anything is saved.</p>
            <Button variant="secondary" busy={busy} disabled={!text.trim()} onClick={check} icon={<Wand2 size={14} />}>Check the round</Button>
          </div>
        </>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{l.saverName ?? (l.candidates.length ? '' : '—')}</span>
                  {l.candidates.length > 0 && (
                    <Select aria-label={`Who is “${l.line}”?`} value={picks[i] ?? ''} onChange={(e) => { requestId.current = null; setPicks({ ...picks, [i]: e.target.value }); }} className="py-1 text-xs">
                      <option value="">Which one?</option>
                      {l.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ref})</option>)}
                    </Select>
                  )}
                  <span className="ml-2 font-mono text-xs text-subtle">“{l.line}”</span>
                </span>
                <span className={cx('text-xs', !checked[i].ready ? 'text-risk' : 'text-muted')}>
                  {!checked[i].ready ? (picks[i] && checked[i].split.days === 0 ? 'Less than one day for this saver.' : l.problem) : <>{l.amountMinor ? cedis(l.amountMinor) : ''} = {checked[i].split.days} day{checked[i].split.days === 1 ? '' : 's'}{checked[i].split.changeMinor ? <> · <span className="text-amber">change {cedis(checked[i].split.changeMinor)}</span></> : null}</>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!allReady && <span className="mr-auto text-xs text-risk">Resolve or edit every line before saving this round.</span>}
            <Button variant="ghost" onClick={() => { requestId.current = null; setLines(null); }}>Edit</Button>
            <Button busy={busy} disabled={!allReady} onClick={save}>Save {ready.length} collection{ready.length === 1 ? '' : 's'}</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Nudges() {
  const { data, loading } = useLoad<{ nudges: Nudge[]; engine: 'jev' | 'rules' }>('/api/susu/insights');
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Sparkles size={15} className="text-brand" /> Needs a nudge</h2>
        {data && <span className="text-[0.625rem] text-subtle">{data.engine === 'jev' ? 'Ranked by JEV' : 'Ranked by routine'}</span>}
      </div>
      {loading && !data ? <Skeleton className="mt-3 h-20" /> : !data?.nudges.length ? (
        <p className="mt-2 text-xs text-muted">Nobody needs a call yet. Savers show up here once they are 2 days behind or haven’t paid for 3 days, most at risk first.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {data.nudges.slice(0, 6).map((n) => (
            <li key={n.saverId} className="flex items-center gap-3 py-2.5">
              <span className={cx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-mono text-[0.6875rem] font-bold', n.risk >= 0.6 ? 'bg-risk-bg text-risk' : 'bg-amber-bg text-amber')} title="How likely they are to miss more days">{Math.round(n.risk * 100)}%</span>
              <Link href={`/susu/${n.saverId}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{n.name}</span>
                <span className="block truncate text-xs text-muted">{n.reason}</span>
              </Link>
              {n.phone && <a href={`tel:${n.phone}`} className="rounded-lg p-1.5 text-brand hover:bg-[#eef4ec]" aria-label={`Call ${n.name}`}><Phone size={15} /></a>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SummaryButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<{ text: string; facts: string[]; source: 'model' | 'facts'; model?: string } | null>(null);
  const run = async () => {
    setOpen(true);
    setBusy(true);
    try {
      setS((await api<{ summary: NonNullable<typeof s> }>('/api/susu/insights', { method: 'POST' })).summary);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not build the summary.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" icon={<Sparkles size={15} />} onClick={run}>Summarise</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Susu this month" footer={<Button variant="secondary" busy={busy} onClick={run} icon={<RefreshCw size={14} />}>Refresh</Button>}>
        {busy && !s ? <div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div> : s && (
          <div className="space-y-3">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{s.text}</div>
            <p className="text-[0.6875rem] text-subtle">{s.source === 'model' ? `Worded by ${s.model} from your own numbers only.` : 'Written straight from your records.'}</p>
          </div>
        )}
      </Dialog>
    </>
  );
}

export function SusuView() {
  const session = useSession();
  const [q, setQ] = useState('');
  const { data, loading, reload } = useLoad<Data>('/api/susu', { pollMs: 30_000 });
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'one' | 'round'>('one');
  const allowed = canTrade(session);
  const o = data?.overview;
  const savers = useMemo(() => {
    const all = data?.savers ?? [];
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => x.name.toLowerCase().includes(s) || x.ref.toLowerCase().includes(s) || (x.phone ?? '').includes(s)) : all;
  }, [data, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={o ? periodLabel(o.period) : 'Susu'}
        title="Susu savings"
        subtitle="Record daily contributions in each saver’s booklet. One day’s contribution is the collection fee when a page closes."
        actions={
          <>
            <SummaryButton />
            <Link href="/susu/close"><Button variant="secondary" icon={<CalendarCheck size={15} />}>Month-end closing{o?.pagesToClose ? ` (${o.pagesToClose})` : ''}</Button></Link>
            {allowed && <Button icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add saver</Button>}
          </>
        }
      />

      {!o ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-24" />)}</div> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Contributions today" value={cedis(o.collectedTodayMinor)} sub={o.paidTodayCount ? `from ${o.paidTodayCount} saver${o.paidTodayCount === 1 ? '' : 's'}` : 'No contributions yet today'} icon={<PiggyBank size={15} />} tone={o.collectedTodayMinor ? 'good' : undefined} />
          <Tile label="Held for savers" value={cedis(o.heldMinor)} sub="Everything saved and not yet paid out" icon={<PiggyBank size={15} />} />
          <Tile label="Collection fees" value={cedis(o.feesThisMonthMinor)} sub={`earned this month · ${cedis(o.feesDueMinor)} estimated on open pages`} icon={<CalendarCheck size={15} />} />
          <Tile label="On track" value={`${o.savers.onTrack + o.savers.ahead} of ${o.savers.active}`} sub={o.savers.behind ? `${o.savers.behind} behind this month` : o.savers.active ? 'Nobody behind' : 'Add your first saver'} icon={<Flame size={15} />} tone={o.savers.behind ? 'amber' : undefined} />
        </div>
      )}
      {o && o.pagesToClose > 0 && (
        <Notice tone="warn" title={`${o.pagesToClose} page${o.pagesToClose === 1 ? '' : 's'} from last month still open`}>
          Finish them in <Link href="/susu/close" className="font-semibold underline">month-end closing</Link>: pay out or roll each balance over. Today’s contributions go onto this month’s pages either way.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {allowed && (data?.savers.length ?? 0) > 0 && (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-ink">Record contributions</h2>
                <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'one', label: 'One saver' }, { value: 'round', label: 'Collection round' }]} />
              </div>
              {mode === 'one' ? <OneCollection savers={data!.savers} onSaved={reload} /> : <RoundEntry onSaved={reload} />}
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
              <h2 className="text-sm font-bold text-ink">Savers {data ? <span className="font-normal text-subtle">· {data.savers.length}</span> : null}</h2>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, S-number or phone" aria-label="Search savers" className="pl-8" />
              </div>
            </div>
            {loading && !data ? <div className="p-4"><Skeleton className="h-40" /></div> : !data?.savers.length ? (
              <Empty icon={<PiggyBank size={20} />} title="No savers yet" action={allowed && <Button size="sm" onClick={() => setAdding(true)}>Add your first saver</Button>}>
                Add each saver with the amount they save every day. Their booklet starts today.
              </Empty>
            ) : (
              <ul className="@container divide-y divide-line">
                {savers.map((s) => (
                  <li key={s.id}>
                    <Link href={`/susu/${s.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-[#f6f9f5] @md:grid-cols-[minmax(0,1fr)_auto_auto] @xl:grid-cols-[minmax(0,1.4fr)_minmax(7rem,1fr)_auto_auto]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
                        <span className="block truncate text-xs text-subtle">{s.ref} · {cedis(s.page?.dailyMinor ?? s.dailyMinor)}/day{s.status !== 'ACTIVE' ? ` · ${s.status.toLowerCase()}` : ''}{s.lastPaidAt ? <span suppressHydrationWarning> · paid {timeAgo(s.lastPaidAt)}</span> : ''}</span>
                      </span>
                      <span className="hidden @xl:block"><PageBar s={s} /></span>
                      <span className="text-right">
                        <span className="block font-mono text-sm font-semibold tabular text-ink">{cedis(s.heldMinor)}</span>
                        {s.streak > 0 && <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-amber"><Flame size={11} /> {s.streak} day{s.streak === 1 ? '' : 's'}</span>}
                      </span>
                      <span className="col-span-2 @md:col-span-1 @md:justify-self-end"><StandingPill s={s} /></span>
                    </Link>
                  </li>
                ))}
                {!savers.length && <li className="px-4 py-6 text-center text-sm text-subtle">No saver matches “{q}”.</li>}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Nudges />
          <Card className="p-4 text-xs leading-relaxed text-muted">
            <h2 className="mb-1.5 text-sm font-bold text-ink">How the booklet works</h2>
            <ul className="list-disc space-y-1 pl-4">
              <li>Cash fills whole days. Amounts that don’t make a whole day are given back as change.</li>
              <li>Savers can pay for several days at once or catch up missed days. Extra days go onto next month’s page.</li>
              <li>Closing a page takes one day’s contribution as the collection fee. 31 days of GH₵10 = GH₵310, with GH₵300 available for payout or rollover.</li>
              <li>At month end each balance is paid out or rolled over. Rolled-over money is never charged again.</li>
            </ul>
          </Card>
        </div>
      </div>
      {adding && o && <AddSaver today={o.today} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); window.location.href = `/susu/${id}`; }} />}
    </div>
  );
}
