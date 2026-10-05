import { deskRoute, query } from '@/server/http';
import { recentActivity } from '@/server/activity';

export const GET = deskRoute(async ({ req, db, ctx }) => ({ activity: await recentActivity(db, ctx, Number(query(req).get('limit') ?? 12)) }));
