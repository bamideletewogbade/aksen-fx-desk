import { z } from 'zod';
import { body, deskRoute } from '@/server/http';
import { aiOverview, saveDeskAi } from '@/server/ai/settings';

const input = z.object({
  readsChat: z.boolean(),
  model: z.string().trim().max(120).nullable(),
  fallbacks: z.string().trim().max(600).nullable(),
});

export const GET = deskRoute(async ({ db, ctx }) => ({ ai: await aiOverview(db, ctx) }));

export const PUT = deskRoute(async ({ req, db, ctx }) => ({ ai: await saveDeskAi(db, ctx, await body(req, input)) }));
