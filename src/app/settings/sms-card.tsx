'use client';

import { useState } from 'react';
import { api, useLoad } from '@/lib/api';
import { Button, Card, Notice, Skeleton, Textarea } from '@/components/ui';

type SmsData = { configured:boolean; sender:string; sandbox:boolean; enabled:boolean; counts:{status:string;count:number}[]; messages:{id:string;kind:string;status:string;error_code:string|null;created_at:string;message:string;saver_name:string;recipient:string}[] };
const labels: Record<string,string> = { DRAFT:'Needs review', QUEUED:'Waiting to send', SENDING:'Sending', ACCEPTED:'Accepted by Arkesel', SANDBOX:'Test only - not delivered', DELIVERED:'Delivered', NOT_DELIVERED:'Not delivered', FAILED:'Rejected - can retry', UNKNOWN:'Needs review in Arkesel', CANCELLED:'Skipped' };

export function SmsCard() {
  const {data,error,setData,reload} = useLoad<SmsData>('/api/settings/sms',{pollMs:15000});
  const [busy,setBusy] = useState(false);
  const [problem,setProblem] = useState<string|null>(null);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  async function update(json: {enabled:boolean}|{retryId:string}|{messageId:string;action:'save'|'send'|'cancel';message?:string}) {
    setBusy(true);setProblem(null);
    try { setData(await api<SmsData>('/api/settings/sms',{method:'POST',json})); }
    catch(e) { setProblem(e instanceof Error ? e.message : 'Could not update SMS settings.'); }
    finally {setBusy(false);}
  }
  return <Card className="p-5 sm:col-span-2">
    <h2 className="text-sm font-bold text-ink">Susu SMS receipts</h2>
    <p className="mt-2 text-sm text-muted">Welcome messages, contribution receipts, withdrawals, payouts, rollovers and booklet changes. Turn receipts on for each saver after confirming their number. Existing savers start with SMS off.</p>
    {(problem || error) && <Notice tone="risk" className="mt-3">{problem || error?.message}</Notice>}
    {!data ? <Skeleton className="mt-3 h-20" /> : <>
      <p className="mt-3 text-sm">{data.configured ? `Sender: ${data.sender}. ${data.sandbox ? 'Sandbox: no messages reach phones.' : 'Live: messages use your Arkesel credit.'}` : 'Setup pending: add the Arkesel API key and approved sender name on the server.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button busy={busy} disabled={!data.configured && !data.enabled} onClick={() => update({enabled:!data.enabled})}>{data.enabled ? 'Turn off SMS receipts' : 'Turn on SMS receipts'}</Button><Button variant="secondary" onClick={reload}>Refresh status</Button></div>
      <p className="mt-2 text-xs text-subtle">{data.enabled ? 'Enabled for savers with SMS selected.' : 'Off: new savings entries will not create SMS receipts.'} Messages may use more than one SMS credit. A saved contribution remains saved if SMS fails.</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">{data.counts.map(c => <span key={c.status}>{labels[c.status] ?? c.status}: {c.count}</span>)}</div>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Recent receipts ({data.messages.length})</summary>
        <p className="mt-2 text-xs text-subtle">Accepted does not mean delivered. Check uncertain sends in Arkesel before contacting the saver; they cannot be automatically resent.</p>
        <ul className="mt-3 space-y-3">{data.messages.map(m => <li key={m.id} className="rounded-xl border border-line p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><strong>{m.saver_name}</strong><span>{labels[m.status] ?? m.status}</span></div>
          <p className="mt-1 text-xs text-subtle">+{m.recipient} · {new Date(m.created_at).toLocaleString()}</p>
          {m.status !== 'DRAFT' && <p className="mt-2 break-words text-muted">{m.message}</p>}
          {m.status === 'DRAFT' && <div className="mt-2 space-y-2">
            <Textarea rows={3} maxLength={480} value={drafts[m.id] ?? m.message} onChange={e => setDrafts({...drafts,[m.id]:e.target.value})} aria-label={`SMS draft for ${m.saver_name}`} />
            <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-xs text-subtle">{(drafts[m.id] ?? m.message).length}/480 characters</span><Button size="sm" variant="ghost" busy={busy} onClick={() => update({messageId:m.id,action:'cancel'})}>Skip</Button><Button size="sm" variant="secondary" busy={busy} disabled={(drafts[m.id] ?? m.message) === m.message} onClick={() => update({messageId:m.id,action:'save',message:drafts[m.id] ?? m.message})}>Save</Button><Button size="sm" busy={busy} onClick={() => update({messageId:m.id,action:'send',message:drafts[m.id] ?? m.message})}>Send SMS</Button></div>
          </div>}
          {m.error_code && <p className="mt-1 text-xs text-subtle">{m.error_code === 'provider_402' ? 'Arkesel credit is too low. Top up before retrying.' : m.error_code === 'provider_401' ? 'Check the Arkesel API key.' : 'Review the sender, phone number and provider account before retrying.'}</p>}
          {m.status === 'FAILED' && Date.now()-new Date(m.created_at).getTime()<86400000 && <Button className="mt-2" variant="secondary" busy={busy} onClick={() => update({retryId:m.id})}>Retry rejected receipt</Button>}
        </li>)}</ul>
      </details>
    </>}
  </Card>;
}
