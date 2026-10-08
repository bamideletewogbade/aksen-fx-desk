import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { signup, login, resolveSession, type Ctx } from '@/server/auth';
import { saveSaver, recordCollection, getSaver, closePage, withdraw } from '@/server/susu';
import { dispatchSusuSms, manageSusuSms, refreshSusuSmsDelivery, retrySusuSms, saverSusuSms, setSusuSmsAutoSend, setSusuSmsEnabled, smsConfig, smsPhone, susuSmsOverview } from '@/server/susu-sms';

describe('Susu transactional SMS', () => {
  let db:Db, owner:Ctx;
  const phone = '0244123456';
  const saved = () => saveSaver(db,owner,{name:'Receipt Saver',phone,dailyMinor:1000,smsEnabled:true});
  const queue = (id:string) => db.query<{id:string;status:string;message:string;kind:string;provider_id:string}>('SELECT * FROM susu_sms WHERE saver_id=$1 ORDER BY created_at',[id]);
  const sendFirstDraft = async (id:string) => {
    const row=(await queue(id)).find(r=>r.status==='DRAFT');
    if (!row) throw new Error('Expected an SMS draft');
    await manageSusuSms(db,owner,{id:row.id,action:'send',message:row.message});
    return row;
  };
  const accepted = vi.fn<typeof fetch>(async (_url,init) => {
    const body = JSON.parse(init!.body as string);
    return Response.json({status:'success',data:[{recipient:body.recipients[0],id:randomUUID()}]});
  });
  beforeAll(async () => {
    vi.stubEnv('ARKESEL_API_KEY','test-secret');vi.stubEnv('ARKESEL_SENDER_ID','TestDesk');vi.stubEnv('ARKESEL_SANDBOX','true');
    db = await createTestDb();
    await signup(db,{deskName:'SMS Test Desk',name:'Test owner',email:'sms-owner@example.test',password:'test-password-2026'});
    owner = (await resolveSession(db,(await login(db,{email:'sms-owner@example.test',password:'test-password-2026'})).token))!;
    await setSusuSmsEnabled(db,owner,true);
  });
  afterAll(() => vi.unstubAllEnvs());
  it('normalizes Ghana numbers and rejects malformed destinations',() => {
    for (const p of [phone,'+233244123456','233244123456','00233244123456','024 412 3456']) expect(smsPhone(p)).toBe('233244123456');
    for (const p of ['123','+2330244123456','++233244123456','0244abc123456']) expect(smsPhone(p)).toBeNull();
    expect(smsPhone('+2348012345678')).toBe('2348012345678');
  });
  it('accepts the approved Dinero-Yard sender name',() => {
    vi.stubEnv('ARKESEL_SENDER_ID','Dinero-Yard');
    expect(smsConfig()).toMatchObject({configured:true,sender:'Dinero-Yard'});
    vi.stubEnv('ARKESEL_SENDER_ID','TestDesk');
  });
  it('stores the desk default, applies it to existing SMS savers and gives it to new savers',async () => {
    const existing = await saved();
    expect((await getSaver(db,owner,existing.id)).saver.smsAutoSend).toBe(false);
    await setSusuSmsAutoSend(db,owner,true,true);
    expect((await getSaver(db,owner,existing.id)).saver.smsAutoSend).toBe(true);
    const inherited = await saveSaver(db,owner,{name:'Inherited policy',phone,dailyMinor:1000,smsEnabled:true});
    expect((await getSaver(db,owner,inherited.id)).saver.smsAutoSend).toBe(true);
    expect((await queue(inherited.id))[0].status).toBe('QUEUED');
    await setSusuSmsAutoSend(db,owner,false,false);
    await db.query("UPDATE susu_sms SET status='CANCELLED' WHERE saver_id IN ($1,$2) AND status IN ('DRAFT','QUEUED')",[existing.id,inherited.id]);
  });
  it('queues welcome and one accurate receipt across collection retries',async () => {
    const {id} = await saved();
    const requestId = randomUUID();
    await recordCollection(db,owner,{saverId:id,amountMinor:2500,requestId});
    await recordCollection(db,owner,{saverId:id,amountMinor:2500,requestId});
    const rows=await queue(id);
    expect(rows.map(r=>r.kind)).toEqual(['WELCOME','COLLECTION']);
    expect(rows.map(r=>r.status)).toEqual(['DRAFT','DRAFT']);
    expect(rows[1].message).toMatch(/Dinero-Yard: Receipt: GHS 20\.00, \d{1,2} [A-Z][a-z]{2} \d{4}, Total: GHS 20\.00, Sub-total saving: GHS 10\.00\./);
    expect(accepted).not.toHaveBeenCalled();
  });
  it('requires review and allows editing before a draft can be sent',async () => {
    const {id}=await saved();accepted.mockClear();
    const [draft]=await queue(id);
    expect(draft.status).toBe('DRAFT');
    await dispatchSusuSms(db,owner.orgId,accepted,1);
    expect(accepted).not.toHaveBeenCalled();
    await expect(manageSusuSms(db,{...owner,role:'VIEWER'},{id:draft.id,action:'save',message:draft.message})).rejects.toThrow();
    await expect(manageSusuSms(db,owner,{id:draft.id,saverId:randomUUID(),action:'save',message:draft.message})).rejects.toThrow(/not found/i);
    const edited='SMS Test Desk: Welcome. Your susu booklet is ready. Keep every receipt.';
    await manageSusuSms(db,owner,{id:draft.id,action:'save',message:edited});
    expect((await saverSusuSms(db,owner,id))[0]).toMatchObject({status:'DRAFT',message:edited});
    await manageSusuSms(db,owner,{id:draft.id,action:'send',message:edited});
    expect((await queue(id))[0].status).toBe('QUEUED');
    await dispatchSusuSms(db,owner.orgId,accepted,1);
    expect((await queue(id))[0]).toMatchObject({status:'SANDBOX',message:edited});
  });
  it('queues new messages immediately when auto-send is enabled for the saver',async () => {
    await db.query("UPDATE susu_sms SET status='CANCELLED' WHERE status IN ('DRAFT','QUEUED')");
    accepted.mockClear();
    const s=await saveSaver(db,owner,{name:'Automatic Saver',phone,dailyMinor:1000,smsEnabled:true,smsAutoSend:true});
    expect((await getSaver(db,owner,s.id)).saver.smsAutoSend).toBe(true);
    expect((await queue(s.id))[0].status).toBe('QUEUED');
    await dispatchSusuSms(db,owner.orgId,accepted,1);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect((await queue(s.id))[0].status).toBe('SANDBOX');
  });
  it('shows the saver an up-to-date running susu total',async () => {
    const {id} = await saved();
    await recordCollection(db,owner,{saverId:id,amountMinor:2000});
    await recordCollection(db,owner,{saverId:id,amountMinor:1000});
    const receipts=(await queue(id)).filter(r=>r.kind==='COLLECTION');
    expect(receipts).toHaveLength(2);
    expect(receipts[0].message).toContain('Receipt: GHS 20.00');
    expect(receipts[0].message).toContain('Total: GHS 20.00, Sub-total saving: GHS 10.00.');
    expect(receipts[1].message).toContain('Receipt: GHS 10.00');
    expect(receipts[1].message).toContain('Total: GHS 30.00, Sub-total saving: GHS 20.00.');
  });
  it('queues withdrawals, payouts, rollover and material account changes',async () => {
    const {id}=await saved();
    await recordCollection(db,owner,{saverId:id,amountMinor:3000});
    await withdraw(db,owner,{saverId:id,method:'Cash'});
    expect((await queue(id)).find(r=>r.kind==='WITHDRAWAL')?.message).toContain('Withdrawal recorded: GHS 20.00. Fee: GHS 10.00');
    for (const kind of ['PAYOUT','ROLLOVER'] as const) {
      const s=await saved();await recordCollection(db,owner,{saverId:s.id,amountMinor:3000});
      await db.query("UPDATE susu_pages SET period='2000-01' WHERE saver_id=$1",[s.id]);
      const [page]=await db.query<{id:string}>('SELECT id FROM susu_pages WHERE saver_id=$1',[s.id]);
      await closePage(db,owner,{pageId:page.id,kind});
      expect((await queue(s.id)).some(r=>r.kind===kind)).toBe(true);
      await expect(closePage(db,owner,{pageId:page.id,kind})).rejects.toThrow();
      expect((await queue(s.id)).filter(r=>r.kind===kind)).toHaveLength(1);
    }
    await saveSaver(db,owner,{id,name:'Receipt Saver',phone,dailyMinor:2000,smsEnabled:true,status:'PAUSED'});
    expect((await queue(id)).find(r=>r.kind==='ACCOUNT_UPDATE')?.message).toContain('Booklet paused');
  });
  it('does not notify opt-out or demo savers; phone changes cancel old receipts',async () => {
    const no=await saveSaver(db,owner,{name:'No messages',phone,dailyMinor:1000});
    await recordCollection(db,owner,{saverId:no.id,amountMinor:1000});
    expect(await queue(no.id)).toHaveLength(0);
    const demo=await saveSaver(db,{...owner,isDemo:true},{name:'Demo saver',phone,dailyMinor:1000,smsEnabled:true});
    expect(await queue(demo.id)).toHaveLength(0);
    const s=await saved();
    await saveSaver(db,owner,{id:s.id,name:'Receipt Saver',phone:'0244123457',dailyMinor:1000,smsEnabled:true});
    expect((await queue(s.id))[0].status).toBe('CANCELLED');
  });
  it('claims once under competing workers and never calls sandbox sends delivered',async () => {
    await db.query("UPDATE susu_sms SET status='CANCELLED' WHERE status IN ('DRAFT','QUEUED')");
    const s=await saved();accepted.mockClear();
    await sendFirstDraft(s.id);
    await Promise.all([dispatchSusuSms(db,owner.orgId,accepted,1),dispatchSusuSms(db,owner.orgId,accepted,1)]);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(JSON.parse(accepted.mock.calls[0][1]!.body as string).sandbox).toBe(true);
    expect((await queue(s.id))[0].status).toBe('SANDBOX');
  });
  it('holds timeout and stale claims for review; definitive rejection can safely retry',async () => {
    const s=await saved();
    const timeout=vi.fn<typeof fetch>(async()=>{throw new Error('timeout');});
    await sendFirstDraft(s.id);
    await dispatchSusuSms(db,owner.orgId,timeout,1);
    const [row]=await queue(s.id);expect(row.status).toBe('UNKNOWN');
    await expect(retrySusuSms(db,owner,row.id)).rejects.toThrow();
    await dispatchSusuSms(db,owner.orgId,timeout,1);expect(timeout).toHaveBeenCalledTimes(1);
    const rejected=await saved();
    await sendFirstDraft(rejected.id);
    await dispatchSusuSms(db,owner.orgId,async()=>new Response('',{status:402}),1);
    const [r]=await queue(rejected.id);expect(r.status).toBe('FAILED');
    await retrySusuSms(db,owner,r.id);await dispatchSusuSms(db,owner.orgId,accepted,1);
    expect((await queue(rejected.id))[0].status).toBe('SANDBOX');
    const stale=await saved();
    await sendFirstDraft(stale.id);
    await db.query("UPDATE susu_sms SET status='SENDING',claimed_at=now()-interval '6 minutes' WHERE saver_id=$1",[stale.id]);
    await dispatchSusuSms(db,owner.orgId,accepted,1);
    expect((await queue(stale.id))[0].status).toBe('UNKNOWN');
    expect((await getSaver(db,owner,s.id)).saver).toBeDefined();
  });
  it('confirms delivery only from a matching authenticated provider result',async () => {
    vi.stubEnv('ARKESEL_SANDBOX','false');const s=await saved();
    await sendFirstDraft(s.id);
    await dispatchSusuSms(db,owner.orgId,accepted,1);
    const [r]=await queue(s.id);expect(r.status).toBe('ACCEPTED');
    await refreshSusuSmsDelivery(db,owner.orgId,async()=>Response.json({status:'success',data:{ID:r.provider_id,recipient:'233244000000',status:'DELIVERED'}}));
    expect((await queue(s.id))[0].status).toBe('ACCEPTED');
    await db.query('UPDATE susu_sms SET checked_at=NULL WHERE id=$1',[r.id]);
    await refreshSusuSmsDelivery(db,owner.orgId,async()=>Response.json({status:'success',data:{ID:r.provider_id,recipient:'233244123456',status:'DELIVERED'}}));
    expect((await queue(s.id))[0].status).toBe('DELIVERED');
    vi.stubEnv('ARKESEL_SANDBOX','true');
  });
  it('enforces admin access, tenant boundaries and master disable',async()=>{
    const s=await saved();
    await expect(setSusuSmsEnabled(db,{...owner,role:'DEALER'},false)).rejects.toThrow();
    await expect(susuSmsOverview(db,{...owner,role:'VIEWER'})).rejects.toThrow();
    const [row]=await queue(s.id);
    await db.query("UPDATE susu_sms SET status='FAILED' WHERE id=$1",[row.id]);
    await expect(retrySusuSms(db,{...owner,orgId:randomUUID()},row.id)).rejects.toThrow();
    await setSusuSmsEnabled(db,owner,false);
    expect((await queue(s.id))[0].status).toBe('CANCELLED');
    expect(await queue((await saved()).id)).toHaveLength(0);
  });
});
