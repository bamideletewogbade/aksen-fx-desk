import { z } from 'zod';
import { body, deskRoute, rateLimit } from '@/server/http';
import { testDeskAi } from '@/server/ai/settings';

const input = z.object({ model: z.string().trim().max(120).nullable().optional() });

/** Runs four sample customer messages through the desk's AI reading. Nothing is saved or sent. */
export const POST = deskRoute(async ({ req, db, ctx }) => {
  await rateLimit('ai-test', 6);
  return testDeskAi(db, ctx, await body(req, input));
});
