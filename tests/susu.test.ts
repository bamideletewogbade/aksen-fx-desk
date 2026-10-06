import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { acceptInvite, createInvite, login, resolveSession, signup, type Ctx } from '@/server/auth';
import { closePage, closePages, getSaver, listSavers, parseCollections, recordCollection, recordCollections, saveSaver, susuOverview, withdraw } from '@/server/susu';
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

  it('lets a dealer collect and roll over, but blocks cash-outs including a mixed batch', async () => {
    const { token } = await createInvite(db, owner, { email: 'dealer-susu@dinero.test', role: 'DEALER' });
    const dealer = (await resolveSession(db, (await acceptInvite(db, { token, name: 'Susu collector', password: 'dinero-yard-2026' })).token))!;
    const cashSaver = (await saveSaver(db, owner, { name: 'Cash-out check', dailyMinor: GHS(10) })).id;
    await recordCollection(db, dealer, { saverId: cashSaver, amountMinor: GHS(20) });
    await expect(withdraw(db, dealer, { saverId: cashSaver, method: 'Cash' })).rejects.toThrow(/cannot do this/);
    const rollSaver = (await saveSaver(db, owner, { name: 'Rollover check', dailyMinor: GHS(10) })).id;
    await recordCollection(db, dealer, { saverId: rollSaver, amountMinor: GHS(20) });
    await db.query("UPDATE susu_pages SET period = '2000-01' WHERE saver_id = ANY($1::uuid[])", [[cashSaver, rollSaver]]);
    const [cashPage] = await db.query<{ id: string }>('SELECT id FROM susu_pages WHERE saver_id = $1', [cashSaver]);
    const [rollPage] = await db.query<{ id: string }>('SELECT id FROM susu_pages WHERE saver_id = $1', [rollSaver]);
    await expect(closePages(db, dealer, [
      { pageId: rollPage.id, kind: 'ROLLOVER' },
      { pageId: cashPage.id, kind: 'PAYOUT', method: 'Cash' },
    ])).rejects.toThrow(/cannot do this/);
    const [stillOpen] = await db.query<{ status: string }>('SELECT status FROM susu_pages WHERE id = $1', [rollPage.id]);
    expect(stillOpen.status).toBe('OPEN');
    await expect(closePage(db, dealer, { pageId: rollPage.id, kind: 'ROLLOVER' })).resolves.toMatchObject({ kind: 'ROLLOVER' });
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

  it('reads a saver reference without treating its digits as the cash amount', async () => {
    const [line] = await parseCollections(db, owner, 'S-0001 50');
    expect(line).toMatchObject({ saverId: ama, amountMinor: GHS(50), days: 5, changeMinor: 0, problem: null });
  });

  it('does not silently drop collection lines beyond the round limit', async () => {
    await expect(parseCollections(db, owner, Array.from({ length: 201 }, () => 'Ama 10').join('\n'))).rejects.toThrow(/at most 200 lines/);
  });

  it('lets a queued daily amount change be cancelled before the next page', async () => {
    const k = (await saveSaver(db, owner, { name: 'Kweku Darko', dailyMinor: GHS(10) })).id;
    await recordCollection(db, owner, { saverId: k, amountMinor: GHS(10) });
    expect((await saveSaver(db, owner, { id: k, name: 'Kweku Darko', dailyMinor: GHS(20) })).dailyChange).toBe('next_page');
    expect((await getSaver(db, owner, k)).saver.nextDailyMinor).toBe(GHS(20));
    await saveSaver(db, owner, { id: k, name: 'Kweku Darko', dailyMinor: GHS(10) });
    expect((await getSaver(db, owner, k)).saver.nextDailyMinor).toBeNull();
  });

  it('does not collect for a paused saver and still lets the desk pay out and reopen them', async () => {
    const k = (await saveSaver(db, owner, { name: 'Abena Appiah', dailyMinor: GHS(10) })).id;
    await recordCollection(db, owner, { saverId: k, amountMinor: GHS(30) });
    await saveSaver(db, owner, { id: k, name: 'Abena Appiah', dailyMinor: GHS(10), status: 'PAUSED' });
    await expect(recordCollection(db, owner, { saverId: k, amountMinor: GHS(10) })).rejects.toThrow(/paused/);
    const paid = await withdraw(db, owner, { saverId: k, method: 'Cash' });
    expect(paid.balanceMinor).toBe(GHS(20));
    await saveSaver(db, owner, { id: k, name: 'Abena Appiah', dailyMinor: GHS(10), status: 'ACTIVE' });
    expect((await getSaver(db, owner, k)).saver.status).toBe('ACTIVE');
  });

  it('saves a collection round atomically if any saver is unavailable', async () => {
    const k = (await saveSaver(db, owner, { name: 'Kojo Arthur', dailyMinor: GHS(10) })).id;
    const p = (await saveSaver(db, owner, { name: 'Paa Mensah', dailyMinor: GHS(10) })).id;
    await saveSaver(db, owner, { id: p, name: 'Paa Mensah', dailyMinor: GHS(10), status: 'PAUSED' });
    await expect(recordCollections(db, owner, [
      { saverId: k, amountMinor: GHS(20) }, { saverId: p, amountMinor: GHS(20) },
    ])).rejects.toThrow(/paused/);
    expect((await getSaver(db, owner, k)).saver.page?.daysPaid).toBe(0);
  });

  it('returns the original collection on retry without filling boxes twice', async () => {
    const k = (await saveSaver(db, owner, { name: 'Akosua Bediako', dailyMinor: GHS(10) })).id;
    const requestId = randomUUID();
    const first = await recordCollection(db, owner, { saverId: k, amountMinor: GHS(25), requestId });
    const retry = await recordCollection(db, owner, { saverId: k, amountMinor: GHS(25), requestId });
    expect(retry).toEqual(first);
    expect((await getSaver(db, owner, k)).saver.page?.daysPaid).toBe(2);
    await expect(recordCollection(db, owner, { saverId: k, amountMinor: GHS(35), requestId })).rejects.toThrow(/different amount/);
    expect((await getSaver(db, owner, k)).payments).toHaveLength(1);
  });

  it('keeps both halves of a page-spanning payment in a long history', async () => {
    const k = (await saveSaver(db, owner, { name: 'Yaw Tetteh', dailyMinor: GHS(10) })).id;
    const capacity = (await getSaver(db, owner, k)).saver.page!.capacity;
    await recordCollection(db, owner, { saverId: k, amountMinor: GHS(10 * (capacity + 2)) });
    const [page] = await db.query<{ id: string }>('SELECT id FROM susu_pages WHERE saver_id = $1 ORDER BY page_no LIMIT 1', [k]);
    await db.query(
      `INSERT INTO susu_collections (org_id, saver_id, page_id, payment_id, days, amount_minor, received_minor, created_at)
       SELECT $1, $2, $3, gen_random_uuid(), 1, 1000, 1000, now() + n * interval '1 second'
       FROM generate_series(1, 199) AS n`,
      [owner.orgId, k, page.id],
    );
    const history = (await getSaver(db, owner, k)).payments;
    expect(history).toHaveLength(200);
    expect(history.at(-1)).toMatchObject({ days: capacity + 2, receivedMinor: GHS(10 * (capacity + 2)), periods: [periodOf(today), nextPeriod(periodOf(today))] });
  });

  it('overview adds up what is held', async () => {
    const savers = await listSavers(db, owner);
    const o = await susuOverview(db, owner, savers);
    expect(o.heldMinor).toBe(savers.reduce((s, x) => s + x.heldMinor, 0));
    expect(o.collectedTodayMinor).toBeGreaterThan(0);
  });

  it('counts fees due on every open page, including an unclosed past page', async () => {
    const k = (await saveSaver(db, owner, { name: 'Adjoa Mensimah', dailyMinor: GHS(10) })).id;
    await recordCollection(db, owner, { saverId: k, amountMinor: GHS(20) });
    await db.query("UPDATE susu_pages SET period = '2000-01' WHERE saver_id = $1", [k]);
    await recordCollection(db, owner, { saverId: k, amountMinor: GHS(20) });
    const o = await susuOverview(db, owner);
    const [rows] = await db.query<{ fees: number }>(
      "SELECT SUM(CASE WHEN days_paid > 0 THEN daily_minor ELSE 0 END) AS fees FROM susu_pages WHERE org_id = $1 AND status = 'OPEN' AND period <= $2",
      [owner.orgId, periodOf(today)],
    );
    expect(o.feesDueMinor).toBe(Number(rows.fees));
  });
});
