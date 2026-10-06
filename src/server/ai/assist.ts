import * as A from '../assistant';
import { canonicalText, describeReading, groundReading, maskNumbers, readingPrompt, type Reading } from './reader';

/**
 * Rules first, AI only when the rules are stuck.
 *
 * The rule-based assistant answers every message it understands, instantly and
 * for free. Only a message it would re-ask or hand over for (a "miss") is
 * read by the language model. If the model's reading turns into something the
 * rules can act on, the customer gets that answer instead of "sorry?". If not
 * (or the model is slow, rate-limited or unpaid), the original answer stands.
 */

/** What we keep about an AI reading, shown to operators under the customer's message. */
export interface AiNote {
  status: 'used' | 'not_needed_by_rules' | 'unclear' | 'failed';
  model: string | null;
  ms: number;
  reading: string | null;
  summary: string | null;
  error?: string;
}

export type Complete = (messages: { role: 'system' | 'user'; content: string }[]) => Promise<{ content: string; model: string }>;

export function isMiss(before: A.BotState | null | undefined, d: A.Decision): boolean {
  return (d.state.misses ?? 0) > (before?.misses ?? 0) || d.handoff === A.NOT_UNDERSTOOD;
}

export async function decideWithAi(
  input: { text: string; media: A.Media; state: A.BotState | null | undefined; facts: A.Facts; lastReply?: string | null },
  complete: Complete | null,
): Promise<{ decision: A.Decision; ai: AiNote | null }> {
  const base = A.decide(input);
  if (!complete || input.media !== 'none' || !input.text.trim() || !isMiss(input.state, base)) return { decision: base, ai: null };

  const step = ({ ...A.FRESH, ...(input.state ?? {}) } as A.BotState).step;
  const { masked, numbers } = maskNumbers(input.text);
  const started = Date.now();
  let reading: Reading | null = null;
  let model: string | null = null;
  try {
    const res = await complete(readingPrompt({ maskedText: masked, step, lastReply: input.lastReply ?? null }));
    model = res.model;
    reading = groundReading(res.content, { text: input.text, numbers });
  } catch (e) {
    return { decision: base, ai: { status: 'failed', model, ms: Date.now() - started, reading: null, summary: null, error: (e as Error).message?.slice(0, 160) } };
  }
  const ms = Date.now() - started;
  if (!reading) return { decision: base, ai: { status: 'failed', model, ms, reading: null, summary: null, error: 'The model did not return a usable reading.' } };

  const note = (status: AiNote['status']): AiNote => ({ status, model, ms, reading: describeReading(reading!), summary: reading!.summary || null });
  const phrase = canonicalText(reading, step);
  if (!phrase) return { decision: base, ai: note('unclear') };

  const retry = A.decide({ ...input, text: phrase });
  if (isMiss(input.state, retry)) return { decision: base, ai: note('not_needed_by_rules') };

  if (reading.intent === 'complaint' && retry.handoff) retry.handoff = `Customer sounds upset (read by AI)${reading.summary ? `: ${reading.summary}` : ''}`;
  else if (retry.handoff && reading.summary) retry.handoff = `${retry.handoff}. AI summary: ${reading.summary}`;
  return { decision: retry, ai: note('used') };
}
