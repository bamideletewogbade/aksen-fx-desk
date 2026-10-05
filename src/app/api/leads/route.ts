import { body, publicRoute, rateLimit } from '@/server/http';
import { leadSchema } from '@/server/schemas';
import { saveLead } from '@/server/leads';

export const POST = publicRoute(async ({ req, db }) => {
  await rateLimit('lead', 5);
  const input = await body(req, leadSchema);
  await saveLead(db, input);
  return { ok: true };
});
