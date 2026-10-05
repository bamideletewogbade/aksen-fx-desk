import { deskRoute, query } from '@/server/http';
import { getInsights } from '@/server/insights';

export const GET = deskRoute(async ({ req, db, ctx }) => ({ insights: await getInsights(db, ctx, Number(query(req).get('days') ?? 30)) }));
