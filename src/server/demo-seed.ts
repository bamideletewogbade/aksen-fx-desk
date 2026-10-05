import type { Db } from './db';
import { createInvite, acceptInvite, login, resolveSession, signup, type Ctx } from './auth';
import { adjustFloat, saveCustomer, saveRail, setRate } from './desk';
import {
  addNote,
  approvePayout,
  createQuote,
  getTrade,
  holdTrade,
  portalAccept,
  portalAddEvidence,
  recordFunds,
  recordPayout,
} from './trades';
import { parseMajor } from '@/lib/money';

/**
 * A clearly labelled sample desk for local development and sales demos.
 * Everything is created through the real domain functions, so the audit
 * chain, ledger and balances are genuine for the sample data.
 */
export const DEMO_EMAIL = 'demo@aksen.app';
export const DEMO_PASSWORD = 'demo-desk-2026';
export const DEMO_APPROVER_EMAIL = 'approver@aksen.app';

export async function seedDemoIfEmpty(db: Db) {
  const [exists] = await db.query('SELECT 1 FROM users WHERE email = $1', [DEMO_EMAIL]);
  if (exists) return;
  await seedDemo(db);
}

async function ctxFor(db: Db, email: string): Promise<Ctx> {
  const { token } = await login(db, { email, password: DEMO_PASSWORD });
  return (await resolveSession(db, token))!;
}

export async function seedDemo(db: Db) {
  await signup(db, { deskName: 'Sample Desk (demo data)', name: 'Adwoa Mensah', email: DEMO_EMAIL, password: DEMO_PASSWORD, isDemo: true });
  const owner = await ctxFor(db, DEMO_EMAIL);
  const inv = await createInvite(db, owner, { email: DEMO_APPROVER_EMAIL, role: 'ADMIN' });
  await acceptInvite(db, { token: inv.token, name: 'Tunde Bakare', password: DEMO_PASSWORD });
  const approver = await ctxFor(db, DEMO_APPROVER_EMAIL);

  await db.query(
    `UPDATE organizations SET support_phone = '+233 20 000 0000', customer_note = 'Sample desk for demonstration. No real money moves.',
       approval_threshold_ghs = 3000000, approval_threshold_ngn = 300000000 WHERE id = $1`,
    [owner.orgId],
  );
  await setRate(db, owner, { corridor: 'NGN_GHS', customerRate: '106.20', referenceRate: '105.06', minPayMinor: parseMajor('50,000') });
  await setRate(db, owner, { corridor: 'GHS_NGN', customerRate: '103.90', referenceRate: '105.06', minPayMinor: parseMajor('500') });

  const gtb = await saveRail(db, owner, { label: 'GTBank collections', currency: 'NGN', kind: 'BANK', provider: 'GTBank', accountNumber: '0011223344', accountName: 'Sample Desk Ltd', canCollect: true, canPay: true, dailySoftCapMinor: parseMajor('20,000,000'), openingBalanceMinor: parseMajor('3,500,000') });
  await saveRail(db, owner, { label: 'Moniepoint collections', currency: 'NGN', kind: 'BANK', provider: 'Moniepoint', accountNumber: '5566778899', accountName: 'Sample Desk Ltd', canCollect: true, canPay: false, dailySoftCapMinor: parseMajor('10,000,000') });
  const mtn = await saveRail(db, owner, { label: 'MTN MoMo payouts', currency: 'GHS', kind: 'MOMO', provider: 'MTN MoMo', accountNumber: '0550000001', accountName: 'Sample Desk Ghana', canCollect: true, canPay: true, lowBalanceMinor: parseMajor('20,000'), openingBalanceMinor: parseMajor('85,000') });
  await saveRail(db, owner, { label: 'Telecel payouts', currency: 'GHS', kind: 'MOMO', provider: 'Telecel Cash', accountNumber: '0200000002', accountName: 'Sample Desk Ghana', canCollect: false, canPay: true, openingBalanceMinor: parseMajor('15,000') });
  await adjustFloat(db, owner, { railId: mtn, amountMinor: parseMajor('20,000'), direction: 'IN', memo: 'Morning float top-up' });

  const ama = await saveCustomer(db, owner, { name: 'Ama Serwaa', phone: '+233244100200', kycStatus: 'VERIFIED', idType: 'Ghana Card', idReference: 'GHA-•••-221', perTradeLimitNgn: parseMajor('5,000,000') });
  const musa = await saveCustomer(db, owner, { name: 'Musa Ibrahim', phone: '+2348031000200', kycStatus: 'VERIFIED', idType: 'NIN', idReference: '•••4471' });
  const efua = await saveCustomer(db, owner, { name: 'Efua Boateng', phone: '+233501000300', kycStatus: 'UNVERIFIED' });
  const chidi = await saveCustomer(db, owner, { name: 'Chidi Okeke', phone: '+2349021000400', kycStatus: 'VERIFIED', idType: 'BVN', idReference: '•••9012' });

  const momo = (name: string, number: string, rel: 'SELF' | 'FAMILY' | 'BUSINESS' = 'SELF') => ({ kind: 'MOMO' as const, provider: 'MTN MoMo', accountNumber: number, accountName: name, relationship: rel });

  // 1. Completed trades (history and insights)
  const done = [
    { c: ama, amt: '1,062,000', ben: momo('Ama Serwaa', '0244100200'), ref: '1001' },
    { c: musa, amt: '2,124,000', ben: momo('Kumasi Fabrics Ent', '0244555111', 'BUSINESS'), ref: '1002' },
    { c: chidi, amt: '531,000', ben: momo('Chidi Okeke', '0551231234'), ref: '1003' },
    { c: ama, amt: '850,000', ben: momo('Ama Serwaa', '0244100200'), ref: '1004' },
  ];
  for (const d of done) {
    const q = await createQuote(db, owner, { customerId: d.c, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor(d.amt) });
    await portalAccept(db, q.token, d.ben);
    let t = await getTrade(db, owner, q.id);
    await recordFunds(db, owner, { id: q.id, version: t.version, railId: gtb, amountMinor: t.payMinor, bankReference: `NIP-DEMO-${d.ref}`, payerName: (await db.query<{ name: string }>('SELECT name FROM customers WHERE id=$1', [d.c]))[0].name });
    t = await getTrade(db, owner, q.id);
    await approvePayout(db, approver, { id: q.id, version: t.version, acknowledged: t.signals.filter((s) => s.level !== 'info').map((s) => s.code) });
    t = await getTrade(db, owner, q.id);
    await recordPayout(db, owner, { id: q.id, version: t.version, railId: mtn, reference: `MTN-DEMO-${d.ref}` });
  }

  // 2. Funds confirmed, waiting for approval, paid by a third party (shows a signal)
  {
    const q = await createQuote(db, owner, { customerId: musa, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('3,186,000') });
    await portalAccept(db, q.token, momo('Musa Ibrahim', '0244777888'));
    const t = await getTrade(db, owner, q.id);
    await recordFunds(db, owner, { id: q.id, version: t.version, railId: gtb, amountMinor: t.payMinor, bankReference: 'NIP-DEMO-2001', payerName: 'Halima Yusuf Stores' });
    await addNote(db, owner, q.id, 'Customer says Halima Yusuf Stores is his supplier paying on his behalf. Call to confirm.');
  }

  // 3. Awaiting funds with customer proof uploaded
  {
    const q = await createQuote(db, owner, { customerId: efua, corridor: 'NGN_GHS', mode: 'RECEIVE', amountMinor: parseMajor('4,000') });
    await portalAccept(db, q.token, momo('Efua Boateng', '0501000300'));
    await portalAddEvidence(db, q.token, { note: 'Transferred from my Kuda account, reference ends 4471.' });
  }

  // 4. Quote sent, not yet accepted
  await createQuote(db, owner, { customerId: chidi, corridor: 'GHS_NGN', mode: 'PAY', amountMinor: parseMajor('12,000'), beneficiary: { kind: 'BANK', provider: 'Access Bank', accountNumber: '0690000031', accountName: 'Chidi Okeke', relationship: 'SELF' } });

  // 5. On hold
  {
    const q = await createQuote(db, owner, { customerId: ama, corridor: 'NGN_GHS', mode: 'PAY', amountMinor: parseMajor('1,593,000') });
    await portalAccept(db, q.token, momo('Kofi Asante', '0277000111', 'FAMILY'));
    const t = await getTrade(db, owner, q.id);
    await holdTrade(db, owner, { id: q.id, version: t.version, reason: 'Customer asked to change the receiving number. Waiting for her call.' });
  }
}
