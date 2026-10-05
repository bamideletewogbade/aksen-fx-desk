import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { acceptInvite, createInvite, login, resolveSession, signup, type Ctx } from '@/server/auth';
import { adjustFloat, saveCustomer, saveRail, setRate, listRails } from '@/server/desk';
import {
  approvePayout,
  addEvidence,
  cancelTrade,
  createQuote,
  getPortalView,
  getTrade,
  holdTrade,
  listTrades,
  markRefundDue,
  portalAccept,
  portalAddEvidence,
  recordFunds,
  recordPayout,
  recordRefund,
  releaseHold,
  requote,
  sweepExpired,
} from '@/server/trades';
import { verifyChain } from '@/server/audit';
import { parseMajor } from '@/lib/money';

let db: Db;
let owner: Ctx;
let admin2: Ctx;
let otherDesk: Ctx;
let ngnRail: string;
let ghsRail: string;
let customerId: string;

async function ctxFor(email: string, password: string) {
  const { token } = await login(db, { email, password });
  const ctx = await resolveSession(db, token);
  if (!ctx) throw new Error('no session');
  return ctx;
}

const PW = 'correct-horse-battery';
const momo = { kind: 'MOMO' as const, provider: 'MTN MoMo', accountNumber: '0244123456', accountName: 'Ama Owusu', relationship: 'SELF' as const };

beforeAll(async () => {
  db = await createTestDb();
  await signup(db, { deskName: 'Circle Desk', name: 'Ama Owusu', email: 'ama@circle.test', password: PW });
  owner = await ctxFor('ama@circle.test', PW);
  const { token } = await createInvite(db, owner, { email: 'kwame@circle.test', role: 'ADMIN' });
  const s = await acceptInvite(db, { token, name: 'Kwame Asare', password: PW });
  admin2 = (await resolveSession(db, s.token))!;
  await signup(db, { deskName: 'Other Desk', name: 'Bola Ade', email: 'bola@other.test', password: PW });
  otherDesk = await ctxFor('bola@other.test', PW);

  await setRate(db, owner, { corridor: 'NGN_GHS', customerRate: '106.20', referenceRate: '105.06' });
  await setRate(db, owner, { corridor: 'GHS_NGN', customerRate: '103.80', referenceRate: '105.06' });
  ngnRail = await saveRail(db, owner, { label: 'GTBank collections', currency: 'NGN', kind: 'BANK', provider: 'GTBank', accountNumber: '0123456789', accountName: 'Circle Desk Ltd', canCollect: true, canPay: true });
  ghsRail = await saveRail(db, owner, { label: 'MTN payout line', currency: 'GHS', kind: 'MOMO', provider: 'MTN MoMo', accountNumber: '0551234567', accountName: 'Circle Desk', canCollect: true, canPay: true });
  customerId = await saveCustomer(db, owner, { name: 'Ama Owusu', phone: '+233 24 412 3456', kycStatus: 'VERIFIED' });
});

describe('auth', () => {
  it('rejects wrong passwords and forged tokens', async () => {
    await expect(login(db, { email: 'ama@circle.test', password: 'wrong-password-123' })).rejects.toThrow(/incorrect/);
    expect(await resolveSession(db, 'not-a-real-token-at-all-xxxxxxxxxxxxx')).toBeNull();
    expect(await resolveSession(db, JSON.stringify({ email: 'ama@circle.test' }))).toBeNull();
  });
  it('rejects weak passwords at signup', async () => {
    await expect(signup(db, { deskName: 'X', name: 'X', email: 'x@x.test', password: '123456' })).rejects.toThrow();
  });
});

describe('full trade lifecycle', () => {
  let id: string;
  let token: string;
  const v = async () => (await getTrade(db, owner, id)).version;

  it('quotes, then the customer accepts through the link', async () => {
    const q = await createQuote(db, owner, { customerId, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('1,062,000') });
    id = q.id;
    token = q.token;
    const view = await getPortalView(db, token);
    expect(view.trade.status).toBe('QUOTED');
    expect(view.trade.receiveMinor).toBe(parseMajor('10,000'));
    expect(view.trade.paymentInstructions).toBeNull();
    await portalAccept(db, token, momo);
    const after = await getPortalView(db, token);
    expect(after.trade.status).toBe('AWAITING_FUNDS');
    expect(after.trade.paymentInstructions?.accountNumber).toBe('0123456789');
    expect(after.trade.beneficiary?.accountNumber).toBe('•••• 3456');
  });

  it('a tampered link is rejected', async () => {
    await expect(getPortalView(db, token.slice(0, -2) + 'xx')).rejects.toThrow(/not valid/);
  });

  it('customer proof of payment does NOT clear funds', async () => {
    await portalAddEvidence(db, token, { note: 'I have not transferred any money' });
    const t = await getTrade(db, owner, id);
    expect(t.status).toBe('AWAITING_FUNDS');
    expect(t.evidenceCount).toBe(1);
  });

  it('records a partial credit, rejects a reused bank reference, then confirms in full', async () => {
    let r = await recordFunds(db, owner, { id, version: await v(), railId: ngnRail, amountMinor: parseMajor('1,000,000'), bankReference: 'NIP-0001', payerName: 'Ama Owusu' });
    expect(r.status).toBe('AWAITING_FUNDS');
    expect(r.shortfallMinor).toBe(parseMajor('62,000'));
    await expect(recordFunds(db, owner, { id, version: await v(), railId: ngnRail, amountMinor: parseMajor('62,000'), bankReference: 'NIP-0001' })).rejects.toThrow(/already recorded/);
    r = await recordFunds(db, owner, { id, version: await v(), railId: ngnRail, amountMinor: parseMajor('62,000'), bankReference: 'NIP-0002', payerName: 'Ama Owusu' });
    expect(r.status).toBe('FUNDS_CONFIRMED');
  });

  it('refuses a stale version (two operators clicking at once)', async () => {
    const stale = (await v()) - 1;
    await expect(holdTrade(db, owner, { id, version: stale, reason: 'double click test' })).rejects.toThrow(/updated this trade/);
  });

  it('enforces four-eyes approval above the threshold and needs warnings acknowledged', async () => {
    await db.query('UPDATE organizations SET approval_threshold_ghs = 0 WHERE id = $1', [owner.orgId]);
    await expect(approvePayout(db, owner, { id, version: await v(), acknowledged: [] })).rejects.toThrow(/second person/);
    // admin2 did not confirm funds, so they may approve. FIRST_TRADE is info-only.
    await approvePayout(db, admin2, { id, version: await v(), acknowledged: [] });
    expect((await getTrade(db, owner, id)).status).toBe('APPROVED');
  });

  it('pays out without needing a recorded balance (desks keep balances private)', async () => {
    await recordPayout(db, owner, { id, version: await v(), railId: ghsRail, reference: 'MTN-777' });
    const t = await getTrade(db, owner, id);
    expect(t.status).toBe('COMPLETED');
    const view = await getPortalView(db, token);
    expect(view.trade.payoutReference).toBe('MTN-777');
    expect(view.proof?.head).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the ledger balanced in every currency', async () => {
    const rows = await db.query<{ currency: string; s: string | number }>('SELECT currency, SUM(amount_minor) AS s FROM journal_lines GROUP BY currency');
    for (const r of rows) expect(Number(r.s)).toBe(0);
  });
});

describe('tenant isolation', () => {
  it('another desk cannot see or act on this desk’s trades', async () => {
    const [anyTrade] = await listTrades(db, owner);
    await expect(getTrade(db, otherDesk, anyTrade.id)).rejects.toThrow(/not found/i);
    await expect(holdTrade(db, otherDesk, { id: anyTrade.id, version: anyTrade.version, reason: 'cross tenant' })).rejects.toThrow(/not found/i);
    expect(await listTrades(db, otherDesk)).toHaveLength(0);
    await expect(createQuote(db, otherDesk, { customerId, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: 1000000 })).rejects.toThrow(/not found/i);
  });
});

describe('exceptions', () => {
  it('reverse corridor quotes multiply', async () => {
    const q = await createQuote(db, owner, { customerId, corridor: 'GHS_NGN', mode: 'PAY', amountMinor: parseMajor('25,000') });
    const t = await getTrade(db, owner, q.id);
    expect(t.receiveMinor).toBe(parseMajor('2,595,000'));
    await cancelTrade(db, owner, { id: q.id, version: t.version, reason: 'Customer changed mind' });
    expect((await getTrade(db, owner, q.id)).status).toBe('CANCELLED');
  });

  it('expires stale quotes and lets the desk refresh them', async () => {
    const q = await createQuote(db, owner, { customerId, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('500,000') });
    await db.query(`UPDATE trades SET quote_expires_at = now() - interval '1 minute' WHERE id = $1`, [q.id]);
    await sweepExpired(db, owner.orgId);
    let t = await getTrade(db, owner, q.id);
    expect(t.status).toBe('EXPIRED');
    await expect(portalAccept(db, q.token, momo)).rejects.toThrow(/can’t accept/);
    await requote(db, owner, q.id, t.version);
    t = await getTrade(db, owner, q.id);
    expect(t.status).toBe('QUOTED');
  });

  it('flags reused proof of payment across trades', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const a = await createQuote(db, owner, { customerId, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('100,000'), beneficiary: momo });
    const b = await createQuote(db, owner, { customerId, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('100,000'), beneficiary: momo });
    await portalAccept(db, a.token, momo);
    await portalAccept(db, b.token, momo);
    await portalAddEvidence(db, a.token, { file: { name: 'slip.png', mime: 'image/png', bytes: png } });
    await portalAddEvidence(db, b.token, { file: { name: 'slip.png', mime: 'image/png', bytes: png } });
    const t = await getTrade(db, owner, b.id);
    expect(t.signals.map((s) => s.code)).toContain('REUSED_PROOF');
    await expect(addEvidence(db, owner, b.id, { file: { name: 'x.png', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) } })).rejects.toThrow(/JPG, PNG/);
  });

  it('holds, releases, and refunds a third-party payment', async () => {
    const q = await createQuote(db, owner, { customerId, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('212,400'), beneficiary: momo });
    await portalAccept(db, q.token, momo);
    let t = await getTrade(db, owner, q.id);
    await recordFunds(db, owner, { id: q.id, version: t.version, railId: ngnRail, amountMinor: parseMajor('212,400'), bankReference: 'NIP-9001', payerName: 'Chinedu Okafor' });
    t = await getTrade(db, owner, q.id);
    expect(t.signals.map((s) => s.code)).toContain('THIRD_PARTY_PAYER');
    await expect(approvePayout(db, admin2, { id: q.id, version: t.version, acknowledged: [] })).rejects.toThrow(/tick every warning/);
    await holdTrade(db, owner, { id: q.id, version: t.version, reason: 'Calling customer about payer' });
    t = await getTrade(db, owner, q.id);
    await releaseHold(db, owner, { id: q.id, version: t.version });
    t = await getTrade(db, owner, q.id);
    expect(t.status).toBe('FUNDS_CONFIRMED');
    await markRefundDue(db, owner, { id: q.id, version: t.version, reason: 'Payer could not be verified' });
    t = await getTrade(db, owner, q.id);
    await recordRefund(db, owner, { id: q.id, version: t.version, railId: ngnRail, amountMinor: parseMajor('212,400'), reference: 'NIP-RF-1' });
    expect((await getTrade(db, owner, q.id)).status).toBe('REFUNDED');
  });

  it('a viewer cannot move money', async () => {
    const { token } = await createInvite(db, owner, { email: 'viewer@circle.test', role: 'VIEWER' });
    const s = await acceptInvite(db, { token, name: 'Auditor', password: PW });
    const viewer = (await resolveSession(db, s.token))!;
    const [t] = await listTrades(db, viewer);
    await expect(holdTrade(db, viewer, { id: t.id, version: t.version, reason: 'should fail' })).rejects.toThrow(/cannot do this/);
  });
});

describe('audit chain', () => {
  it('verifies, and detects tampering', async () => {
    const ok = await verifyChain(db, owner.orgId);
    expect(ok.ok).toBe(true);
    expect(ok.events).toBeGreaterThan(10);
    await db.query(`UPDATE audit_events SET data = '{"amount":"₦1.00"}'::jsonb WHERE org_id = $1 AND action = 'trade.funds_recorded' AND seq = (SELECT MIN(seq) FROM audit_events WHERE org_id = $1 AND action = 'trade.funds_recorded')`, [owner.orgId]);
    const bad = await verifyChain(db, owner.orgId);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/changed/);
  });
});
