import { deskRoute } from '@/server/http';

/** Which onboarding steps this desk has completed. Drives the setup checklist. */
export const GET = deskRoute(async ({ db, ctx }) => {
  const [r] = await db.query<Record<string, number | string>>(
    `SELECT
       (SELECT COUNT(*) FROM rate_board WHERE org_id = $1 AND active) AS rates,
       (SELECT COUNT(*) FROM rails WHERE org_id = $1 AND status = 'ACTIVE' AND can_collect) AS collect,
       (SELECT COUNT(*) FROM rails WHERE org_id = $1 AND status = 'ACTIVE' AND can_pay) AS pay,
       (SELECT COUNT(*) FROM customers WHERE org_id = $1) AS customers,
       (SELECT COUNT(*) FROM trades WHERE org_id = $1) AS trades,
       (SELECT COUNT(*) FROM memberships WHERE org_id = $1 AND active) AS members,
       (SELECT support_phone IS NOT NULL FROM organizations WHERE id = $1) AS has_phone,
       (SELECT COUNT(*) FROM channels WHERE org_id = $1 AND active) AS channels`,
    [ctx.orgId],
  );
  const steps = [
    { key: 'rates', label: 'Set your buy and sell rates', href: '/rates', done: Number(r.rates) > 0 },
    { key: 'collect', label: 'Add the accounts customers pay into', href: '/accounts', done: Number(r.collect) > 0 },
    { key: 'pay', label: 'Add the accounts you pay out from', href: '/accounts', done: Number(r.pay) > 0 },
    { key: 'phone', label: 'Add the support number customers see', href: '/settings', done: Boolean(r.has_phone) },
    { key: 'customer', label: 'Add your first customer', href: '/customers?new=1', done: Number(r.customers) > 0 },
    { key: 'chat', label: 'Connect WhatsApp so customers can ask for quotes', href: '/whatsapp', done: Number(r.channels) > 0 },
    { key: 'team', label: 'Invite a second person to approve payouts', href: '/team', done: Number(r.members) > 1 },
  ];
  return { steps, complete: steps.every((s) => s.done) };
});
