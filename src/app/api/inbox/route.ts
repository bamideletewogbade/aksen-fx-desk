import { deskRoute, query } from '@/server/http';
import { inboxCounts, listConversations } from '@/server/inbox';

export const GET = deskRoute(async ({ req, db, ctx }) => {
  const q = query(req);
  if (q.get('counts')) return inboxCounts(db, ctx);
  const filter = (['all', 'needs_you', 'assistant', 'human'] as const).find((f) => f === q.get('filter')) ?? 'all';
  return listConversations(db, ctx, filter, q.get('q') ?? undefined);
});
