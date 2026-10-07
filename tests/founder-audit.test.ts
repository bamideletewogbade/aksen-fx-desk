/** Regression for the financial-number leak found in the founder audit. No live model call. */
import { expect, it } from 'vitest';
import { decideWithAi } from '@/server/ai/assist';
import { FRESH, type Facts } from '@/server/assistant';

it('redacts financial accounts from the previous assistant reply before the model prompt', async () => {
  const facts: Facts = {
    deskName: 'Synthetic Audit', timezone: 'Africa/Accra', now: new Date(),
    profileName: 'Audit', customerName: null, rates: [], quoteTtlMinutes: 15,
    fundsWindowMinutes: 60, trade: null, lastPayout: null, recentlyTalked: true,
  };
  let captured = '';
  await decideWithAi({
    text: 'abeg make una send am to my guy sharp sharp', media: 'none',
    state: { ...FRESH }, facts,
    lastReply: 'Pay Audit Bank account 0123456789, name Synthetic Audit.',
  }, async (messages) => {
    captured = JSON.stringify(messages);
    return { content: JSON.stringify({ intent: 'other' }), model: 'audit/stub' };
  });
  expect(captured).not.toBe('');
  expect(captured).not.toContain('0123456789');
  expect(captured).toContain('[private number]');
});
