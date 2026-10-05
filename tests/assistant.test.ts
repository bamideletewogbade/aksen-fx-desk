import { describe, expect, it } from 'vitest';
import { afterAccept, afterQuote, cash, decide, FRESH, firstName, isNo, isYes, parseAmount, parseDirection, parsePayout, resolveDraft, type Facts } from '@/server/assistant';

const facts = (over: Partial<Facts> = {}): Facts => ({
  deskName: 'DineroYard',
  timezone: 'Africa/Accra',
  now: new Date('2026-10-05T14:00:00Z'),
  profileName: 'Kwame',
  customerName: null,
  rates: [
    { corridor: 'NGN_GHS', rate: '106.20', feeMinor: 0, minPayMinor: 50_000_00, maxPayMinor: 50_000_000_00 },
    { corridor: 'GHS_NGN', rate: '103.80', feeMinor: 0, minPayMinor: 500_00, maxPayMinor: null },
  ],
  quoteTtlMinutes: 15,
  fundsWindowMinutes: 60,
  trade: null,
  lastPayout: null,
  recentlyTalked: false,
  ...over,
});

describe('reading amounts the way customers type them', () => {
  it.each([
    ['2m', 2_000_000_00, null],
    ['₦1.5m', 1_500_000_00, 'NGN'],
    ['N2,000,000', 2_000_000_00, 'NGN'],
    ['500k naira', 500_000_00, 'NGN'],
    ['I want to change 2 million naira', 2_000_000_00, 'NGN'],
    ['5000 cedis', 5_000_00, 'GHS'],
    ['GHS 5k', 5_000_00, 'GHS'],
    ['gh₵ 12,500.50', 12_500_50, 'GHS'],
  ])('%s', (text, minor, currency) => {
    const a = parseAmount(text);
    expect(a?.minor).toBe(minor);
    expect(a?.currency).toBe(currency);
  });

  it('ignores phone and account numbers', () => {
    expect(parseAmount('MTN 0244123456 Ama')).toBeNull();
    expect(parseAmount('+233 24 412 3456')).toBeNull();
    expect(parseAmount('GTBank 2034567891 Bola')).toBeNull();
  });

  it('knows "receive" from "pay"', () => {
    expect(parseAmount('my mum should receive 5000 cedis')?.wantsReceive).toBe(true);
    expect(parseAmount('I need 10k cedis')?.wantsReceive).toBe(true);
    expect(parseAmount('send 5000 cedis to my mum')?.wantsReceive).toBe(true);
    expect(parseAmount('how much will I get for 2m')?.wantsReceive).toBe(false);
  });

  it('turns amounts into the right corridor', () => {
    expect(resolveDraft(parseAmount('2m')!, null, null)).toEqual({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 2_000_000_00 });
    expect(resolveDraft(parseAmount('change 5000 cedis')!, null, null)).toEqual({ corridor: 'GHS_NGN', mode: 'PAY', amountMinor: 5_000_00 });
    expect(resolveDraft(parseAmount('I need 10k cedis')!, null, null)).toEqual({ corridor: 'NGN_GHS', mode: 'RECEIVE', amountMinor: 10_000_00 });
    expect(resolveDraft(parseAmount('20000')!, null, null)).toEqual({ needCurrency: true });
    expect(resolveDraft(parseAmount('20000')!, 'GHS_NGN', null)).toEqual({ corridor: 'GHS_NGN', mode: 'PAY', amountMinor: 20_000_00 });
    const t = 'send ₦2m to my brother in ghana';
    expect(resolveDraft(parseAmount(t)!, parseDirection(t), null)).toEqual({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 2_000_000_00 });
  });
});

describe('payout details', () => {
  it('reads a MoMo line in one go', () => {
    expect(parsePayout('mtn 0244123456 kofi mensah', 'GHS')).toEqual({ provider: 'MTN MoMo', kind: 'MOMO', accountNumber: '0244123456', accountName: 'Kofi Mensah' });
  });
  it('infers the network from the number', () => {
    expect(parsePayout('0201234567', 'GHS')).toMatchObject({ provider: 'Telecel Cash', kind: 'MOMO', accountNumber: '0201234567' });
  });
  it('handles +233 numbers and pieces sent separately', () => {
    const first = parsePayout('+233 24 412 3456', 'GHS');
    expect(first.accountNumber).toBe('0244123456');
    expect(first.accountName).toBeUndefined();
    expect(parsePayout('Ama Owusu', 'GHS', first).accountName).toBe('Ama Owusu');
  });
  it('reads a Nigerian bank line', () => {
    expect(parsePayout('GTBank 0123456789 Bola Ade', 'NGN')).toEqual({ provider: 'GTBank', kind: 'BANK', accountNumber: '0123456789', accountName: 'Bola Ade' });
  });
});

describe('small things that make it feel human', () => {
  it('yes / no', () => {
    for (const y of ['yes', 'Yes please', 'ok lock it', 'okay', 'sure', 'oya', '👍']) expect(isYes(y.toLowerCase())).toBe(true);
    for (const n of ['no', 'nope', 'not now', 'wrong']) expect(isNo(n)).toBe(true);
    expect(isYes('good morning')).toBe(false);
    expect(isNo('now')).toBe(false);
  });
  it('names', () => {
    expect(firstName('Ama Owusu')).toBe('Ama');
    expect(firstName("God's Grace 🙏")).toBeNull();
  });
  it('money without robotic .00', () => {
    expect(cash(2_000_000_00, 'NGN')).toBe('₦2,000,000');
    expect(cash(18_832_39, 'GHS')).toBe('GH₵ 18,832.39');
  });
});

describe('conversation', () => {
  it('greets by time and name, shows rates, asks one question', () => {
    const d = decide({ text: 'Hi', media: 'none', state: FRESH, facts: facts() });
    expect(d.replies[0]).toBe('Good afternoon Kwame 👋 You’re chatting with DineroYard.');
    expect(d.replies[1]).toContain('Naira → Cedis: ₦106.20 = GH₵1');
    expect(d.replies[1]).toContain('How much would you like to change today?');
  });

  it('quotes, then locks on yes without stopping to ask a name', () => {
    const d1 = decide({ text: '2m', media: 'none', state: FRESH, facts: facts({ recentlyTalked: true }) });
    expect(d1.replies[0]).toBe('₦2,000,000 comes to *GH₵ 18,832.39* at ₦106.20 = GH₵1.');
    expect(d1.state.step).toBe('CONFIRM_QUOTE');
    for (const yes of ["Yes let's proceed", 'go ahead', "let's go", 'deal', 'ok lock it']) {
      const d2 = decide({ text: yes, media: 'none', state: d1.state, facts: facts({ recentlyTalked: true }) });
      expect(d2.effect).toEqual({ type: 'QUOTE', draft: { corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 2_000_000_00 }, customerName: 'Kwame' });
      expect(d2.state.askName).toBe(true);
    }
  });

  it('accepts any amount when the desk sets no minimum', () => {
    const open = facts({ recentlyTalked: true, rates: facts().rates.map((r) => ({ ...r, minPayMinor: 0, maxPayMinor: null })) });
    const d = decide({ text: '₦5,000 to cedis', media: 'none', state: FRESH, facts: open });
    expect(d.replies[0]).toBe('₦5,000 comes to *GH₵ 47.08* at ₦106.20 = GH₵1.');
  });

  it('keeps payout details given up front and goes straight to what is missing', () => {
    const d = decide({ text: 'send 2m to MTN 0244123456', media: 'none', state: FRESH, facts: facts({ recentlyTalked: true }) });
    expect(d.state.payout).toEqual({ kind: 'MOMO', provider: 'MTN MoMo', accountNumber: '0244123456' });
    const trade = { ref: 'AK-T1', status: 'QUOTED' as const, corridor: 'NGN_GHS' as const, payCurrency: 'NGN' as const, receiveCurrency: 'GHS' as const, payMinor: 2_000_000_00, receiveMinor: 18_832_39, feeMinor: 0, rate: '106.20', quoteExpiresAt: '2026-10-05T14:15:00Z', fundsDueAt: null, fundsReceivedMinor: 0, refundedMinor: 0, beneficiary: null, instructions: null, customerEvidence: 0, payoutReference: null };
    const after = afterQuote(trade, facts(), d.state);
    expect(after.replies[1]).toBe('And the name on the MoMo?');
  });

  it('understands "send it to my number" from a Ghana phone', () => {
    const trade = { ref: 'AK-T1', status: 'QUOTED' as const, corridor: 'NGN_GHS' as const, payCurrency: 'NGN' as const, receiveCurrency: 'GHS' as const, payMinor: 1, receiveMinor: 1_000_00, feeMinor: 0, rate: '106.20', quoteExpiresAt: '2026-10-05T14:15:00Z', fundsDueAt: null, fundsReceivedMinor: 0, refundedMinor: 0, beneficiary: null, instructions: null, customerEvidence: 0, payoutReference: null };
    const d = decide({ text: 'send it to my number', media: 'none', state: { ...FRESH, step: 'ASK_PAYOUT' }, facts: facts({ trade, phone: '+233244123456', customerName: 'Ama Owusu', recentlyTalked: true }) });
    expect(d.replies[0]).toContain('Ama Owusu\nMTN MoMo 024 412 3456');
  });

  it('re-quotes when the amount changes mid-flow instead of reading it as a name', () => {
    const trade = { ref: 'AK-T1', status: 'QUOTED' as const, corridor: 'NGN_GHS' as const, payCurrency: 'NGN' as const, receiveCurrency: 'GHS' as const, payMinor: 1, receiveMinor: 1, feeMinor: 0, rate: '106.20', quoteExpiresAt: '2026-10-05T14:15:00Z', fundsDueAt: null, fundsReceivedMinor: 0, refundedMinor: 0, beneficiary: null, instructions: null, customerEvidence: 0, payoutReference: null };
    const d = decide({ text: 'actually make it 3m', media: 'none', state: { ...FRESH, step: 'ASK_PAYOUT' }, facts: facts({ trade, recentlyTalked: true }) });
    expect(d.effect).toEqual({ type: 'DROP_QUOTE' });
    expect(d.replies[1]).toBe('₦3,000,000 comes to *GH₵ 28,248.58* at ₦106.20 = GH₵1.');
    // A spaced-out MoMo number is not an amount change.
    const n = decide({ text: '024 412 3456', media: 'none', state: { ...FRESH, step: 'ASK_PAYOUT' }, facts: facts({ trade, recentlyTalked: true }) });
    expect(n.effect).toBeUndefined();
  });

  it('never counts "ok" against the customer, and answers small talk and timing questions', () => {
    const trade = { ref: 'AK-T1', status: 'AWAITING_FUNDS' as const, corridor: 'NGN_GHS' as const, payCurrency: 'NGN' as const, receiveCurrency: 'GHS' as const, payMinor: 1, receiveMinor: 1, feeMinor: 0, rate: '106.20', quoteExpiresAt: '2026-10-05T14:15:00Z', fundsDueAt: null, fundsReceivedMinor: 0, refundedMinor: 0, beneficiary: null, instructions: null, customerEvidence: 0, payoutReference: null };
    let s = { ...FRESH, step: 'AWAITING_PAYMENT' as const };
    for (const ack of ['ok', 'alright', 'thanks', '👍', 'okay noted']) {
      const d = decide({ text: ack, media: 'none', state: s, facts: facts({ trade, recentlyTalked: true }) });
      expect(d.handoff).toBeUndefined();
      s = d.state as typeof s;
    }
    expect(decide({ text: 'how are you', media: 'none', state: FRESH, facts: facts({ recentlyTalked: true }) }).replies[0]).toContain('doing well');
    expect(decide({ text: 'how long does it take?', media: 'none', state: FRESH, facts: facts({ recentlyTalked: true }) }).handoff).toBeUndefined();
  });

  it('asks a new customer for their name after the payment details, and records it', () => {
    const trade = { ref: 'AK-T1', status: 'AWAITING_FUNDS' as const, corridor: 'NGN_GHS' as const, payCurrency: 'NGN' as const, receiveCurrency: 'GHS' as const, payMinor: 1, receiveMinor: 1, feeMinor: 0, rate: '106.20', quoteExpiresAt: '2026-10-05T14:15:00Z', fundsDueAt: null, fundsReceivedMinor: 0, refundedMinor: 0, beneficiary: null, instructions: { provider: 'GTBank', accountNumber: '0123456789', accountName: 'DineroYard Ltd' }, customerEvidence: 0, payoutReference: null };
    const a = afterAccept(trade, facts(), { ...FRESH, askName: true });
    expect(a.replies.at(-1)).toContain('what’s your full name');
    const d = decide({ text: 'Kwame Asante', media: 'none', state: a.state, facts: facts({ trade, recentlyTalked: true }) });
    expect(d.effect).toEqual({ type: 'NAME', name: 'Kwame Asante' });
  });

  it('asks naira or cedis when it cannot tell', () => {
    const d = decide({ text: '20000', media: 'none', state: FRESH, facts: facts({ recentlyTalked: true }) });
    expect(d.replies).toEqual(['Is that 20,000 naira or cedis?']);
    const d2 = decide({ text: 'cedis', media: 'none', state: d.state, facts: facts({ recentlyTalked: true }) });
    expect(d2.state.draft).toEqual({ corridor: 'GHS_NGN', mode: 'PAY', amountMinor: 20_000_00 });
  });

  it('respects the board minimum, and "yes" takes the minimum it offered', () => {
    const d = decide({ text: 'I want to change 10k naira to cedis', media: 'none', state: FRESH, facts: facts({ recentlyTalked: true }) });
    expect(d.replies[0]).toContain('The smallest we can do on Naira → Cedis is ₦50,000');
    const yes = decide({ text: "Yes let's proceed", media: 'none', state: d.state, facts: facts({ recentlyTalked: true }) });
    expect(yes.replies[0]).toBe('₦50,000 comes to *GH₵ 470.80* at ₦106.20 = GH₵1.');
    expect(yes.state.step).toBe('CONFIRM_QUOTE');
    const no = decide({ text: 'no', media: 'none', state: d.state, facts: facts({ recentlyTalked: true }) });
    expect(no.replies[0]).toContain('another amount');
  });

  it('hands over on request, on voice notes, on complaints, and after two misses', () => {
    expect(decide({ text: 'can I speak to someone', media: 'none', state: FRESH, facts: facts() }).handoff).toBe('Customer asked for a person');
    expect(decide({ text: '', media: 'audio', state: FRESH, facts: facts() }).handoff).toBe('Customer sent a voice note or video');
    expect(decide({ text: 'this is a scam', media: 'none', state: FRESH, facts: facts() }).handoff).toMatch(/upset/);
    const s = { ...FRESH, step: 'CONFIRM_QUOTE' as const, draft: { corridor: 'NGN_GHS' as const, mode: 'PAY' as const, amountMinor: 2_000_000_00 } };
    const m1 = decide({ text: 'hmm', media: 'none', state: s, facts: facts({ recentlyTalked: true }) });
    expect(m1.handoff).toBeUndefined();
    const m2 = decide({ text: 'what?', media: 'none', state: m1.state, facts: facts({ recentlyTalked: true }) });
    expect(m2.handoff).toMatch(/didn’t understand/);
  });

  it('never treats a receipt as payment: it only attaches evidence', () => {
    const trade = { ref: 'AK-TEST01', status: 'AWAITING_FUNDS' as const, corridor: 'NGN_GHS' as const, payCurrency: 'NGN' as const, receiveCurrency: 'GHS' as const, payMinor: 1, receiveMinor: 1, feeMinor: 0, rate: '106.20', quoteExpiresAt: new Date().toISOString(), fundsDueAt: null, fundsReceivedMinor: 0, refundedMinor: 0, beneficiary: null, instructions: null, customerEvidence: 0, payoutReference: null };
    const d = decide({ text: '', media: 'image', state: { ...FRESH, step: 'AWAITING_PAYMENT' }, facts: facts({ trade }) });
    expect(d.effect).toEqual({ type: 'EVIDENCE', note: null });
  });
});
