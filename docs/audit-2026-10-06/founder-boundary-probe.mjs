// Synthetic local HTTP checks only. All data belongs to the isolated audit database.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const base = 'http://127.0.0.1:3017';
const results = []; let cookie = '';
async function call(path, method='GET', data, options={}) {
  const r = await fetch(base+path,{method,headers:{...(data?{'content-type':'application/json'}:{}),...(options.anon?{}:{cookie}),...options.headers},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(60000),redirect:'manual'});
  if (r.headers.get('set-cookie')&&!options.anon) cookie=r.headers.get('set-cookie').split(';')[0];
  const text=await r.text(); let body; try{body=JSON.parse(text)}catch{body={text:text.slice(0,100)}}
  return {status:r.status,body,headers:r.headers};
}
function check(name, ok, detail) { results.push({name,passed:!!ok,...(detail?{detail}: {})}); console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) process.exitCode=1; }
try {
  const signup=await call('/api/auth/signup','POST',{deskName:'Boundary Audit '+Date.now(),name:'Synthetic Audit',email:`boundary-${Date.now()}@example.test`,password:'synthetic-boundary-only-2026'});
  check('Synthetic signup',signup.status===200);
  check('Session cookie is HttpOnly and SameSite=Lax',/httponly/i.test(signup.headers.get('set-cookie')??'')&&/samesite=lax/i.test(signup.headers.get('set-cookie')??''));
  const a=await call('/api/susu','POST',{name:'Synthetic Saver',daily:'50'});
  check('Create saver',a.status===200); const saverId=a.body.id;
  const collection={action:'collect',amount:'150',requestId:randomUUID()};
  const first=await call('/api/susu/'+saverId,'POST',collection);
  check('Collect three days',first.status===200&&first.body.result.days===3,first.body.result);
  const retry=await call('/api/susu/'+saverId,'POST',collection);
  check('Retry preserves collection result',retry.status===200&&isDeepStrictEqual(retry.body.result,first.body.result), {status:retry.status, result:retry.body.result});
  const changed=await call('/api/susu/'+saverId,'POST',{...collection,amount:'200'});
  check('Changed payload with reused request ID is blocked',changed.status===409);
  const negative=await call('/api/susu/'+saverId,'POST',{action:'collect',amount:'-50',requestId:randomUUID()});
  check('Negative collection is rejected',negative.status===422);
  const cross=await call('/api/susu','POST',{name:'Cross site',daily:'50'},{headers:{origin:'https://untrusted.example'}});
  check('Cross-origin write is blocked',cross.status===403);
  const report=await call('/api/desk/report','POST',{});
  check('Desk brief falls back to computed facts without model',report.status===200&&report.body.brief?.source==='facts');
  const old=await call('/api/tickets'); check('Retired ticket endpoint returns 410',old.status===410);
  const twilio=await call('/api/twilio/inbound','POST',{}, {anon:true}); check('Disabled Twilio rejects processing',twilio.status===503);
  const badPortal=await call('/api/portal/not-a-real-token','GET',undefined,{anon:true}); check('Invalid customer link does not expose a trade',[404,410,422].includes(badPortal.status));
  const ownerCookie=cookie;
  await call('/api/auth/signup','POST',{deskName:'Other Audit '+Date.now(),name:'Other Owner',email:`other-${Date.now()}@example.test`,password:'synthetic-boundary-only-2026'});
  const other=await call('/api/susu/'+saverId); check('Other tenant cannot read saver',other.status===404);
  cookie=ownerCookie;
  const withdraw=await call('/api/susu/'+saverId,'POST',{action:'withdraw',method:'Synthetic cash',reference:'AUDIT-NO-REAL-MONEY'});
  check('Admin can record synthetic withdrawal',withdraw.status===200);
  const audit=await call('/api/settings','POST',{}); check('Audit chain verifies',audit.status===200&&audit.body.chain?.ok===true,audit.body.chain);
} catch(e) { check('Probe completed',false,String(e)); }
fs.writeFileSync(new URL('./founder-boundary-results.json',import.meta.url),JSON.stringify({environment:'Isolated local PGlite, original app source, Clerk test configuration; no bank or messaging calls',results},null,2));
