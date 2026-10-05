import { body, deskRoute } from '@/server/http';
import { inboxAction } from '@/server/schemas';
import { getConversation, handBack, linkCustomer, markRead, operatorReply, takeOver } from '@/server/inbox';

type P = { id: string };

export const GET = deskRoute<P>(async ({ db, ctx, params }) => getConversation(db, ctx, params.id));

export const POST = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const a = await body(req, inboxAction);
  switch (a.action) {
    case 'reply': await operatorReply(db, ctx, params.id, a.text); break;
    case 'take_over': await takeOver(db, ctx, params.id); break;
    case 'hand_back': await handBack(db, ctx, params.id); break;
    case 'read': await markRead(db, ctx, params.id); return { ok: true };
    case 'link_customer': await linkCustomer(db, ctx, params.id, a.customerId); break;
  }
  return getConversation(db, ctx, params.id);
});
