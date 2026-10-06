/**
 * JEV: OpenRouter's Decisions API (model typesafe/jev-1.13).
 *
 * Instead of free text, JEV answers typed questions about a described
 * situation: a probability ("noul"), a pick from named options ("choice"), or
 * a rubric score ("score"). Answers are small, calibrated and machine-readable,
 * which makes JEV cheaper and faster than asking a chat model and parsing prose.
 *
 * It needs prepaid OpenRouter credit (402 otherwise). Every caller treats a
 * failure as "no answer" and falls back to its own rules. JEV output is a hint
 * for a person; it never confirms money, approves a payout or moves a trade.
 *
 * Request shape confirmed against the live API on 2026-10-06:
 *   noul:   { type: 'noul', instructions }
 *   choice: { type: 'choice', instructions, criteria: { option: description } }
 *   score:  { type: 'score', instructions, criteria: string[] }
 */

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';

export type JevQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type JevAnswer = {
  /** Probability 0..1 for a noul question. */
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
};

export class JevError extends Error {
  constructor(public code: 'NOT_CONFIGURED' | 'NO_CREDIT' | 'FAILED' | 'TIMEOUT', message: string) {
    super(message);
  }
}

// After a "no credit" answer, don't ask again for a few minutes.
const g = globalThis as typeof globalThis & { __aksenJevNoCreditUntil?: number };

export async function askJev(input: { state: string; questions: Record<string, JevQuestion>; timeoutMs?: number }): Promise<Record<string, JevAnswer>> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new JevError('NOT_CONFIGURED', 'OPENROUTER_API_KEY is not set.');
  if ((g.__aksenJevNoCreditUntil ?? 0) > Date.now()) throw new JevError('NO_CREDIT', 'JEV needs prepaid OpenRouter credit.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  try {
    const response = await fetch(DECISIONS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'https://aksenlabs.com',
        'X-Title': 'Aksen OTC Bureau Desk',
      },
      body: JSON.stringify({ model: process.env.JEV_MODEL?.trim() || JEV_MODEL, state: input.state, questions: input.questions }),
    });
    if (response.status === 402) {
      g.__aksenJevNoCreditUntil = Date.now() + 5 * 60_000;
      throw new JevError('NO_CREDIT', 'JEV needs prepaid OpenRouter credit.');
    }
    if (!response.ok) throw new JevError('FAILED', `JEV returned ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
    const body = (await response.json()) as { answers?: Record<string, JevAnswer>; error?: { message?: string } };
    if (body.error || !body.answers) throw new JevError('FAILED', body.error?.message || 'JEV returned no answers.');
    return body.answers;
  } catch (e) {
    if (e instanceof JevError) throw e;
    if ((e as Error).name === 'AbortError') throw new JevError('TIMEOUT', 'JEV took too long.');
    throw new JevError('FAILED', (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/** A probability from a noul answer (or a score/confidence some versions return), clamped to 0..1. */
export function probability(a: JevAnswer | undefined): number | null {
  const v = a?.noul ?? a?.score ?? a?.confidence;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
}
