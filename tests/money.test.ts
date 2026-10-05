import { describe, expect, it } from 'vitest';
import { computeQuote, formatMinor, parseMajor, parseRate, rateToString, spreadEarnedNgn } from '@/lib/money';

describe('parseMajor', () => {
  it('reads plain, comma and shorthand amounts', () => {
    expect(parseMajor('1,500,000')).toBe(150_000_000);
    expect(parseMajor('2,500,000')).toBe(250_000_000);
    expect(parseMajor('1.5m')).toBe(150_000_000);
    expect(parseMajor('250k')).toBe(25_000_000);
    expect(parseMajor('₦ 25,000.50')).toBe(2_500_050);
    expect(parseMajor('5000')).toBe(500_000);
  });
  it('rejects junk', () => {
    expect(() => parseMajor('abc')).toThrow();
    expect(() => parseMajor('1.234')).toThrow();
  });
});

describe('rates', () => {
  it('round-trips', () => {
    expect(rateToString(parseRate('105.06'))).toBe('105.06');
    expect(rateToString(parseRate('105.5'))).toBe('105.50');
    expect(rateToString(parseRate('105'))).toBe('105.00');
    expect(rateToString(parseRate('104.123456'))).toBe('104.123456');
  });
});

describe('computeQuote', () => {
  const rate = parseRate('105.06');
  it('NGN→GHS by pay amount rounds the payout down', () => {
    const q = computeQuote({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('1,500,000'), rate });
    expect(q.receiveMinor).toBe(1_427_755); // GH₵14,277.55 (14,277.555… rounded down)
  });
  it('GHS→NGN multiplies (the audited reverse-corridor bug)', () => {
    const q = computeQuote({ corridor: 'GHS_NGN', mode: 'PAY', amountMinor: parseMajor('25,000'), rate });
    expect(q.receiveMinor).toBe(parseMajor('2,626,500'));
  });
  it('quoting by receive amount rounds what the customer pays up', () => {
    const q = computeQuote({ corridor: 'NGN_GHS', mode: 'RECEIVE', amountMinor: parseMajor('10,000.01'), rate: parseRate('105.333333') });
    expect(q.payMinor).toBe(105_333_439); // 1,053,334.383333… → 1,053,334.39
    const back = computeQuote({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: q.payMinor, rate: parseRate('105.333333') });
    expect(back.receiveMinor).toBeGreaterThanOrEqual(1_000_001);
  });
  it('charges the fee in the pay currency', () => {
    const q = computeQuote({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('1,000,000'), rate: parseRate('100'), feeMinor: parseMajor('1,000') });
    expect(q.receiveMinor).toBe(parseMajor('9,990'));
    const r = computeQuote({ corridor: 'NGN_GHS', mode: 'RECEIVE', amountMinor: parseMajor('9,990'), rate: parseRate('100'), feeMinor: parseMajor('1,000') });
    expect(r.payMinor).toBe(parseMajor('1,000,000'));
  });
  it('refuses amounts that do not cover the fee', () => {
    expect(() => computeQuote({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 100, rate, feeMinor: 500 })).toThrow();
  });
});

describe('spread', () => {
  it('is positive when the desk sells cedis above the reference rate', () => {
    const q = computeQuote({ corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('1,060,000'), rate: parseRate('106') });
    const s = spreadEarnedNgn({ corridor: 'NGN_GHS', ...q, referenceRate: parseRate('104') });
    expect(s).toBe(parseMajor('20,000'));
  });
});

describe('formatMinor', () => {
  it('formats both currencies', () => {
    expect(formatMinor(150_000_000, 'NGN')).toBe('₦1,500,000.00');
    expect(formatMinor(1_427_755, 'GHS')).toBe('GH₵ 14,277.55');
    expect(formatMinor(150_000_000, 'NGN', { compact: true })).toBe('₦1.5M');
  });
});
