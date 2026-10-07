import { randomUUID } from 'node:crypto';
import type { Db, Queryable } from './db';
import { requirePermission, actorOf, type Ctx } from './auth';
import { appendAudit } from './audit';
import { fail } from './errors';

const API = 'https://sms.arkesel.com/api/v2';
type Fetcher = typeof fetch;
type SmsRow = { id: string; org_id: string; saver_id: string; recipient: string; message: string; attempts: number; provider_id: string | null };
export type SusuSmsStatus = 'DRAFT' | 'QUEUED' | 'SENDING' | 'ACCEPTED' | 'SANDBOX' | 'DELIVERED' | 'NOT_DELIVERED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED';
export type SusuSmsView = { id: string; kind: string; status: SusuSmsStatus; errorCode: string | null; createdAt: string; updatedAt: string; message: string; recipient: string };

/** Local Ghana numbers become international; other countries must include + or 00. */
export function smsPhone(value: string | null | undefined): string | null {
  const clean = (value ?? '').replace(/[\s().-]/g, '');
  const digits = /^0\d{9}$/.test(clean) ? `233${clean.slice(1)}` : clean.startsWith('00') ? clean.slice(2) : clean.replace(/^\+/, '');
  if (digits.startsWith('233')) return /^233[1-9]\d{8}$/.test(digits) ? digits : null;
  return /^(?:\+|00)/.test(clean) && /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

// Keep receipts ASCII (GSM-compatible), and keep free-form notes out of SMS.
export const smsText = (value: string, max = 35) => value.normalize('NFKD').replace(/[^a-zA-Z0-9 .,'-]/g, '').trim().slice(0, max);
export const smsMoney = (minor: number, currency = 'GHS') => `${currency} ${(minor / 100).toFixed(2)}`;
export function smsDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return smsText(value, 20);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

export function smsConfig() {
  const sender = process.env.ARKESEL_SENDER_ID?.trim() ?? '';
  return { configured: !!process.env.ARKESEL_API_KEY && /^[a-zA-Z0-9 ]{1,11}$/.test(sender), sender, sandbox: process.env.ARKESEL_SANDBOX !== 'false' };
}

/** Called inside the savings transaction. Never calls a provider here. */
export async function queueSusuSms(q: Queryable, ctx: Ctx, saverId: string, eventKey: string, kind: string, message: string) {
  if (ctx.isDemo) return;
  const [s] = await q.query<{ phone: string | null; sms_enabled: boolean; susu_sms_enabled: boolean }>(
    `SELECT s.phone, s.sms_enabled, o.susu_sms_enabled FROM susu_savers s JOIN organizations o ON o.id = s.org_id WHERE s.id = $1 AND s.org_id = $2`, [saverId, ctx.orgId]);
  const phone = smsPhone(s?.phone);
  if (!s?.sms_enabled || !s.susu_sms_enabled || !phone) return;
  await q.query(`INSERT INTO susu_sms (org_id,saver_id,event_key,kind,recipient,message,status) VALUES ($1,$2,$3,$4,$5,$6,'DRAFT') ON CONFLICT (org_id,event_key) DO NOTHING`,
    [ctx.orgId, saverId, eventKey, kind, phone, message]);
}

function smsView(row: Record<string, unknown>): SusuSmsView {
  return {
    id: row.id as string,
    kind: row.kind as string,
    status: row.status as SusuSmsStatus,
    errorCode: (row.error_code as string) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    message: row.message as string,
    recipient: row.recipient as string,
  };
}

export async function saverSusuSms(db: Db, ctx: Ctx, saverId: string): Promise<SusuSmsView[]> {
  requirePermission(ctx, 'read');
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.* FROM susu_sms m JOIN susu_savers s ON s.id=m.saver_id
      WHERE m.org_id=$1 AND m.saver_id=$2 AND s.org_id=$1 ORDER BY m.created_at DESC LIMIT 30`,
    [ctx.orgId, saverId],
  );
  return rows.map(smsView);
}

export async function manageSusuSms(db: Db, ctx: Ctx, input: { id: string; saverId?: string; action: 'save' | 'send' | 'cancel'; message?: string }) {
  requirePermission(ctx, 'trade');
  const message = input.message?.trim();
  if (input.action !== 'cancel' && (!message || message.length > 480)) fail('INVALID', 'Write a message between 1 and 480 characters.');
  await db.tx(async (q) => {
    const [row] = await q.query<{ id: string; saver_id: string; status: SusuSmsStatus }>('SELECT id,saver_id,status FROM susu_sms WHERE id=$1 AND org_id=$2 AND ($3::uuid IS NULL OR saver_id=$3) FOR UPDATE', [input.id, ctx.orgId, input.saverId ?? null]);
    if (!row) fail('NOT_FOUND', 'SMS draft not found.');
    if (row.status !== 'DRAFT') fail('CONFLICT', 'Only an unsent draft can be edited, sent or skipped. Refresh to see its latest status.');
    const status = input.action === 'send' ? 'QUEUED' : input.action === 'cancel' ? 'CANCELLED' : 'DRAFT';
    await q.query(`UPDATE susu_sms SET status=$3,message=COALESCE($4,message),error_code=NULL,available_at=CASE WHEN $3='QUEUED' THEN now() ELSE available_at END,updated_at=now() WHERE id=$1 AND org_id=$2`, [input.id, ctx.orgId, status, message ?? null]);
    await appendAudit(q,{orgId:ctx.orgId,actor:actorOf(ctx),action:`susu.sms_${input.action}`,data:{messageId:input.id,saverId:row.saver_id}});
  });
}

async function finish(db: Db, id: string, status: string, code: string | null = null, providerId: string | null = null) {
  await db.query(`UPDATE susu_sms SET status=$2,error_code=$3,provider_id=COALESCE($4,provider_id),updated_at=now() WHERE id=$1 AND status='SENDING'`, [id,status,code,providerId]);
}

/** Atomic claims prevent competing workers sending the same queued receipt.
 * An uncertain network result is held for review, never automatically resent.
 */
export async function dispatchSusuSms(db: Db, orgId?: string, fetcher: Fetcher = fetch, limit = 2) {
  const config = smsConfig();
  if (!config.configured) return { processed: 0 };
  await db.query(`UPDATE susu_sms SET status='UNKNOWN',error_code='worker_interrupted',updated_at=now() WHERE status='SENDING' AND claimed_at < now() - interval '5 minutes' AND ($1::uuid IS NULL OR org_id=$1)`, [orgId ?? null]);
  let processed = 0;
  await db.query(`UPDATE susu_sms SET status='CANCELLED',error_code='receipt_expired',updated_at=now() WHERE status='QUEUED' AND created_at < now() - interval '24 hours' AND ($1::uuid IS NULL OR org_id=$1)`,[orgId ?? null]);
  for (let i = 0; i < Math.min(limit, 10); i++) {
    const [row] = await db.query<SmsRow>(`WITH candidate AS (
      SELECT id FROM susu_sms WHERE status='QUEUED' AND available_at<=now() AND ($1::uuid IS NULL OR org_id=$1)
      ORDER BY available_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE susu_sms s SET status='SENDING',claimed_at=now(),attempts=attempts+1,updated_at=now()
      FROM candidate c WHERE s.id=c.id RETURNING s.*`, [orgId ?? null]);
    if (!row) break;
    processed++;
    const [saver] = await db.query<{ phone: string | null; sms_enabled: boolean; susu_sms_enabled: boolean; is_demo: boolean }>(
      `SELECT s.phone,s.sms_enabled,o.susu_sms_enabled,o.is_demo FROM susu_savers s JOIN organizations o ON o.id=s.org_id WHERE s.id=$1 AND s.org_id=$2`, [row.saver_id,row.org_id]);
    if (!saver?.sms_enabled || !saver.susu_sms_enabled || saver.is_demo || smsPhone(saver.phone) !== row.recipient) {
      await finish(db,row.id,'CANCELLED','recipient_or_preference_changed');
      continue;
    }
    let response: Response;
    try {
      response = await fetcher(`${API}/sms/send`, { method:'POST', headers:{'api-key':process.env.ARKESEL_API_KEY!, 'Content-Type':'application/json'},
        body:JSON.stringify({sender:config.sender,recipients:[row.recipient],message:row.message,sandbox:config.sandbox,use_case:'transactional'}), signal:AbortSignal.timeout(8000) });
    } catch {
      await finish(db,row.id,'UNKNOWN','network_result_unknown');
      continue;
    }
    // Only definitive rejection is retryable. A 5xx may occur after acceptance.
    if ([401,402,403,422,429].includes(response.status)) {
      await finish(db,row.id,'FAILED',`provider_${response.status}`);
      continue;
    }
    try {
      const result = await response.json() as { status?: string; data?: { recipient?: string; id?: string }[] };
      const accepted = Array.isArray(result.data) ? result.data.find((r) => String(r.recipient).replace(/^\+/, '') === row.recipient && typeof r.id === 'string' && r.id.length > 0) : undefined;
      if (response.ok && result.status === 'success' && accepted) await finish(db,row.id,config.sandbox ? 'SANDBOX' : 'ACCEPTED',null,accepted.id);
      else await finish(db,row.id,'UNKNOWN','provider_result_unknown');
    } catch { await finish(db,row.id,'UNKNOWN','provider_result_unknown'); }
  }
  return { processed };
}

/** Authoritative server-to-server status check; no unverified webhook can mark a receipt delivered. */
export async function refreshSusuSmsDelivery(db: Db, orgId?: string, fetcher: Fetcher = fetch, limit = 5) {
  if (!process.env.ARKESEL_API_KEY) return;
  for (let i=0; i<Math.min(limit,10); i++) {
    const [row] = await db.query<SmsRow>(`WITH candidate AS (
      SELECT id FROM susu_sms WHERE status='ACCEPTED' AND provider_id IS NOT NULL
      AND created_at > now() - interval '7 days' AND (checked_at IS NULL OR checked_at < now() - interval '10 minutes')
      AND ($1::uuid IS NULL OR org_id=$1) ORDER BY checked_at NULLS FIRST LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE susu_sms s SET checked_at=now() FROM candidate c WHERE s.id=c.id RETURNING s.*`,[orgId ?? null]);
    if (!row) break;
    try {
      const response = await fetcher(`${API}/sms/${encodeURIComponent(row.provider_id!)}`,{headers:{'api-key':process.env.ARKESEL_API_KEY},signal:AbortSignal.timeout(8000)});
      if (!response.ok) continue;
      const result = await response.json() as {status?:string;data?:{ID?:string;recipient?:string;status?:string}};
      const data = result.data;
      if (result.status !== 'success' || data?.ID !== row.provider_id || String(data.recipient).replace(/^\+/,'') !== row.recipient) continue;
      const status = data.status === 'DELIVERED' ? 'DELIVERED' : ['NOT_DELIVERED','EXPIRED','PROHIBITED'].includes(data.status ?? '') ? 'NOT_DELIVERED' : null;
      if (status) await db.query(`UPDATE susu_sms SET status=$2,updated_at=now() WHERE id=$1 AND status='ACCEPTED'`,[row.id,status]);
    } catch { /* Keep accepted until the next scheduled check; never resend. */ }
  }
}

export async function susuSmsOverview(db: Db, ctx: Ctx) {
  requirePermission(ctx,'configure');
  const [org] = await db.query<{ susu_sms_enabled: boolean }>('SELECT susu_sms_enabled FROM organizations WHERE id=$1',[ctx.orgId]);
  const messages = await db.query(`SELECT m.id,m.kind,m.status,m.error_code,m.created_at,m.message,s.name AS saver_name, m.recipient FROM susu_sms m JOIN susu_savers s ON s.id=m.saver_id WHERE m.org_id=$1 ORDER BY m.created_at DESC LIMIT 50`,[ctx.orgId]);
  const counts = await db.query<{ status: string; count: number }>('SELECT status,count(*)::int AS count FROM susu_sms WHERE org_id=$1 GROUP BY status',[ctx.orgId]);
  return { ...smsConfig(), enabled:org.susu_sms_enabled, messages, counts };
}

export async function setSusuSmsEnabled(db: Db, ctx: Ctx, enabled: boolean) {
  requirePermission(ctx,'configure');
  if (ctx.isDemo && enabled) fail('FORBIDDEN','SMS sending is unavailable in a sample desk.');
  if (enabled && !smsConfig().configured) fail('INVALID','Configure the Arkesel API key and approved sender name on the server first.');
  await db.tx(async (q) => {
    await q.query('UPDATE organizations SET susu_sms_enabled=$2 WHERE id=$1',[ctx.orgId,enabled]);
    if (!enabled) await q.query(`UPDATE susu_sms SET status='CANCELLED',error_code='desk_disabled',updated_at=now() WHERE org_id=$1 AND status IN ('DRAFT','QUEUED','FAILED')`,[ctx.orgId]);
    await appendAudit(q,{orgId:ctx.orgId,actor:actorOf(ctx),action:'susu.sms_setting',data:{enabled}});
  });
}

export async function retrySusuSms(db: Db, ctx: Ctx, id: string) {
  requirePermission(ctx,'configure');
  await db.tx(async (q) => {
    const rows = await q.query(`UPDATE susu_sms SET status='QUEUED',error_code=NULL,available_at=now(),updated_at=now() WHERE id=$1 AND org_id=$2 AND status='FAILED' AND created_at > now() - interval '24 hours' RETURNING id`,[id,ctx.orgId]);
    if (!rows.length) fail('CONFLICT','Only a confirmed rejection from the last 24 hours can be retried. Check uncertain sends in Arkesel before contacting the saver.');
    await appendAudit(q,{orgId:ctx.orgId,actor:actorOf(ctx),action:'susu.sms_retry',data:{messageId:id,requestId:randomUUID()}});
  });
}
