/** Safety regressions for gaps found by the 2026-10-05 deployment audit. */
import { beforeAll, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { signup, login, resolveSession, type Ctx } from '@/server/auth';
import { getCustomer, saveCustomer, saveRail, setRate, adjustFloat } from '@/server/desk';
import { createQuote, portalAccept, getTrade, recordFunds, approvePayout, recordPayout, markRefundDue, recordRefund } from '@/server/trades';
import { saveChannel, simulateInbound, getConversation } from '@/server/inbox';
import { getDay, todayIn, closeRailDay } from '@/server/day-close';
import { getInsights } from '@/server/insights';

let db: Db, owner: Ctx, ngn: string, ghs: string;
let seq = 0;
const ben = { kind: 'MOMO' as const, provider: 'MTN', accountNumber: '0244123456', accountName: 'Audit Customer', relationship: 'SELF' as const };
beforeAll(async () => {
  db = await createTestDb();
  await signup(db, {deskName:'Audit Desk', name:'Audit Owner', email:'audit@example.test', password:'audit-only-password-2026'});
  owner = (await resolveSession(db, (await login(db, {email:'audit@example.test', password:'audit-only-password-2026'})).token))!;
  await setRate(db, owner, {corridor:'NGN_GHS', customerRate:'100'});
  ngn = await saveRail(db, owner, {label:'Collection', currency:'NGN', kind:'BANK', provider:'Test bank', accountNumber:'0123456789', accountName:'Audit Desk', canCollect:true, canPay:true});
  ghs = await saveRail(db, owner, {label:'Payout', currency:'GHS', kind:'MOMO', provider:'MTN', accountNumber:'0551234567', accountName:'Audit Desk', canCollect:false, canPay:true, openingBalanceMinor:10000000});
  await saveChannel(db, owner, {kind:'WHATSAPP', number:'+14155238886', label:'Test sandbox'});
});
async function funded() {
  const customerId = await saveCustomer(db, owner, {name:'Audit Customer', kycStatus:'VERIFIED'});
  const quote = await createQuote(db, owner, {customerId, corridor:'NGN_GHS', mode:'PAY', amountMinor:100000});
  await portalAccept(db, quote.token, ben);
  await recordFunds(db, owner, {id:quote.id, version:(await getTrade(db, owner, quote.id)).version, railId:ngn, amountMinor:100000, bankReference:`audit-credit-${++seq}`});
  return {...quote, customerId};
}
async function approve(id:string) {
  const t = await getTrade(db, owner, id);
  await approvePayout(db, owner, {id, version:t.version, acknowledged:t.signals.map(s=>s.code)});
}
it('blocks a dealer from changing a rejected customer’s KYC status', async () => {
  const id = await saveCustomer(db, owner, {name:'Rejected Person', kycStatus:'REJECTED'});
  await expect(saveCustomer(db, {...owner, role:'DEALER'}, {id, name:'Rejected Person', kycStatus:'UNVERIFIED'})).rejects.toThrow(/cannot do this/i);
  const [r] = await db.query('SELECT kyc_status FROM customers WHERE id=$1',[id]);
  expect(r.kyc_status).toBe('REJECTED');
  await expect(createQuote(db, {...owner, role:'DEALER'}, {customerId:id, corridor:'NGN_GHS', mode:'PAY', amountMinor:100000})).rejects.toThrow(/rejected/i);
});
it('rechecks rejected KYC immediately before payout', async () => {
  const q = await funded(); await approve(q.id);
  await saveCustomer(db, owner, {id:q.customerId, name:'Audit Customer', kycStatus:'REJECTED'});
  await expect(recordPayout(db, owner, {id:q.id, version:(await getTrade(db,owner,q.id)).version, railId:ghs, reference:`payout-${++seq}`})).rejects.toThrow(/rejected/i);
  expect((await getTrade(db,owner,q.id)).status).toBe('APPROVED');
});
it('holds a late credit even when the expiry sweep has not run', async () => {
  const customerId=await saveCustomer(db,owner,{name:'Late Customer',kycStatus:'VERIFIED'});
  const q=await createQuote(db,owner,{customerId,corridor:'NGN_GHS',mode:'PAY',amountMinor:100000});
  await portalAccept(db,q.token,ben);
  const version=(await getTrade(db,owner,q.id)).version;
  await db.query("UPDATE trades SET funds_due_at=now()-interval '1 minute' WHERE id=$1",[q.id]);
  const r=await recordFunds(db,owner,{id:q.id,version,railId:ngn,amountMinor:100000,bankReference:`late-${++seq}`});
  expect(r.status).toBe('ON_HOLD');
  expect((await getTrade(db,owner,q.id)).holdReason).toMatch(/payment window/i);
});
it('reopens refund work when extra funds arrive after a full refund', async () => {
  const q=await funded();
  await markRefundDue(db,owner,{id:q.id,version:(await getTrade(db,owner,q.id)).version,reason:'Return customer funds'});
  await recordRefund(db,owner,{id:q.id,version:(await getTrade(db,owner,q.id)).version,railId:ngn,amountMinor:100000,reference:`refund-${++seq}`});
  await recordFunds(db,owner,{id:q.id,version:(await getTrade(db,owner,q.id)).version,railId:ngn,amountMinor:50000,bankReference:`extra-${++seq}`});
  const t=await getTrade(db,owner,q.id);
  expect(t.status).toBe('REFUND_DUE'); expect(t.fundsReceivedMinor-t.refundedMinor).toBe(50000);
});
it('blocks a WhatsApp number that is not the configured Twilio sender', async () => {
  await expect(saveChannel(db,owner,{kind:'WHATSAPP',number:'+15550001234',label:'Unverified channel'})).rejects.toThrow(/configure|sender/i);
});
it('keeps simulator trades out of customer and business metrics', async () => {
  const phone='+233200009999';
  const before = await getInsights(db, owner, 1);
  await simulateInbound(db,owner,{phone,text:'1000 naira to ghana'});
  await simulateInbound(db,owner,{phone,text:'yes'});
  const r=await simulateInbound(db,owner,{phone,text:'Audit Simulator'});
  const c=await getConversation(db,owner,r.conversationId!);
  expect(c.conversation.isTest).toBe(true);
  const [trade]=await db.query('SELECT t.id FROM trades t JOIN conversations c ON c.id=t.conversation_id WHERE c.id=$1',[r.conversationId]);
  expect(trade.id).toBeTruthy();
  const customer = await getCustomer(db, owner, c.conversation.customer!.id);
  expect(customer.tradeCount).toBe(0);
  expect((await getInsights(db, owner, 1)).funnel.quoted).toBe(before.funnel.quoted);
});
it('includes float top-ups in reconciliation', async () => {
  const date=todayIn('Africa/Accra');
  const before=await getDay(db,owner,date);
  await adjustFloat(db,owner,{railId:ngn,amountMinor:55500,direction:'IN',memo:'Audit owner top-up'});
  const after=await getDay(db,owner,date);
  expect(after.rails.find(r=>r.railId===ngn)!.expectedInMinor).toBe(before.rails.find(r=>r.railId===ngn)!.expectedInMinor+55500);
});
it('blocks credits after an account’s day has been closed', async () => {
  const date=todayIn('Africa/Accra'); const day=await getDay(db,owner,date); const r=day.rails.find(r=>r.railId===ngn)!;
  await closeRailDay(db,owner,{date,railId:ngn,statementInMinor:r.expectedInMinor,statementOutMinor:r.expectedOutMinor});
  await expect(funded()).rejects.toThrow(/closed for today/i);
  const after=(await getDay(db,owner,date)).rails.find(r=>r.railId===ngn)!;
  expect(after.closed).not.toBeNull(); expect(after.expectedInMinor).toBe(r.expectedInMinor);
});
