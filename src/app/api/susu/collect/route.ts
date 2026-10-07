import { z } from 'zod';
import { body, deskRoute } from '@/server/http';
import { collectBulkSchema } from '@/server/schemas';
import { parseCollections, recordCollections } from '@/server/susu';
import { sendSusuSmsAfterResponse } from '@/server/susu-sms-after';

/** Quick entry for a collection round: preview first ("Ama 50, Kofi 30"), then save all. */
const action = z.union([z.object({ preview: z.string().min(1).max(10_000) }), collectBulkSchema]);

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const a = await body(req, action);
  if ('preview' in a) return { lines: await parseCollections(db, ctx, a.preview) };
  const results = await recordCollections(db, ctx, a.rows.map((r) => ({ saverId: r.saverId, amountMinor: r.amount })), a.requestId);
  sendSusuSmsAfterResponse(db,ctx.orgId);
  return { results };
});
