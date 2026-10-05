import { body, deskRoute } from '@/server/http';
import { simulateSchema } from '@/server/schemas';
import { simulateInbound } from '@/server/inbox';

/** Plays a test customer message into the inbox. Replies are recorded, never sent. */
export const POST = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(req, simulateSchema);
  return simulateInbound(db, ctx, input);
});
