// Isolated audit server only. Creates synthetic records; no outbound integrations.
import fs from 'node:fs';
const base='http://127.0.0.1:3017';
const results=[]; let cookie='';
async function call(path,body,auth=true) {
 const r=await fetch(base+path,{method:body===undefined?'GET':path==='/api/rates'?'PUT':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth&&cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
 const raw=await r.text(); let data;try{data=JSON.parse(raw)}catch{data={html:true}};
 const c=r.headers.get('set-cookie'); if(c&&auth)cookie=c.split(';')[0];
 return {status:r.status,data};
}
function check(name,r,expected=200){const ok=r.status===expected;results.push({name,passed:ok,status:r.status});console.log(name+': '+(ok?'PASS':'FAIL '+r.status));if(!ok)throw new Error(name+' '+JSON.stringify(r.data));return r.data;}
try {
 check('Unauthenticated trade API',await call('/api/trades',undefined,false),401);
 check('Create isolated desk',await call('/api/auth/signup',{deskName:'HTTP Audit '+Date.now(),name:'Audit Operator',email:`http-${Date.now()}@example.test`,password:'audit-synthetic-only-2026'}));
 check('Persisted session',await call('/api/auth/session'));
 check('Set NGN to GHS rate',await call('/api/rates',{corridor:'NGN_GHS',customerRate:'100',referenceRate:'99',fee:'0',minPay:'0',maxPay:null,active:true}));
 check('Add collection account',await call('/api/rails',{label:'Audit collection',currency:'NGN',kind:'BANK',provider:'Audit Bank',accountNumber:'0123456789',accountName:'Audit Desk',canCollect:true,canPay:true,openingBalance:'10000'}));
 check('Add payout account and float',await call('/api/rails',{label:'Audit payout',currency:'GHS',kind:'MOMO',provider:'MTN',accountNumber:'0551234567',accountName:'Audit Desk',canCollect:false,canPay:true,openingBalance:'10000'}));
 const rails=check('Reload accounts',await call('/api/rails')).rails;
 const ngn=rails.find(r=>r.currency==='NGN').id,ghs=rails.find(r=>r.currency==='GHS').id;
 const c=check('Create verified customer',await call('/api/customers',{name:'Audit Customer',phone:'+233200001234',kycStatus:'VERIFIED'}));
 const customers=check('Reload customers',await call('/api/customers')).customers;
 const q=check('Create quote',await call('/api/trades',{customerId:customers[0].id,corridor:'NGN_GHS',mode:'PAY',amount:'1000'}));
 const id=q.id??q.trade?.id; const token=(q.portalPath??q.trade?.portalPath??'').split('/').pop();
 if(!id||!token)throw new Error('Unexpected quote response shape: '+Object.keys(q));
 check('Public customer quote',await call('/api/portal/'+token,undefined,false));
 check('Customer accepts payout details',await call('/api/portal/'+token,{action:'accept',beneficiary:{kind:'MOMO',provider:'MTN',accountNumber:'0244123456',accountName:'Audit Customer',relationship:'SELF'}},false));
 async function action(name,action,extra={}){const t=check('Reload before '+action,await call('/api/trades/'+id)).trade;return check(name,await call('/api/trades/'+id,{action,version:t.version,...extra}));}
 await action('Record statement credit','record_funds',{railId:ngn,amount:'1000',bankReference:'HTTP-AUDIT-CREDIT',payerName:'Audit Customer'});
 const t=check('Read approval warnings',await call('/api/trades/'+id)).trade;
 await action('Approve recorded payout','approve',{acknowledged:t.signals.map(s=>s.code)});
 await action('Record external payout reference','record_payout',{railId:ghs,reference:'HTTP-AUDIT-PAYOUT'});
 const done=check('Customer sees completion',await call('/api/portal/'+token,undefined,false));
 results.push({name:'Customer final status COMPLETED',passed:done.view.trade.status==='COMPLETED'});
 for(const path of ['/api/reconcile','/api/insights','/api/team','/api/settings','/api/desk/setup','/api/channels','/api/inbox','/api/export/trades'])check('Read '+path,await call(path));
 for(const p of ['/', '/desk','/trades','/trades/new','/customers','/accounts','/rates','/inbox','/whatsapp','/susu','/susu/close','/reconcile','/insights','/team','/settings','/t/'+token])check('Page '+p,await call(p)); check('Logout',await call('/api/auth/logout',{}));
 check('Revoked session rejected',await call('/api/trades'),401);
}catch(e){console.error(e.message);results.push({name:'Probe completed',passed:false,error:e.message});process.exitCode=1;}
fs.writeFileSync(new URL('./http-results.json',import.meta.url),JSON.stringify({date:'2026-10-06',environment:'Separate local PGlite audit database, integrations disabled',results},null,2));

