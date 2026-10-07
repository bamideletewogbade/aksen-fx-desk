import { body, deskRoute } from '@/server/http';
import { closePagesSchema } from '@/server/schemas';
import { closePages, pagesToClose } from '@/server/susu';

export const GET = deskRoute(async ({ db, ctx }) => pagesToClose(db, ctx));

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const i = await body(req, closePagesSchema);
  const closed = await closePages(db, ctx, i.pages);
  return { closed, ...(await pagesToClose(db, ctx)) };
});
