import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { acceptInvite, createInvite, login, resolveSession, signup, type Ctx } from '@/server/auth';
import { saveRail, setRate } from '@/server/desk';
import { approvePayout, getTrade, recordFunds, recordPayout } from '@/server/trades';
import { getConversation, handBack, listConversations, notifyTradeChange, operatorReply, receiveInbound, saveChannel, simulateInbound } from '@/server/inbox';
import { twilioSignature } from '@/server/twilio';

let db: Db;
let owner: Ctx;
let checker: Ctx;
let ngnRail: string;
let ghsRail: string;
const PHONE = '+233 24 000 1111';

const say = (text: string, extra: { sampleReceipt?: boolean } = {}) => simulateInbound(db, owner, { phone: PHONE, name: 'Kwame', text, ...extra });
async function convo() {
  const { conversations } = await listConversations(db, owner);
  return getConversation(db, owner, conversations[0].id);
}
async function lastReplies(n = 3) {
  const { messages } = await convo();
  return messages.filter((m) => m.direction === 'OUT').slice(-n).map((m) => m.body);
}

beforeAll(async () => {
  db = await createTestDb();
  await signup(db, { deskName: 'DineroYard', name: 'Efua Mensah', email: 'efua@dineroyard.test', password: 'dinero-yard-2026' });
  owner = (await resolveSession(db, (await login(db, { email: 'efua@dineroyard.test', password: 'dinero-yard-2026' })).token))!;
  // A second admin for the four-eyes approval on large payouts.
  const { token } = await createInvite(db, owner, { email: 'yaw@dineroyard.test', role: 'ADMIN' });
  checker = (await resolveSession(db, (await acceptInvite(db, { token, name: 'Yaw Boateng', password: 'dinero-yard-2026' })).token))!;
  await setRate(db, owner, { corridor: 'NGN_GHS', customerRate: '106.20', referenceRate: '105.06' });
  ngnRail = await saveRail(db, owner, { label: 'GTBank collections', currency: 'NGN', kind: 'BANK', provider: 'GTBank', accountNumber: '0123456789', accountName: 'DineroYard Ltd', canCollect: true, canPay: true });
  ghsRail = await saveRail(db, owner, { label: 'MTN payouts', currency: 'GHS', kind: 'MOMO', provider: 'MTN MoMo', accountNumber: '0551234567', accountName: 'DineroYard', canCollect: false, canPay: true, openingBalanceMinor: 100_000_00 });
  await saveChannel(db, owner, { kind: 'WHATSAPP', number: '+14155238886', label: 'WhatsApp Sandbox' });
});

describe('a WhatsApp customer, start to payout', () => {
  it('greets, quotes, collects name and payout, and issues payment instructions', async () => {
    await say('Good afternoon');
    expect((await lastReplies(2))[1]).toContain('How much would you like to change today?');

    await say('I want to send 2m to ghana');
    expect((await lastReplies(2))[0]).toContain('GH₵ 18,832.39');

    await say("Yes let's proceed");
    const locked = await lastReplies(2);
    expect(locked[0]).toMatch(/^Done, rate locked ✅\nRef: \*AK-/);
    expect(locked[1]).toContain('MoMo number');

    await say('mtn 0244123456 kwame asante');
    expect((await lastReplies(1))[0]).toContain('Just to confirm, we’ll send *GH₵ 18,832.39* to:\nKwame Asante\nMTN MoMo 024 412 3456');

    await say('yes');
    const pay = await lastReplies(4);
    expect(pay[0]).toBe('Perfect. Please send *exactly ₦2,000,000* to this account:');
    expect(pay[1]).toBe('GTBank\n0123456789\nDineroYard Ltd');
    expect(pay[3]).toContain('what’s your full name');

    await say('ok'); // acknowledgement: no reply, never a "didn't understand"
    await say('Kwame Asante');
    expect((await lastReplies(1))[0]).toBe('Thank you, Kwame 🙏 Send the receipt here once you’ve paid.');

    const { conversation } = await convo();
    expect(conversation.customer?.name).toBe('Kwame Asante');
    expect(conversation.trade?.status).toBe('AWAITING_FUNDS');
  });

  it('files the receipt as evidence without moving the trade', async () => {
    await say('', { sampleReceipt: true });
    const { conversation } = await convo();
    const trade = await getTrade(db, owner, conversation.trade!.id);
    expect(trade.status).toBe('AWAITING_FUNDS');
    expect(trade.evidence).toHaveLength(1);
    expect(trade.evidence[0].submittedBy).toBe('CUSTOMER');
    expect(trade.conversationId).toBe(conversation.id);
    expect((await lastReplies(1))[0]).toContain('checking our account');
  });

  it('messages the customer when the desk confirms funds and pays out', async () => {
    const { conversation } = await convo();
    const id = conversation.trade!.id;
    let t = await getTrade(db, owner, id);
    const funds = await recordFunds(db, owner, { id, version: t.version, railId: ngnRail, amountMinor: t.payMinor, bankReference: 'GTB-778812', payerName: 'Kwame Asante' });
    await notifyTradeChange(db, owner, id, 'record_funds', funds);
    expect((await lastReplies(1))[0]).toBe('Your ₦2,000,000 has arrived ✅ We’re sending GH₵ 18,832.39 to Kwame Asante now.');

    t = await getTrade(db, checker, id);
    await approvePayout(db, checker, { id, version: t.version, acknowledged: t.signals.filter((s) => s.level !== 'info').map((s) => s.code) });
    t = await getTrade(db, owner, id);
    await recordPayout(db, owner, { id, version: t.version, railId: ghsRail, reference: 'MP251005.1422.A1' });
    await notifyTradeChange(db, owner, id, 'record_payout', null);
    const done = await lastReplies(2);
    expect(done[0]).toBe('Done ✅ GH₵ 18,832.39 has been sent to:\nKwame Asante\nMTN MoMo 024 412 3456\nRef: MP251005.1422.A1');
    expect(done[1]).toBe('Thank you for trading with DineroYard 🙏');
  });
});

describe('human in the loop', () => {
  it('goes quiet after handing over, and an operator can reply and hand back', async () => {
    await say('let me talk to a person');
    let { conversation } = await convo();
    expect(conversation.mode).toBe('HUMAN');
    expect(conversation.needsHuman).toBe(true);
    const before = (await convo()).messages.length;

    await say('hello?');
    expect((await convo()).messages.length).toBe(before + 1); // stored, not answered by the assistant

    await operatorReply(db, owner, conversation.id, 'Hi Kwame, Efua here. How can I help?');
    ({ conversation } = await convo());
    expect(conversation.needsHuman).toBe(false);
    expect(conversation.assignedTo?.name).toBe('Efua Mensah');

    await handBack(db, owner, conversation.id);
    await say('500k');
    expect((await lastReplies(2))[0]).toContain('₦500,000 comes to');
  });

  it('a returning customer skips the name question and is offered last time’s payout account', async () => {
    await say('yes');
    const r = await lastReplies(2);
    expect(r[1]).toContain('Should we send it to the same account as last time?\nKwame Asante\nMTN MoMo 024 412 3456');
  });
});

describe('Twilio webhook signature', () => {
  it('matches Twilio’s documented example', () => {
    // https://www.twilio.com/docs/usage/security#validating-requests
    const params = { CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212' };
    expect(twilioSignature('https://example.com/myapp.php?foo=1&bar=2', params, '12345')).toBe('L/OH5YylLD5NRKLltdqwSvS0BnU=');
  });

  it('ignores messages to numbers no desk has connected', async () => {
    expect(await receiveInbound(db, { to: 'whatsapp:+10000000000', from: 'whatsapp:+233240001111', body: 'hi', sid: 'SMx' })).toEqual({ status: 'ignored' });
  });
});
