import { z } from 'zod';
import { createInvite, listTeam, revokeInvite, updateMember } from '@/server/auth';
import { body, deskRoute } from '@/server/http';
import { inviteSchema } from '@/server/schemas';

export const GET = deskRoute(async ({ db, ctx }) => listTeam(db, ctx));

/** Creates an invite. The link is shown once to the admin, who shares it however they like. */
export const POST = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(req, inviteSchema);
  const { token } = await createInvite(db, ctx, input);
  return { invitePath: `/join/${token}`, ...(await listTeam(db, ctx)) };
});

export const PUT = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(
    req,
    z.union([
      z.object({ userId: z.string().uuid(), role: z.enum(['OWNER', 'ADMIN', 'DEALER', 'VIEWER']).optional(), active: z.boolean().optional() }),
      z.object({ revokeInviteId: z.string().uuid() }),
    ]),
  );
  if ('revokeInviteId' in input) await revokeInvite(db, ctx, input.revokeInviteId);
  else await updateMember(db, ctx, input);
  return listTeam(db, ctx);
});
