import 'server-only';
import type { Db } from './db';
import type { Ctx } from './auth';
import { listSavers, susuOverview, type SaverSummary } from './susu';
import { askJev, probability } from '@/lib/jev';
import { chatComplete } from '@/lib/openrouter';
import { formatMinor } from '@/lib/money';
import { periodLabel } from '@/lib/susu';

/**
 * AI help for susu, always on top of computed facts:
 * - Nudge list: savers drifting off their routine, ranked. JEV (calibrated
 *   decisions) scores how likely each is to miss more days; if JEV is not
 *   available a simple rule ranks them instead. Scores are hints for a
 *   reminder call, never decisions about anyone's money.
 * - Month-end summary: a language model rewords the desk's own numbers only.
 */

export interface Nudge {
  saverId: string;
  name: string;
  phone: string | null;
  behindDays: number;
  daysSincePaid: number | null;
  risk: number;
  reason: string;
}

const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

function heuristic(s: SaverSummary): number {
  const behind = s.page?.standing.kind === 'behind' ? s.page.standing.days : 0;
  const expected = Math.max(s.page?.expected ?? 1, 1);
  const quiet = daysSince(s.lastPaidAt) ?? expected;
  return Math.min(0.99, Math.round((0.55 * Math.min(1, behind / Math.max(3, expected * 0.5)) + 0.45 * Math.min(1, quiet / 7)) * 100) / 100);
}

export async function nudgeList(db: Db, ctx: Ctx): Promise<{ nudges: Nudge[]; engine: 'jev' | 'rules' }> {
  const savers = (await listSavers(db, ctx)).filter((s) => s.status === 'ACTIVE' && s.page);
  const drifting = savers
    .map((s) => ({ s, behind: s.page!.standing.kind === 'behind' ? s.page!.standing.days : 0, quiet: daysSince(s.lastPaidAt) }))
    .filter((x) => x.behind >= 2 || (x.quiet !== null && x.quiet >= 3))
    .slice(0, 25);
  if (!drifting.length) return { nudges: [], engine: 'rules' };

  let scores: Record<string, number> = {};
  let engine: 'jev' | 'rules' = 'rules';
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const questions = Object.fromEntries(
        drifting.slice(0, 10).map((x, i) => [
          `s${i}`,
          {
            type: 'noul' as const,
            instructions: `Will this daily saver miss at least 3 of the next 7 days? Saves ${formatMinor(x.s.dailyMinor, x.s.currency)} a day; ${x.s.page!.daysPaid} of ${x.s.page!.expected} expected days paid this month; last paid ${x.quiet ?? 'never'} days ago; unbroken streak ${x.s.streak} days; saver for ${daysSince(x.s.createdAt)} days.`,
          },
        ]),
      );
      const answers = await askJev({ state: 'Daily susu savings group run by a small business in Ghana. Savers hand over cash daily; missed days can be caught up later in the month.', questions, timeoutMs: 8000 });
      drifting.slice(0, 10).forEach((x, i) => {
        const p = probability(answers[`s${i}`]);
        if (p !== null) scores[x.s.id] = p;
      });
      if (Object.keys(scores).length) engine = 'jev';
    } catch {
      scores = {};
    }
  }

  const nudges = drifting
    .map(({ s, behind, quiet }) => ({
      saverId: s.id,
      name: s.name,
      phone: s.phone,
      behindDays: behind,
      daysSincePaid: quiet,
      risk: scores[s.id] ?? heuristic(s),
      reason: [behind ? `${behind} day${behind === 1 ? '' : 's'} behind this month` : null, quiet !== null && quiet >= 2 ? `last paid ${quiet} days ago` : quiet === null ? 'no payment yet' : null].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => b.risk - a.risk);
  return { nudges, engine };
}

export async function susuSummary(db: Db, ctx: Ctx): Promise<{ text: string; facts: string[]; source: 'model' | 'facts'; model?: string }> {
  const savers = await listSavers(db, ctx);
  const o = await susuOverview(db, ctx, savers);
  const { nudges } = await nudgeList(db, ctx);
  const facts = [
    `${periodLabel(o.period)} so far: ${formatMinor(o.collectedThisMonthMinor, 'GHS')} collected; ${formatMinor(o.collectedTodayMinor, 'GHS')} today from ${o.paidTodayCount} saver${o.paidTodayCount === 1 ? '' : 's'}.`,
    `${o.savers.active} active savers: ${o.savers.onTrack} on track, ${o.savers.ahead} paid ahead, ${o.savers.behind} behind.`,
    `Held for savers right now: ${formatMinor(o.heldMinor, 'GHS')}.`,
    `Fees earned from pages closed this month: ${formatMinor(o.feesThisMonthMinor, 'GHS')}. Fees due when current pages close: ${formatMinor(o.feesDueMinor, 'GHS')}.`,
    o.pagesToClose ? `${o.pagesToClose} page${o.pagesToClose === 1 ? '' : 's'} from an ended month still need closing (cash out or roll over).` : 'No pages are waiting to be closed.',
    ...nudges.slice(0, 5).map((n) => `${n.name}: ${n.reason}.`),
  ];
  const plain = facts.map((f) => `- ${f}`).join('\n');
  if (!process.env.OPENROUTER_API_KEY) return { text: plain, facts, source: 'facts' };
  try {
    const res = await chatComplete({
      temperature: 0.1,
      maxTokens: 350,
      timeoutMs: 12000,
      messages: [
        { role: 'system', content: 'You write a short susu (daily savings) update for the owner of a small Ghanaian business. Use ONLY the facts given; never add numbers, names or advice they do not support. 3 to 5 short bullet points, most important first, plain English, warm but brief. No headings.' },
        { role: 'user', content: plain },
      ],
    });
    return { text: res.content, facts, source: 'model', model: res.model };
  } catch {
    return { text: plain, facts, source: 'facts' };
  }
}
