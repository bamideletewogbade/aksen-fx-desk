import { z } from 'zod';
import { body, publicRoute, rateLimit } from '@/server/http';
import { beneficiary } from '@/server/schemas';
import { getPortalView, portalAccept, portalAddEvidence } from '@/server/trades';
import { readEvidence } from '@/server/upload';

type P = { token: string };

export const GET = publicRoute<P>(async ({ db, params }) => {
  await rateLimit('portal-read', 120);
  return { view: await getPortalView(db, params.token) };
});

/** Customer actions: accept the quote (JSON) or send proof of payment (multipart). */
export const POST = publicRoute<P>(async ({ req, db, params }) => {
  await rateLimit('portal-write', 12);
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    await portalAddEvidence(db, params.token, await readEvidence(req));
  } else {
    const input = await body(req, z.object({ action: z.literal('accept'), beneficiary: beneficiary.nullable().optional() }));
    await portalAccept(db, params.token, input.beneficiary ?? null);
  }
  return { view: await getPortalView(db, params.token) };
});
