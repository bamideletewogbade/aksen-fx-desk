import { body, deskRoute } from '@/server/http';
import { settingsSchema } from '@/server/schemas';
import { getSettings, updateSettings } from '@/server/desk';
import { verifyChain } from '@/server/audit';

export const GET = deskRoute(async ({ db, ctx }) => ({ settings: await getSettings(db, ctx) }));

export const PUT = deskRoute(async ({ req, db, ctx }) => {
  const i = await body(req, settingsSchema);
  await updateSettings(db, ctx, {
    ...i,
    approvalThresholdNgn: i.approvalThresholdNgn ?? undefined,
    approvalThresholdGhs: i.approvalThresholdGhs ?? undefined,
  });
  return { settings: await getSettings(db, ctx) };
});

/** Recomputes the desk's whole audit chain. */
export const POST = deskRoute(async ({ db, ctx }) => ({ chain: await verifyChain(db, ctx.orgId) }));
