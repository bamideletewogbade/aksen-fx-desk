import { deskRoute } from '@/server/http';
import { getEvidenceFile } from '@/server/trades';

export const GET = deskRoute<{ id: string; evidenceId: string }>(async ({ db, ctx, params }) => {
  const f = await getEvidenceFile(db, ctx.orgId, params.id, params.evidenceId);
  return new Response(Buffer.from(f.bytes), {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `inline; filename="${f.name.replace(/[^\w.\-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
});
