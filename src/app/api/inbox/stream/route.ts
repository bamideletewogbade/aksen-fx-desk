import { deskRoute } from '@/server/http';
import { inboxRev } from '@/server/inbox';

/**
 * Live inbox updates over Server-Sent Events. Sends `change` with the desk's
 * latest inbox revision whenever anything moves (new message, delivery tick,
 * takeover). The browser then refetches what it shows. The stream ends after
 * ~55 s and EventSource reconnects, which also re-checks the session.
 */
export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const GET = deskRoute(async ({ req, db, ctx }) => {
  const enc = new TextEncoder();
  let last = Number(req.headers.get('last-event-id') ?? -1);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      req.signal.addEventListener('abort', () => (open = false));
      const send = (s: string) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          open = false;
        }
      };
      send('retry: 2000\n\n');
      const started = Date.now();
      let pinged = Date.now();
      while (open && Date.now() - started < 55_000) {
        try {
          const rev = await inboxRev(db, ctx.orgId);
          if (rev !== last) {
            last = rev;
            send(`id: ${rev}\nevent: change\ndata: ${rev}\n\n`);
          } else if (Date.now() - pinged > 15_000) {
            pinged = Date.now();
            send(': ping\n\n');
          }
        } catch {
          break;
        }
        await sleep(1200);
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
});
