'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookCheck, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { formatMinor, minorToMajorString, parseMajor } from '@/lib/money';
import { canApprove } from '@/lib/auth';
import { clock, dateTime } from '@/lib/time';
import type { DayCloseRail } from '@/server/day-close';
import { Button, Card, cx, Empty, Field, Input, Notice, PageHeader, Skeleton, Textarea, toast } from '@/components/ui';
import { useSession } from '@/components/app-shell';

type Day = { date: string; timezone: string; rails: DayCloseRail[] };

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function safeParse(v: string): number | null {
  try {
    return v.trim() ? parseMajor(v) : null;
  } catch {
    return null;
  }
}

function RailClose({ r, date, editable, onClosed }: { r: DayCloseRail; date: string; editable: boolean; onClosed: (d: Day) => void }) {
  const [sin, setSin] = useState(minorToMajorString(r.expectedInMinor));
  const [sout, setSout] = useState(minorToMajorString(r.expectedOutMinor));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSin(minorToMajorString(r.expectedInMinor));
    setSout(minorToMajorString(r.expectedOutMinor));
  }, [r.expectedInMinor, r.expectedOutMinor]);
  const pin = safeParse(sin);
  const pout = safeParse(sout);
  const diffIn = pin === null ? null : pin - r.expectedInMinor;
  const diffOut = pout === null ? null : pout - r.expectedOutMinor;
  const mismatch = (diffIn ?? 0) !== 0 || (diffOut ?? 0) !== 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{r.label}</h2>
          <div className="text-xs text-subtle">{r.items.length} movement{r.items.length === 1 ? '' : 's'} recorded in Aksen</div>
        </div>
        {r.closed && <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand"><CheckCircle2 size={14} /> Closed</span>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-paper p-3"><div className="text-xs text-subtle">Aksen: money in</div><div className="font-mono font-semibold">{formatMinor(r.expectedInMinor, r.currency)}</div></div>
        <div className="rounded-xl bg-paper p-3"><div className="text-xs text-subtle">Aksen: money out</div><div className="font-mono font-semibold">{formatMinor(r.expectedOutMinor, r.currency)}</div></div>
      </div>
      {r.items.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-brand">Show movements</summary>
          <ul className="mt-2 divide-y divide-line">
            {r.items.map((i, k) => (
              <li key={k} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0"><Link href={`/trades/${i.tradeId}`} className="font-mono font-semibold text-ink hover:text-brand">{i.tradeRef}</Link> <span className="text-subtle">· {i.kind === 'IN' ? 'credit' : i.kind === 'REFUND' ? 'refund' : 'payout'} {i.reference} · {clock(i.at)}</span></span>
                <span className={cx('font-mono tabular', i.kind === 'IN' ? 'text-brand' : 'text-ink')}>{i.kind === 'IN' ? '+' : '−'}{formatMinor(i.amountMinor, r.currency)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.closed ? (
        <div className="mt-4 space-y-1 rounded-xl border border-line p-3 text-xs text-muted">
          <div>Statement in <span className="font-mono text-ink">{formatMinor(r.closed.statementInMinor, r.currency)}</span> · out <span className="font-mono text-ink">{formatMinor(r.closed.statementOutMinor, r.currency)}</span></div>
          {(r.closed.statementInMinor !== r.expectedInMinor || r.closed.statementOutMinor !== r.expectedOutMinor) && <div className="font-semibold text-amber">Difference recorded: {r.closed.note}</div>}
          <div suppressHydrationWarning>Closed by {r.closed.closedBy} · {dateTime(r.closed.closedAt)}</div>
        </div>
      ) : editable ? (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const d = await api<{ day: Day }>('/api/reconcile', { method: 'POST', json: { date, railId: r.railId, statementIn: sin, statementOut: sout, note: note || null } });
              onClosed(d.day);
              toast(`${r.label} closed for ${date}`);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-muted">Type the totals from the real statement for this day.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statement: in" htmlFor={`in-${r.railId}`} error={diffIn ? `${diffIn > 0 ? '+' : ''}${formatMinor(diffIn, r.currency)} vs Aksen` : null}><Input id={`in-${r.railId}`} mono value={sin} onChange={(e) => setSin(e.target.value)} /></Field>
            <Field label="Statement: out" htmlFor={`out-${r.railId}`} error={diffOut ? `${diffOut > 0 ? '+' : ''}${formatMinor(diffOut, r.currency)} vs Aksen` : null}><Input id={`out-${r.railId}`} mono value={sout} onChange={(e) => setSout(e.target.value)} /></Field>
          </div>
          {mismatch && <Field label="Explain the difference" htmlFor={`note-${r.railId}`}><Textarea id={`note-${r.railId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bank charge ₦50; credit for AK-… not yet recorded" /></Field>}
          {error && <Notice tone="risk">{error}</Notice>}
          <Button type="submit" busy={busy} variant={mismatch ? 'secondary' : 'primary'} disabled={pin === null || pout === null || (mismatch && note.trim().length < 5)}>{mismatch ? 'Close with difference' : 'Matches. Close account for the day'}</Button>
        </form>
      ) : null}
    </Card>
  );
}

export function ReconcileView() {
  const session = useSession();
  const [date, setDate] = useState<string | null>(null);
  const { data, setData, loading } = useLoad<{ day: Day; today: string }>(`/api/reconcile${date ? `?date=${date}` : ''}`);
  const day = data?.day;
  const current = day?.date ?? date ?? '';
  const done = day ? day.rails.filter((r) => r.closed).length : 0;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Day close"
        subtitle="Compare what Aksen recorded with your real statements, account by account. Differences are kept with an explanation on the audit trail."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" aria-label="Previous day" onClick={() => setDate(shift(current, -1))} disabled={!current}><ChevronLeft size={15} /></Button>
            <Input type="date" value={current} max={data?.today} onChange={(e) => setDate(e.target.value)} aria-label="Business date" className="!w-auto" />
            <Button variant="secondary" size="sm" aria-label="Next day" onClick={() => setDate(shift(current, 1))} disabled={!current || current >= (data?.today ?? '')}><ChevronRight size={15} /></Button>
          </div>
        }
      />
      {!canApprove(session) && <Notice tone="info">Only admins can close a day. You can review the movements.</Notice>}
      {day && <div className="text-xs text-muted">{done} of {day.rails.length} accounts closed for {day.date} ({day.timezone.replace('Africa/', '')} time).</div>}
      {loading && !data ? <Skeleton className="h-64" /> : !day?.rails.length ? (
        <Card><Empty icon={<BookCheck size={20} />} title="No accounts to close">Add accounts on the Accounts page first.</Empty></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {day.rails.map((r) => <RailClose key={`${day.date}-${r.railId}`} r={r} date={day.date} editable={canApprove(session)} onClosed={(d) => setData({ day: d, today: data!.today })} />)}
        </div>
      )}
    </div>
  );
}
