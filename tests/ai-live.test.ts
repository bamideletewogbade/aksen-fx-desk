import { describe, expect, it } from 'vitest';
import { FRESH, type BotState, type Facts } from '@/server/assistant';
import { decideWithAi } from '@/server/ai/assist';
import { chatReader } from '@/server/ai/settings';
import { resolveModels } from '@/server/ai/models';

// Opt-in: calls the real OpenRouter with OPENROUTER_API_KEY. Run with AI_LIVE=1.
const facts: Facts = {
  deskName: 'DineroYard', timezone: 'Africa/Accra', now: new Date(), profileName: 'Kwame', customerName: null,
  rates: [
    { corridor: 'NGN_GHS', rate: '106.20', feeMinor: 0, minPayMinor: 0, maxPayMinor: null },
    { corridor: 'GHS_NGN', rate: '103.80', feeMinor: 0, minPayMinor: 0, maxPayMinor: null },
  ],
  quoteTtlMinutes: 15, fundsWindowMinutes: 60, trade: null, lastPayout: null, recentlyTalked: true,
};

const CASES: { text: string; state?: Partial<BotState>; expect: (d: Awaited<ReturnType<typeof decideWithAi>>) => void }[] = [
  { text: 'wetin I go get for two hundred thousand naira', expect: (r) => expect(r.decision.state.draft?.amountMinor).toBe(200_000_00) },
  { text: 'my sister wan collect three thousand cedis for ghana, how much I go pay', expect: (r) => expect(r.decision.state.draft).toMatchObject({ mode: 'RECEIVE', amountMinor: 3_000_00 }) },
  { text: 'make we do am jare', state: { step: 'CONFIRM_QUOTE', draft: { corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 200_000_00 } }, expect: (r) => expect(r.decision.effect?.type).toBe('QUOTE') },
  { text: 'una dey whine me since morning, I no happy at all', expect: (r) => expect(r.decision.handoff).toBeTruthy() },
];

describe.runIf(process.env.AI_LIVE === '1')('live AI reading through OpenRouter', () => {
  const complete = chatReader({ readsChat: true, models: resolveModels(null), own: { model: null, fallbacks: null } });
  for (const c of CASES) {
    it(c.text, async () => {
      const r = await decideWithAi({ text: c.text, media: 'none', state: { ...FRESH, ...(c.state ?? {}) }, facts }, complete);
      console.log(`[live] "${c.text}" -> ${r.ai?.status} | ${r.ai?.reading} | ${r.ai?.model} ${r.ai?.ms}ms | reply: ${r.decision.replies.join(' / ').slice(0, 120)}${r.decision.handoff ? ` | handoff: ${r.decision.handoff}` : ''}`);
      c.expect(r);
    }, 60_000);
  }
});
