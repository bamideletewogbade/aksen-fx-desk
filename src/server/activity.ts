import type { Db } from './db';
import { requirePermission, type Ctx } from './auth';
import { describeEvent } from '@/lib/trades';

/** The desk's latest trade events in plain words, newest first, for the Desk activity feed. */
export interface ActivityItem {
  seq: number;
  at: string;
  text: string;
  actor: string;
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM';
  tradeId: string;
  tradeRef: string;
  customer: string;
}

export async function recentActivity(db: Db, ctx: Ctx, limit = 12): Promise<ActivityItem[]> {
  requirePermission(ctx, 'read');
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ae.seq, ae.action, ae.actor_type, ae.actor_label, ae.data, ae.at_iso, t.id AS trade_id, t.ref, c.name AS customer
       FROM audit_events ae
       JOIN trades t ON t.id = ae.trade_id
       JOIN customers c ON c.id = t.customer_id
      WHERE ae.org_id = $1 AND ae.action <> 'trade.note'
        AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.id = t.conversation_id AND cv.is_test)
      ORDER BY ae.seq DESC LIMIT $2`,
    [ctx.orgId, Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((r) => ({
    seq: Number(r.seq),
    at: r.at_iso as string,
    text: describeEvent({ action: r.action as string, data: (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown> }),
    actor: r.actor_label as string,
    actorType: r.actor_type as ActivityItem['actorType'],
    tradeId: r.trade_id as string,
    tradeRef: r.ref as string,
    customer: r.customer as string,
  }));
}
