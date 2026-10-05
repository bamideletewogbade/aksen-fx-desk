import type { Queryable } from './db';
import { canonicalJson, sha256 } from './crypto';

/**
 * Tamper-evident audit trail.
 *
 * Every state change appends one event per organisation, numbered by `seq`.
 * Each event's hash covers the previous event's hash, so editing or deleting
 * any past event breaks every hash after it. `verifyChain` recomputes the
 * whole chain; the head hash can be printed on receipts and day-close reports
 * so a desk can later prove its records were not rewritten.
 */

export interface Actor {
  type: 'USER' | 'CUSTOMER' | 'SYSTEM';
  id?: string | null;
  label: string;
}

export interface AuditInput {
  orgId: string;
  action: string;
  actor: Actor;
  tradeId?: string | null;
  data?: Record<string, unknown>;
}

function eventHash(e: {
  seq: number;
  prevHash: string;
  action: string;
  tradeId: string | null;
  actor: Actor;
  data: Record<string, unknown>;
  atIso: string;
}) {
  return sha256(
    canonicalJson({
      seq: e.seq,
      prev: e.prevHash,
      action: e.action,
      trade: e.tradeId,
      actor: { type: e.actor.type, id: e.actor.id ?? null, label: e.actor.label },
      data: e.data,
      at: e.atIso,
    }),
  );
}

/** Must run inside a transaction: it locks the organisation row to serialise the chain. */
export async function appendAudit(q: Queryable, input: AuditInput): Promise<{ seq: number; hash: string }> {
  const [org] = await q.query<{ audit_seq: number | string; audit_head: string }>(
    'SELECT audit_seq, audit_head FROM organizations WHERE id = $1 FOR UPDATE',
    [input.orgId],
  );
  if (!org) throw new Error('Organisation not found for audit event');
  const seq = Number(org.audit_seq) + 1;
  const prevHash = org.audit_head;
  const atIso = new Date().toISOString();
  const data = JSON.parse(JSON.stringify(input.data ?? {})) as Record<string, unknown>;
  const tradeId = input.tradeId ?? null;
  const hash = eventHash({ seq, prevHash, action: input.action, tradeId, actor: input.actor, data, atIso });

  await q.query(
    `INSERT INTO audit_events (org_id, seq, trade_id, action, actor_type, actor_id, actor_label, data, at_iso, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
    [input.orgId, seq, tradeId, input.action, input.actor.type, input.actor.id ?? null, input.actor.label, JSON.stringify(data), atIso, prevHash, hash],
  );
  await q.query('UPDATE organizations SET audit_seq = $2, audit_head = $3 WHERE id = $1', [input.orgId, seq, hash]);
  return { seq, hash };
}

export interface ChainReport {
  ok: boolean;
  events: number;
  head: string;
  brokenAtSeq?: number;
  reason?: string;
}

export async function verifyChain(q: Queryable, orgId: string): Promise<ChainReport> {
  const rows = await q.query<{
    seq: number | string;
    trade_id: string | null;
    action: string;
    actor_type: Actor['type'];
    actor_id: string | null;
    actor_label: string;
    data: Record<string, unknown>;
    at_iso: string;
    prev_hash: string;
    hash: string;
  }>(
    `SELECT seq, trade_id, action, actor_type, actor_id, actor_label, data, at_iso, prev_hash, hash
       FROM audit_events WHERE org_id = $1 ORDER BY seq`,
    [orgId],
  );
  const [org] = await q.query<{ audit_head: string; audit_seq: number | string }>(
    'SELECT audit_head, audit_seq FROM organizations WHERE id = $1',
    [orgId],
  );
  let prev = 'GENESIS';
  let expectedSeq = 1;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (seq !== expectedSeq) return { ok: false, events: rows.length, head: prev, brokenAtSeq: expectedSeq, reason: 'An event is missing from the sequence.' };
    if (r.prev_hash !== prev) return { ok: false, events: rows.length, head: prev, brokenAtSeq: seq, reason: 'Event does not link to the previous event.' };
    const recomputed = eventHash({
      seq,
      prevHash: r.prev_hash,
      action: r.action,
      tradeId: r.trade_id,
      actor: { type: r.actor_type, id: r.actor_id, label: r.actor_label },
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
      atIso: r.at_iso,
    });
    if (recomputed !== r.hash) return { ok: false, events: rows.length, head: prev, brokenAtSeq: seq, reason: 'Event contents were changed after they were recorded.' };
    prev = r.hash;
    expectedSeq++;
  }
  if (org && (org.audit_head !== prev || Number(org.audit_seq) !== rows.length)) {
    return { ok: false, events: rows.length, head: prev, reason: 'The latest events were removed.' };
  }
  return { ok: true, events: rows.length, head: prev };
}
