import { describe, expect, it } from 'vitest';

// Temporary: runs only when NEON_SMOKE=1. Applies migrations to the real Neon database and reads them back.
describe.runIf(process.env.NEON_SMOKE === '1')('neon smoke', () => {
  it('migrates and queries over HTTP and in a transaction', async () => {
    const { getDb } = await import('@/server/db');
    const db = await getDb();
    expect(db.driver).toBe('neon');
    const rows = await db.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(['001_core', '002_inbox', '003_clerk', '004_susu', '005_susu_collection_requests', '006_ai_reading']);
    const n = await db.tx(async (q) => (await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM organizations'))[0].n);
    expect(typeof n).toBe('number');
  }, 60_000);
});
