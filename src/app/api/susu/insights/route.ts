import { deskRoute } from '@/server/http';
import { nudgeList, susuSummary } from '@/server/susu-ai';

/** GET: savers to nudge (JEV-scored when available). POST: an AI-worded summary of this month's numbers. */
export const GET = deskRoute(async ({ db, ctx }) => nudgeList(db, ctx));
export const POST = deskRoute(async ({ db, ctx }) => ({ summary: await susuSummary(db, ctx) }));
