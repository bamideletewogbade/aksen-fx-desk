import { deskRoute } from '@/server/http';
import { getMessageMedia } from '@/server/inbox';

const INLINE = /^(image\/(jpeg|png|webp|gif)|audio\/|video\/|application\/pdf)/;

export const GET = deskRoute<{ messageId: string }>(async ({ db, ctx, params }) => {
  const { bytes, mime } = await getMessageMedia(db, ctx, params.messageId);
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': INLINE.test(mime) ? mime : 'application/octet-stream',
      'Content-Disposition': INLINE.test(mime) ? 'inline' : 'attachment',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
