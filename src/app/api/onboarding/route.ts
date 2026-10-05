import { z } from 'zod';
import { body, publicRoute } from '@/server/http';
import { acceptInviteAsUser, createDeskForUser } from '@/server/auth';
import { clerkPerson } from '@/server/clerk';
import { fail } from '@/server/errors';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_desk'), deskName: z.string().trim().min(2, 'Enter your desk or business name').max(80) }),
  z.object({ action: z.literal('accept_invite'), inviteId: z.string().uuid() }),
]);

/** First step after a Clerk sign-up: start a desk, or join one that invited this email. */
export const POST = publicRoute(async ({ req, db }) => {
  const person = await clerkPerson(db);
  if (!person) fail('UNAUTHENTICATED', 'Sign in first.');
  const a = await body(req, schema);
  if (a.action === 'create_desk') await createDeskForUser(db, person!, a.deskName);
  else await acceptInviteAsUser(db, person!, a.inviteId);
  return { ok: true };
});
