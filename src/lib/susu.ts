/**
 * Susu booklet arithmetic, shared by server and screens. Pure functions only.
 *
 * The model is the paper booklet savers already know:
 * - A saver puts away a fixed daily amount. Each calendar month is a page with
 *   one box per day (a saver who joins mid-month starts on today's box).
 * - Cash fills whole boxes. Paying for several days at once, or catching up on
 *   missed days, simply fills more boxes. Money that doesn't make a whole day
 *   goes back to the saver as change.
 * - Boxes beyond the end of the month spill onto next month's page.
 * - Closing a page always costs exactly one day's amount (the desk's fee),
 *   however many boxes were filled. One box filled means nothing is left.
 * - At close the saver cashes out, or rolls over: the balance becomes the
 *   "brought forward" line of the next page and is never charged again.
 * - Withdrawing mid-month closes the page early (same one-day fee); the
 *   month's remaining boxes continue on a fresh page.
 */

export type Period = string; // 'YYYY-MM'

/** GH₵ 310 · GH₵ 12.50 (no ".00" on whole amounts, the way collectors write it). */
export function cedis(minor: number): string {
  const v = minor / 100;
  return `GH₵ ${v.toLocaleString('en-US', { minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function periodOf(date: string): Period {
  return date.slice(0, 7);
}

export function daysInMonth(period: Period): number {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function nextPeriod(period: Period): Period {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function periodLabel(period: Period): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Whole days a cash amount buys, and the change to give back. */
export function splitCash(amountMinor: number, dailyMinor: number): { days: number; changeMinor: number } {
  if (!(dailyMinor > 0)) throw new Error('Daily amount must be positive.');
  const days = Math.floor(amountMinor / dailyMinor);
  return { days, changeMinor: amountMinor - days * dailyMinor };
}

/** What closing a page yields. The fee is one day's amount, capped at what was saved on the page. */
export function closeMath(p: { daysPaid: number; dailyMinor: number; broughtForwardMinor: number }) {
  const savedMinor = p.daysPaid * p.dailyMinor;
  const feeMinor = Math.min(p.dailyMinor, savedMinor);
  return { savedMinor, feeMinor, balanceMinor: p.broughtForwardMinor + savedMinor - feeMinor };
}

/**
 * Boxes that should be filled for days that have already ended (boxes run
 * start_day .. end). Today's box is still due, not missed: the collector may
 * not have come round yet.
 */
export function expectedByToday(p: { period: Period; startDay: number; capacity: number }, today: string): number {
  const tp = periodOf(today);
  if (p.period > tp) return 0;
  if (p.period < tp) return p.capacity;
  const day = Number(today.slice(8, 10));
  return Math.max(0, Math.min(p.capacity, day - p.startDay));
}

export type Standing = { kind: 'ahead' | 'on_track' | 'behind'; days: number };

/**
 * Behind counts only days that have ended. Ahead counts beyond today's box
 * (`dueToday` is 1 when today's box is on the page and still to come).
 */
export function standing(daysPaid: number, expected: number, dueToday = 0): Standing {
  if (daysPaid < expected) return { kind: 'behind', days: expected - daysPaid };
  if (daysPaid > expected + dueToday) return { kind: 'ahead', days: daysPaid - expected - dueToday };
  return { kind: 'on_track', days: 0 };
}

/** 1 when today's box is on this page (so paying it is "on track", not "ahead"). */
export function dueToday(p: { period: Period; startDay: number; capacity: number }, today: string): number {
  if (p.period !== periodOf(today)) return 0;
  const day = Number(today.slice(8, 10));
  return day >= p.startDay && day <= p.startDay + p.capacity - 1 ? 1 : 0;
}

/**
 * Unbroken days saved: boxes on the current page (and any prepaid future pages),
 * plus earlier pages for as long as each was filled completely. A page closed
 * with empty boxes breaks the streak.
 */
export function streak(pagesNewestFirst: { status: 'OPEN' | 'CLOSED'; daysPaid: number; capacity: number }[]): number {
  let total = 0;
  for (const p of pagesNewestFirst) {
    if (p.status === 'OPEN') {
      total += p.daysPaid;
      continue;
    }
    // Boxes fill from the front, so a part-filled page's gap sits after its filled boxes: the streak stops here.
    if (p.daysPaid < p.capacity) break;
    total += p.daysPaid;
  }
  return total;
}
