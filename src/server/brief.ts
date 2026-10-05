import type { Db } from './db';
import type { Ctx } from './auth';
import { listRails } from './desk';
import { getInsights } from './insights';
import { queueCounts } from './trades';
import { formatMinor } from '@/lib/money';
import { STATUS_META, type TradeStatus } from '@/lib/trades';
import { chatComplete } from '@/lib/openrouter';

/**
 * The desk brief: a short written summary of the desk's own numbers.
 * Facts are computed first and always shown. A language model may only
 * rephrase them; if it is unavailable the facts are written out directly.
 */
export interface Brief {
  facts: string[];
  text: string;
  source: 'model' | 'facts';
  model?: string;
  generatedAt: string;
}

export async function buildFacts(db: Db, ctx: Ctx): Promise<string[]> {
  const [counts, rails, today, month] = await Promise.all([queueCounts(db, ctx), listRails(db, ctx), getInsights(db, ctx, 1), getInsights(db, ctx, 30)]);
  const facts: string[] = [];
  const open = Object.entries(counts) as [TradeStatus, { n: number; withEvidence: number }][];
  if (!open.length) facts.push('No open trades right now.');
  for (const [status, c] of open) {
    facts.push(`${c.n} trade${c.n === 1 ? '' : 's'} ${STATUS_META[status].label.toLowerCase()}${status === 'AWAITING_FUNDS' && c.withEvidence ? ` (${c.withEvidence} with customer proof to check against the statement)` : ''}.`);
  }
  facts.push(`Today: ${today.completed} completed, ${formatMinor(today.volumeNgnMinor, 'NGN')} and ${formatMinor(today.volumeGhsMinor, 'GHS')} moved, spread earned ${formatMinor(today.spreadNgnMinor, 'NGN')}.`);
  facts.push(`Last 30 days: ${month.completed} completed; ${month.funnel.quoted} quotes, ${month.funnel.accepted} accepted, ${month.funnel.expired} expired.`);
  if (month.medianMinutes.total !== null) facts.push(`Median time from quote to payout over 30 days: ${month.medianMinutes.total} minutes.`);
  // Account balances are private to the desk and not tracked here; only flag missing accounts.
  const active = rails.filter((x) => x.status === 'ACTIVE');
  for (const c of ['NGN', 'GHS'] as const) {
    if (!active.some((r) => r.currency === c && r.canCollect)) facts.push(`No active ${c} account to receive payments.`);
    if (!active.some((r) => r.currency === c && r.canPay)) facts.push(`No active ${c} account to pay out from.`);
  }
  return facts;
}

export async function deskBrief(db: Db, ctx: Ctx): Promise<Brief> {
  const facts = await buildFacts(db, ctx);
  const generatedAt = new Date().toISOString();
  if (!process.env.OPENROUTER_API_KEY) return { facts, text: facts.map((f) => `- ${f}`).join('\n'), source: 'facts', generatedAt };
  try {
    const res = await chatComplete({
      temperature: 0.1,
      maxTokens: 400,
      timeoutMs: 12000,
      messages: [
        {
          role: 'system',
          content:
            'You write a short operations brief for a currency desk team lead. Use ONLY the facts provided. Do not add numbers, names, risks or recommendations that are not directly supported by a fact. Do not mention fraud unless a fact does. 3 to 6 bullet points in plain English, most urgent first. No headings.',
        },
        { role: 'user', content: facts.map((f) => `- ${f}`).join('\n') },
      ],
    });
    return { facts, text: res.content, source: 'model', model: res.model, generatedAt };
  } catch {
    return { facts, text: facts.map((f) => `- ${f}`).join('\n'), source: 'facts', generatedAt };
  }
}
