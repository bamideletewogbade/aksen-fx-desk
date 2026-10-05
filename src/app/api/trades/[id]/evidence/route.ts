import { deskRoute } from '@/server/http';
import { addEvidence, getTrade } from '@/server/trades';
import { readEvidence } from '@/server/upload';

export const POST = deskRoute<{ id: string }>(async ({ req, db, ctx, params }) => {
  await addEvidence(db, ctx, params.id, await readEvidence(req));
  return { ok: true, trade: await getTrade(db, ctx, params.id) };
});
