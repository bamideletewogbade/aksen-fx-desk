import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { login, resolveSession, signup, type Ctx } from '@/server/auth';
import { closePage, getSaver, listSavers, parseCollections, recordCollection, saveSaver, susuOverview, withdraw } from '@/server/susu';
import { todayIn } from '@/server/day-close';
import { closeMath, daysInMonth, expectedByToday, nextPeriod, periodOf, splitCash, standing, streak } from '@/lib/susu';

const GHS = (n: number) => Math.round(n * 100);

describe('booklet arithmetic', () => {
  it('fee is one day, however many boxes were filled', () => {
    expect(closeMath({ daysPaid: 31, dailyMinor: GHS(10), broughtForwardMinor: 0 })).toEqual({ savedMinor: GHS(310), feeMinor: GHS(10), balanceMinor: GHS(300) });
    expect(closeMath({ daysPaid: 30, dailyMinor: GHS(10), broughtForwardMinor: 0 }).balanceMinor).toBe(GHS(290));
    expect(closeMath({ daysPaid: 25, dailyMinor: GHS(10), broughtForwardMinor: 0 }).balanceMinor).toBe(GHS(240));
    expect(closeMath({ daysPaid: 1, dailyMinor: GHS(10), broughtForwardMinor: 0 }).balanceMinor).toBe(0);
    // Brought forward is never charged again.
    expect(closeMath({ daysPaid: 31, dailyMinor: GHS(10), broughtForwardMinor: GHS(300) }).balanceMinor).toBe(GHS(600));
    expect(closeMath({ daysPaid: 0, dailyMinor: GHS(10), broughtForwardMinor: GHS(300) })).toEqual({ savedMinor: 0, feeMinor: 0, balanceMinor: GHS(300) });
  });

  it('cash becomes whole days and change', () => {
    expect(splitCash(GHS(25), GHS(10))).toEqual({ days: 2, changeMinor: GHS(5) });
    expect(splitCash(GHS(30), GHS(10))).toEqual({ days: 3, changeMinor: 0 });
  });

  it('months, February and the next page', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-10')).toBe(31);
    expect(nextPeriod('2026-12')).toBe('2027-01');
  });

  it('on track / behind / ahead', () => {
    const page = { period: '2026-10', startDay: 1, capacity: 31 };
    expect(expectedByToday(page, '2026-10-05')).toBe(4); // 1st–4th have ended; the 5th is still due today
    expect(standing(3, 5)).toEqual({ kind: 'behind', days: 2 });
    expect(standing(7, 5)).toEqual({ kind: 'ahead', days: 2 });
    expect(standing(2, 0, 1)).toEqual({ kind: 'ahead', days: 1 }); // today + tomorrow is one day ahead
    expect(standing(1, 0, 1)).toEqual({ kind: 'on_track', days: 0 });
    expect(expectedByToday({ period: '2026-10', startDay: 20, capacity: 12 }, '2026-10-05')).toBe(0);
  });

  it('streak runs across full pages and stops at a page left with empty boxes', () => {
    expect(streak([{ status: 'OPEN', daysPaid: 5, capacity: 31 }, { status: 'CLOSED', daysPaid: 30, capacity: 30 }, { status: 'CLOSED', daysPaid: 20, capacity: 31 }])).toBe(35);
    expect(streak([{ status: 'OPEN', daysPaid: 3, capacity: 30 }, { status: 'CLOSED', daysPaid: 28, capacity: 31 }])).toBe(3);
  });
});

describe('susu desk flows', () => {
  let db: Db;
  let owner: Ctx;
  let today: string;
  let ama: string;

  beforeAll(async () => {
    db = await createTestDb();
    await signup(db, { deskName: 'DineroYard', name: 'Efua Mensah', email: 'efua@dinero.test', password: 'dinero-yard-2026' });
    owner = (await resolveSession(db, (await login(db, { email: 'efua@dinero.test', password: 'dinero-yard-2026' })).token))!;
    today = todayIn('Africa/Accra');
    ama = (await saveSaver(db, owner, { name: 'Ama Owusu', phone: '0244123456', dailyMinor: GHS(10) })).id;
  });

  it('a new saver starts on today’s box', async () => {
    const { saver } = await getSaver(db, owner, ama);
    const day = Number(today.slice(8, 10));
    expect(saver.ref).toBe('S-0001');
    expect(saver.page?.startDay).toBe(day);
    expect(saver.page?.capacity).toBe(daysInMonth(periodOf(today)) - day + 1);
  });

  it('turns cash into whole days and gives back change', async () => {
    const r = await recordCollection(db, owner, { saverId: ama, amountMinor: GHS(25) });
    expect(r.days).toBe(2);
    expect(r.changeMinor).toBe(GHS(5));
    await expect(recordCollection(db, owner, { saverId: ama, amountMinor: GHS(5) })).rejects.toThrow(/less than one day/);
  });

  it('spills extra days onto next month’s page', async () => {
    const before = (await getSaver(db, owner, ama)).saver.page!;
    const free = before.capacity - before.daysPaid;
    const r = await recordCollection(db, owner, { saverId: ama, amountMinor: GHS(10 * (free + 3)) });
    expect(r.pages).toEqual([{ period: periodOf(today), days: free }, { period: nextPeriod(periodOf(today)), days: 3 }]);
    const { saver } = await getSaver(db, owner, ama);
    expect(saver.prepaidDays).toBe(3);
    expect(saver.streak).toBe(before.capacity + 3);
  });

  it('withdrawing mid-month takes one day and continues on a fresh page', async () => {
    const kofi = (await saveSaver(db, owner, { name: 'Kofi Mensah', dailyMinor: GHS(20) })).id;
    const page = (await getSaver(db, owner, kofi)).saver.page!;
    if (page.capacity < 2) return; // last day of the month: nothing left to continue
    await recordCollection(db, owner, { saverId: kofi, amountMinor: GHS(20) });
    await expect(withdraw(db, owner, { saverId: kofi })).rejects.toThrow(/nothing to withdraw/);
    await recordCollection(db, owner, { saverId: kofi, amountMinor: GHS(20) });
    const w = await withdraw(db, owner, { saverId: kofi, method: 'Cash' });
    expect(w.feeMinor).toBe(GHS(20));
    expect(w.balanceMinor).toBe(GHS(20));
    const after = (await getSaver(db, owner, kofi)).saver.page!;
    expect(after.capacity).toBe(page.capacity - 2);
    expect(after.daysPaid).toBe(0);
  });

  it('month end: rolls the balance onto the next page without charging it again', async () => {
    const esi = (await saveSaver(db, owner, { name: 'Esi Boateng', dailyMinor: GHS(10) })).id;
    // Pretend her page belongs to a finished 31-day month that she filled completely.
    await db.query(`UPDATE susu_pages SET period = '2000-01', start_day = 1, capacity = 31, days_paid = 31 WHERE saver_id = $1`, [esi]);
    const [old] = await db.query<{ id: string }>('SELECT id FROM susu_pages WHERE saver_id = $1', [esi]);
    await expect(closePage(db, owner, { pageId: old.id, kind: 'WITHDRAWAL' })).resolves.toMatchObject({ balanceMinor: GHS(300) });
    // A full page leaves no boxes to continue, so nothing new opens until she pays again.
    expect(await db.query(`SELECT 1 FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN'`, [esi])).toHaveLength(0);
    await recordCollection(db, owner, { saverId: esi, amountMinor: GHS(10) });
    // Treat that new page as a finished February she filled, and roll it over.
    await db.query(`UPDATE susu_pages SET period = '2000-02', start_day = 1, capacity = 29, days_paid = 29 WHERE saver_id = $1 AND status = 'OPEN'`, [esi]);
    const [p2] = await db.query<{ id: string }>(`SELECT id FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN'`, [esi]);
    const r = await closePage(db, owner, { pageId: p2.id, kind: 'ROLLOVER' });
    expect(r.feeMinor).toBe(GHS(10));
    expect(r.balanceMinor).toBe(GHS(280));
    const [next] = await db.query<{ brought_forward_minor: number; period: string }>(`SELECT brought_forward_minor, period FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN'`, [esi]);
    expect(Number(next.brought_forward_minor)).toBe(GHS(280));
    expect(next.period).toBe('2000-03');
  });

  it('cannot cash out a month that is still running', async () => {
    const [p] = await db.query<{ id: string }>(`SELECT id FROM susu_pages WHERE saver_id = $1 AND status = 'OPEN' AND period = $2`, [ama, periodOf(today)]);
    const lastDay = Number(today.slice(8, 10)) === daysInMonth(periodOf(today));
    if (!lastDay) await expect(closePage(db, owner, { pageId: p.id, kind: 'PAYOUT' })).rejects.toThrow(/isn’t over yet/);
  });

  it('reads a typed collection round', async () => {
    const lines = await parseCollections(db, owner, 'Ama 50, kofi - 45\nNobody 10');
    expect(lines[0]).toMatchObject({ saverName: 'Ama Owusu', amountMinor: GHS(50), days: 5, changeMinor: 0, problem: null });
    expect(lines[1]).toMatchObject({ saverName: 'Kofi Mensah', amountMinor: GHS(45), days: 2, changeMinor: GHS(5), problem: null });
    expect(lines[2].problem).toMatch(/No saver/);
  });

  it('overview adds up what is held', async () => {
    const savers = await listSavers(db, owner);
    const o = await susuOverview(db, owner, savers);
    expect(o.heldMinor).toBe(savers.reduce((s, x) => s + x.heldMinor, 0));
    expect(o.collectedTodayMinor).toBeGreaterThan(0);
  });
});
