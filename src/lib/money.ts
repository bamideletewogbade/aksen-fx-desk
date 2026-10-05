/**
 * Exact money and rate arithmetic shared by server and browser.
 *
 * - Amounts are integers in minor units (1 NGN = 100 kobo, 1 GHS = 100 pesewas).
 * - Rates are always "1 GHS = <rate> NGN", held as integers scaled by 1e6.
 * - Rounding is explicit and always favours neither party silently: the amount
 *   the customer receives is rounded DOWN to the minor unit, and the amount the
 *   customer must pay (when quoting by receive amount) is rounded UP. Both
 *   rules are shown on the quote.
 */

export type Currency = 'NGN' | 'GHS';
export type Corridor = 'NGN_GHS' | 'GHS_NGN';

export const CURRENCIES: Record<Currency, { symbol: string; name: string; minor: number }> = {
  NGN: { symbol: '₦', name: 'Naira', minor: 100 },
  GHS: { symbol: 'GH₵', name: 'Cedi', minor: 100 },
};

export const CORRIDORS: Record<Corridor, { pay: Currency; receive: Currency; label: string; short: string }> = {
  NGN_GHS: { pay: 'NGN', receive: 'GHS', label: 'Naira → Cedis', short: 'NGN → GHS' },
  GHS_NGN: { pay: 'GHS', receive: 'NGN', label: 'Cedis → Naira', short: 'GHS → NGN' },
};

export const RATE_SCALE = 1_000_000n;

export class MoneyError extends Error {}

/** Parses a user-typed major amount ("1,500,000.50", "1.5m", "250k") into minor units. */
export function parseMajor(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new MoneyError('Amount must be a positive number.');
    return toSafe(BigInt(Math.round(input * 100)));
  }
  const raw = input.trim().toLowerCase().replace(/[₦\s]|gh₵|ghs|ngn|naira|cedis?/g, '').replace(/,/g, '');
  const m = raw.match(/^(\d+)(?:\.(\d{1,2}))?(k|m|bn|b)?$/);
  if (!m) throw new MoneyError(`"${input}" is not a valid amount. Use digits like 1500000 or 1.5m.`);
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? '').padEnd(2, '0') || '0');
  let minor = whole * 100n + frac;
  const unit = m[3];
  if (unit === 'k') minor *= 1_000n;
  if (unit === 'm') minor *= 1_000_000n;
  if (unit === 'b' || unit === 'bn') minor *= 1_000_000_000n;
  return toSafe(minor);
}

/** Parses a rate like "105.06" into a 1e6-scaled bigint. */
export function parseRate(input: string | number): bigint {
  const s = typeof input === 'number' ? input.toFixed(6) : input.trim().replace(/,/g, '');
  const m = s.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!m) throw new MoneyError(`"${input}" is not a valid rate.`);
  const scaled = BigInt(m[1]) * RATE_SCALE + BigInt((m[2] ?? '').padEnd(6, '0') || '0');
  if (scaled <= 0n) throw new MoneyError('Rate must be greater than zero.');
  return scaled;
}

export function rateToString(scaled: bigint): string {
  const whole = scaled / RATE_SCALE;
  const frac = (scaled % RATE_SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac.length < 2 ? frac.padEnd(2, '0') : frac}` : `${whole}.00`;
}

function toSafe(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError('Amount is too large.');
  return Number(v);
}

function divFloor(a: bigint, b: bigint) {
  return a / b;
}
function divCeil(a: bigint, b: bigint) {
  return (a + b - 1n) / b;
}

export interface QuoteMath {
  payMinor: number;
  receiveMinor: number;
  feeMinor: number;
}

/**
 * Computes both sides of a quote. The fee is charged in the pay currency and
 * is not converted. `rate` is 1 GHS = rate NGN.
 */
export function computeQuote(args: {
  corridor: Corridor;
  mode: 'PAY' | 'RECEIVE';
  amountMinor: number;
  rate: bigint;
  feeMinor?: number;
}): QuoteMath {
  const fee = BigInt(args.feeMinor ?? 0);
  const amount = BigInt(args.amountMinor);
  if (amount <= 0n) throw new MoneyError('Amount must be greater than zero.');
  const { rate, corridor, mode } = args;

  if (mode === 'PAY') {
    const convertible = amount - fee;
    if (convertible <= 0n) throw new MoneyError('Amount must be larger than the fee.');
    const receive =
      corridor === 'NGN_GHS' ? divFloor(convertible * RATE_SCALE, rate) : divFloor(convertible * rate, RATE_SCALE);
    if (receive <= 0n) throw new MoneyError('Amount is too small to convert.');
    return { payMinor: toSafe(amount), receiveMinor: toSafe(receive), feeMinor: toSafe(fee) };
  }

  const convertible =
    corridor === 'NGN_GHS' ? divCeil(amount * rate, RATE_SCALE) : divCeil(amount * RATE_SCALE, rate);
  return { payMinor: toSafe(convertible + fee), receiveMinor: toSafe(amount), feeMinor: toSafe(fee) };
}

/**
 * The desk's spread earned on a trade, in NGN minor units, against the
 * reference (market) rate recorded at quote time. Positive means the desk
 * earned; null when no reference rate was recorded.
 */
export function spreadEarnedNgn(t: {
  corridor: Corridor;
  payMinor: number;
  receiveMinor: number;
  feeMinor: number;
  referenceRate: bigint | null;
}): number | null {
  if (!t.referenceRate) return null;
  const r = t.referenceRate;
  if (t.corridor === 'NGN_GHS') {
    // Customer paid NGN, received GHS. Value of GHS paid at reference rate:
    const ghsAsNgn = (BigInt(t.receiveMinor) * r) / RATE_SCALE;
    return Number(BigInt(t.payMinor) - ghsAsNgn);
  }
  // Customer paid GHS (fee in GHS), received NGN.
  const ghsAsNgn = (BigInt(t.payMinor) * r) / RATE_SCALE;
  return Number(ghsAsNgn - BigInt(t.receiveMinor));
}

export function formatMinor(minor: number | bigint, currency: Currency, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const n = typeof minor === 'bigint' ? Number(minor) : minor;
  const major = n / 100;
  const sym = CURRENCIES[currency].symbol;
  const neg = major < 0;
  const abs = Math.abs(major);
  let body: string;
  const trim = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (opts.compact && abs >= 1_000_000) body = `${trim((abs / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 2))}M`;
  else if (opts.compact && abs >= 10_000) body = `${trim((abs / 1_000).toFixed(1))}K`;
  else body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = neg ? '−' : opts.sign && major > 0 ? '+' : '';
  return `${sign}${sym}${currency === 'GHS' ? ' ' : ''}${body}`;
}

/** Plain major-unit string for inputs and CSV: 1500000.00 */
export function minorToMajorString(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
