import fs from 'node:fs';
const base = 'http://127.0.0.1:3011';
const results = [];
async function call(path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type':'application/json', ...headers }, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(60000) });
  const t = await r.text(); let data; try { data=JSON.parse(t); } catch { data={html:t.length}; }
  return {status:r.status, data, cookie:r.headers.get('set-cookie')};
}
function record(name, passed, observed) { results.push({name, verdict:passed?'PASS':'FAIL', observed}); console.log(JSON.stringify(results.at(-1))); }
const initial = await call('/api/tickets');
if(initial.data.source !== 'mock') throw new Error('Isolation guard: expected no database; stopping all mutations');
for (const path of ['/', '/login', '/desk', '/settings', '/whatsapp', '/history', '/treasury', '/analytics', '/syndicates']) {
 const r=await call(path); record('Route renders '+path,r.status===200,{status:r.status});
}
record('Ticket API requires authentication',initial.status===401,{status:initial.status,source:initial.data.source,count:initial.data.tickets.length});
const login=await call('/api/auth/login',{email:'audit@example.invalid',password:'abcdef'});
record('Unknown account cannot authenticate',login.status===401,{status:login.status,authenticated:login.data.ok,httpOnly:login.cookie?.includes('HttpOnly')});
const forged=await call('/api/auth/session',undefined,'GET',{cookie:'aksen_session='+encodeURIComponent(JSON.stringify({email:'forged@example.invalid',role:'Principal Desk Operator',org:'Forged Org'}))});
record('Unsigned session cannot authenticate',!forged.data.authenticated,{status:forged.status,authenticated:forged.data.authenticated});
const signup=await call('/api/auth/signup',{email:'audit-signup@example.invalid',password:'abcdef',org:'Audit Org'});
record('Signup establishes a persisted identity (manual validation needed)',false,{status:signup.status,message:signup.data.message,note:'Source only constructs a cookie; no identity persistence.'});
record('Login rejects malformed email',(await call('/api/auth/login',{email:'invalid',password:'abcdef'})).status===400,{});
record('Login rejects short password',(await call('/api/auth/login',{email:'audit@example.invalid',password:'1'})).status===400,{});
const upd=await call('/api/tickets',{action:'UPDATE_STATUS',ticketId:'AUDIT-NONEXISTENT',newStatus:'NOT_A_REAL_STATUS'});
record('Status API rejects unauthenticated invalid transitions',upd.status>=400,{status:upd.status,...upd.data});
const samples=[['comma amount','I want to send 2,500,000 Naira to Ghana',2500000],['million shorthand','Swap 2.5m Naira to Ghana',2500000],['small GHS amount','I want to send 100 GHS to Nigeria',100]];
for(const [name,message,expected] of samples){const r=await call('/api/whatsapp/chat',{message});record('Parse '+name,r.data.updatedTradeState?.amountIn===expected,{actual:r.data.updatedTradeState?.amountIn,expected,stage:r.data.updatedTradeState?.stage});}
const reverse=await call('/api/whatsapp/chat',{message:'Swap 25000 cedis to naira',currentState:{corridor:'GHS_TO_NGN',amountIn:25000,rate:105.06}});
record('Reverse corridor computes NGN by multiplying',reverse.data.updatedTradeState?.amountOut===2626500,{amountOut:reverse.data.updatedTradeState?.amountOut,expected:2626500,reply:reverse.data.reply});
for(const message of ['I have paid','How do I upload a receipt?','I have not transferred any money']){const r=await call('/api/whatsapp/chat',{message});record('Unverified text must not authorize: '+message,r.data.createdTicket?.status!=='SAFE_TO_DISBURSE',{status:r.data.createdTicket?.status,verdict:r.data.createdTicket?.gevSystem1?.verdict});}
const r1=await call('/api/whatsapp/chat',{message:'Swap 2.5m Naira'});
const r2=await call('/api/whatsapp/chat',{message:'MTN MoMo 0240000000 Audit Person',currentState:r1.data.updatedTradeState});
const r3=await call('/api/whatsapp/chat',{message:'I have paid',currentState:r2.data.updatedTradeState});
const after=await call('/api/tickets');
record('Quote to payment workflow persists a reloadable ticket',after.data.tickets.some(x=>x.id===r2.data.createdTicket?.id),{stages:[r1.data.updatedTradeState?.stage,r2.data.updatedTradeState?.stage,r3.data.updatedTradeState?.stage],expiresAt:r2.data.createdTicket?.expiresAt,paymentStatus:r3.data.createdTicket?.status,persisted:false});
const payload={object:'whatsapp_business_account',entry:[{id:'AUDIT-WABA',changes:[{value:{metadata:{phone_number_id:'AUDIT-PHONE-ID'},contacts:[{profile:{name:'Audit Person'}}],messages:[{id:'wamid.AUDIT-SAME-ID',from:'233000000000',type:'image',image:{id:'AUDIT-NOT-A-REAL-MEDIA'}}]}}]}]};
const w1=await call('/api/whatsapp/webhook',payload),w2=await call('/api/whatsapp/webhook',payload);
record('Webhook rejects missing signature',w1.status===401||w1.status===403,{status:w1.status,ticketId:w1.data.ticketId,amountIn:w1.data.amountIn});
record('Webhook deduplicates message IDs',w1.data.ticketId===w2.data.ticketId,{first:w1.data.ticketId,second:w2.data.ticketId});
const good=await call('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=audit-only-token&hub.challenge=audit');
const bad=await call('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=audit');
record('Webhook verification accepts configured token and rejects wrong token',good.status===200&&bad.status===403,{good:good.status,bad:bad.status});
for(const [path,key,item] of [['/api/settings/bank-accounts','accounts',{id:'AUDIT-BANK',bankName:'Audit Bank',accountNumber:'0000000000',accountName:'Audit',dailyLimit:100}],['/api/settings/momo-wallets','wallets',{id:'AUDIT-WALLET',phoneNumber:'0000000000',merchantName:'Audit',balance:100,dailyLimit:100}]]){
const get=await call(path),post=await call(path,item),put=await call(path,{id:item.id,status:'INVALID'},'PUT'),del=await call(path+'?id='+item.id,undefined,'DELETE'),again=await call(path);
record('Settings authorization '+key,[get,post,put,del].every(r=>r.status===401),{get:get.status,post:post.status,put:put.status,delete:del.status});
record('Settings creation persists '+key,again.data[key]?.some(x=>x.id===item.id),{createSuccess:post.data.success,persisted:again.data[key]?.some(x=>x.id===item.id)});
}
const concierge1=await call('/api/concierge/chat',{messages:[{role:'user',content:'I want bureau software'}]});
const concierge2=await call('/api/concierge/chat',{messages:[{role:'user',content:'My name is Audit Person'}],currentState:concierge1.data.extracted});
record('Concierge retains bureau setup intent',concierge2.data.extracted?.inquiryType==='bureau_setup',{first:concierge1.data.extracted?.inquiryType,second:concierge2.data.extracted?.inquiryType,model:concierge2.data.telemetry?.model});
const inquiry=await call('/api/tickets',{action:'CONCIERGE_INQUIRY',amount:'2.5M',customerName:'Audit Person'});
record('Concierge persistence acknowledged honestly',inquiry.data.success!==true,{status:inquiry.status,success:inquiry.data.success,note:'No database configured'});
const health=await call('/api/ai/health');record('Health distinguishes simulation',health.data.status==='SIMULATION_MODE',{status:health.data.status,tokensUsedToday:health.data.tokensUsedToday,costTodayUsd:health.data.costTodayUsd});
const report=await call('/api/desk/report',{reportType:'DAILY_DIGEST'});
record('Operational report avoids unsupported performance claims',!report.data.report?.includes('100% capital preserved'),{status:report.status,model:report.data.model,report:report.data.report});
const logout=await call('/api/auth/logout',{}); record('Logout expires cookie',logout.cookie?.includes('1970'),{status:logout.status,expires:logout.cookie?.includes('1970')});
const summary={date:'2026-10-04',environment:'Isolated source copy; no database, AI credentials or WhatsApp credentials',checks:results.length,passed:results.filter(x=>x.verdict==='PASS').length,failed:results.filter(x=>x.verdict==='FAIL').length,results};
fs.writeFileSync(new URL('./api-results.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({checks:summary.checks,passed:summary.passed,failed:summary.failed}));
