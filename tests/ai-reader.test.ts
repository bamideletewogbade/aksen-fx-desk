import { describe, expect, it, vi } from 'vitest';
import { FRESH, type Facts } from '@/server/assistant';
import { amountsIn, canonicalText, groundReading, maskNumbers, wordNumbers, type Reading } from '@/server/ai/reader';
import { decideWithAi, isMiss, type Complete } from '@/server/ai/assist';
import { BUILT_IN_MODEL, isModelId, parseModelList, resolveModels } from '@/server/ai/models';

const facts = (over: Partial<Facts> = {}): Facts => ({
  deskName: 'DineroYard',
  timezone: 'Africa/Accra',
  now: new Date('2026-10-05T14:00:00Z'),
  profileName: 'Kwame',
  customerName: null,
  rates: [
    { corridor: 'NGN_GHS', rate: '106.20', feeMinor: 0, minPayMinor: 0, maxPayMinor: null },
    { corridor: 'GHS_NGN', rate: '103.80', feeMinor: 0, minPayMinor: 0, maxPayMinor: null },
  ],
  quoteTtlMinutes: 15,
  fundsWindowMinutes: 60,
  trade: null,
  lastPayout: null,
  recentlyTalked: true,
  ...over,
});

/** A stand-in model that always answers with this reading. */
const model = (answer: Partial<Reading> & { intent: string }, spy = vi.fn()): Complete => async (messages) => {
  spy(messages);
  return { content: JSON.stringify({ amount: null, currency: null, wants: null, payout: null, name: null, summary: 'test', ...answer }), model: 'test/model' };
};

describe('privacy: numbers never leave the server', () => {
  it('masks phones, wallets and bank accounts but keeps amounts', () => {
    const { masked, numbers } = maskNumbers('send 200k to MTN 024 123 4567 or GTB 0123456789, call +233241234567');
    expect(masked).toBe('send 200k to MTN #1 or GTB #2, call #3');
    expect(numbers).toEqual(['0241234567', '0123456789', '+233241234567']);
  });

  it('the prompt sent to the model contains no account number', async () => {
    const spy = vi.fn();
    await decideWithAi(
      { text: 'abeg make una send am to my guy 0241234567 sharp sharp', media: 'none', state: { ...FRESH }, facts: facts() },
      model({ intent: 'other' }, spy),
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain('0241234567');
  });
});

describe('grounding: the model cannot invent money or people', () => {
  it('reads shorthand and written amounts', () => {
    expect(amountsIn('abeg 200k naira')).toContain(200_000);
    expect(amountsIn('1.5m')).toContain(1_500_000);
    expect(wordNumbers('na two hundred thousand naira')).toContain(200_000);
    expect(wordNumbers('one million five hundred thousand')).toContain(1_500_000);
    expect(wordNumbers('fifty k')).toContain(50_000);
  });

  it('replaces an amount the customer never wrote with the one they did, or drops it when unsure', () => {
    const r = groundReading({ intent: 'quote', amount: 900000, currency: 'NGN' }, { text: 'how much for 200k naira', numbers: [] });
    expect(r?.amount).toBe(200_000);
    const two = groundReading({ intent: 'quote', amount: 900000, currency: 'NGN' }, { text: 'is it 200k or 300k naira', numbers: [] });
    expect(two?.amount).toBeNull();
  });

  it('treats a rate question with an amount as a quote, and only trusts "to arrive" when the customer said so', () => {
    const r = groundReading({ intent: 'rates', amount: 200000, currency: 'NGN', wants: 'receive' }, { text: 'wetin I go get for two hundred thousand naira', numbers: [] });
    expect(r).toMatchObject({ intent: 'quote', amount: 200_000, wants: null });
    const s = groundReading({ intent: 'quote', amount: 3000, currency: 'GHS', wants: 'receive' }, { text: 'my sister wan collect three thousand cedis', numbers: [] });
    expect(s?.wants).toBe('receive');
  });

  it('maps an account token back and refuses a made-up account number', () => {
    const ok = groundReading({ intent: 'payout_details', payout: { provider: 'MTN', accountNumber: '#1', accountName: 'Kwame Asante' } }, { text: 'MTN #1 name na Kwame Asante', numbers: ['0241234567'] });
    expect(ok?.payout).toEqual({ provider: 'MTN', accountNumber: '0241234567', accountName: 'Kwame Asante' });
    const bad = groundReading({ intent: 'payout_details', payout: { provider: 'MTN', accountNumber: '0249999999', accountName: 'Yaw Boateng' } }, { text: 'send am to MTN', numbers: [] });
    expect(bad?.payout).toEqual({ provider: 'MTN', accountNumber: null, accountName: null });
  });

  it('survives junk and code fences', () => {
    expect(groundReading('not json at all', { text: 'x', numbers: [] })).toBeNull();
    expect(groundReading('```json\n{"intent":"accept"}\n```', { text: 'go ahead', numbers: [] })?.intent).toBe('accept');
    expect(groundReading({ intent: 'set_rate_to_1' }, { text: 'x', numbers: [] })?.intent).toBe('other');
  });

  it('turns readings into phrases the rules already know', () => {
    const base = { amount: null, currency: null, wants: null, payout: null, name: null, summary: '' } as const;
    expect(canonicalText({ ...base, intent: 'quote', amount: 200000, currency: 'NGN' }, 'IDLE')).toBe('200,000 naira');
    expect(canonicalText({ ...base, intent: 'quote', amount: 3000, currency: 'GHS', wants: 'receive' }, 'IDLE')).toBe('receive 3,000 cedis');
    expect(canonicalText({ ...base, intent: 'accept' }, 'CONFIRM_QUOTE')).toBe('yes');
    expect(canonicalText({ ...base, intent: 'other', currency: 'GHS' }, 'ASK_CURRENCY')).toBe('cedis');
    expect(canonicalText({ ...base, intent: 'other' }, 'IDLE')).toBeNull();
  });
});

describe('rules first, AI only when the rules are stuck', () => {
  it('never calls the model for a message the rules understand', async () => {
    const spy = vi.fn();
    const r = await decideWithAi({ text: '500k naira to cedis', media: 'none', state: { ...FRESH }, facts: facts() }, model({ intent: 'quote' }, spy));
    expect(spy).not.toHaveBeenCalled();
    expect(r.ai).toBeNull();
    expect(r.decision.state.step).toBe('CONFIRM_QUOTE');
  });

  it('rescues a Pidgin quote with a written amount', async () => {
    const text = 'wetin I go get for two hundred thousand naira';
    const r = await decideWithAi({ text, media: 'none', state: { ...FRESH }, facts: facts() }, model({ intent: 'quote', amount: 200000, currency: 'NGN', wants: 'send' }));
    expect(r.ai?.status).toBe('used');
    expect(r.decision.state.step).toBe('CONFIRM_QUOTE');
    expect(r.decision.state.draft).toMatchObject({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 200_000_00 });
    expect(r.decision.replies.join(' ')).toContain('₦200,000');
  });

  it('turns "make we do am" into a lock', async () => {
    const state = { ...FRESH, step: 'CONFIRM_QUOTE' as const, draft: { corridor: 'NGN_GHS' as const, mode: 'PAY' as const, amountMinor: 200_000_00 } };
    const r = await decideWithAi({ text: 'make we do am jare', media: 'none', state, facts: facts() }, model({ intent: 'accept' }));
    expect(r.decision.effect?.type).toBe('QUOTE');
  });

  it('keeps the rules’ own answer when the model fails, is slow, or reads nothing useful', async () => {
    const input = { text: 'wetin dey sup with una', media: 'none' as const, state: { ...FRESH }, facts: facts() };
    const failing: Complete = async () => { throw new Error('429 busy'); };
    const r1 = await decideWithAi(input, failing);
    expect(r1.ai?.status).toBe('failed');
    expect(isMiss(input.state, r1.decision)).toBe(true);
    const r2 = await decideWithAi(input, model({ intent: 'other' }));
    expect(r2.ai?.status).toBe('unclear');
    const r3 = await decideWithAi(input, null);
    expect(r3.ai).toBeNull();
  });

  it('cannot quote an amount the customer never wrote', async () => {
    const r = await decideWithAi(
      { text: 'wetin be the best you fit do for me', media: 'none', state: { ...FRESH }, facts: facts() },
      model({ intent: 'quote', amount: 5_000_000, currency: 'NGN' }),
    );
    expect(r.decision.state.step).not.toBe('CONFIRM_QUOTE');
    expect(r.decision.state.draft ?? null).toBeNull();
  });

  it('hands an upset customer to a person with the AI summary for the operator', async () => {
    const r = await decideWithAi(
      { text: 'una dey whine me since morning, I no happy at all', media: 'none', state: { ...FRESH }, facts: facts() },
      model({ intent: 'complaint', summary: 'Customer unhappy about waiting since morning' }),
    );
    expect(r.decision.handoff).toMatch(/upset.*waiting since morning/);
  });
});

describe('choosing the model', () => {
  it('prefers the desk, then the environment, then the built-in free model', () => {
    const old = { m: process.env.OPENROUTER_MODEL, f: process.env.OPENROUTER_FALLBACK_MODELS };
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_FALLBACK_MODELS;
    expect(resolveModels(null)).toMatchObject({ model: BUILT_IN_MODEL, source: 'built-in' });
    process.env.OPENROUTER_MODEL = 'openai/gpt-5-nano';
    expect(resolveModels(null)).toMatchObject({ model: 'openai/gpt-5-nano', source: 'environment' });
    expect(resolveModels({ model: 'qwen/qwen3.7-flash', fallbacks: 'openai/gpt-5-nano, bad model' })).toMatchObject({ model: 'qwen/qwen3.7-flash', fallbacks: ['openai/gpt-5-nano'], source: 'desk' });
    process.env.OPENROUTER_MODEL = old.m ?? '';
    process.env.OPENROUTER_FALLBACK_MODELS = old.f ?? '';
    if (!old.m) delete process.env.OPENROUTER_MODEL;
    if (!old.f) delete process.env.OPENROUTER_FALLBACK_MODELS;
  });

  it('validates model ids', () => {
    expect(isModelId('nvidia/nemotron-3-super-120b-a12b:free')).toBe(true);
    expect(isModelId('rm -rf /')).toBe(false);
    expect(parseModelList('a/b, c/d:free  ,, a/b')).toEqual(['a/b', 'c/d:free']);
  });
});
