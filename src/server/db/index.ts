import 'server-only';
import { MIGRATIONS } from './migrations';

/**
 * One small database interface for the whole app.
 *
 * - Production (or DB_DRIVER=neon): Neon Postgres over a pooled connection,
 *   so transactions are real BEGIN/COMMIT blocks.
 * - Local development and tests (default when NODE_ENV !== 'production'):
 *   PGlite, a real Postgres compiled to WASM, stored in .data/pglite.
 *
 * Both run the same migrations and the same SQL. Production never silently
 * falls back to local storage: a missing DATABASE_URL is a hard error.
 */

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  driver: 'neon' | 'pglite';
}

type Global = typeof globalThis & { __aksenDb?: Promise<Db>; __aksenMigrationCount?: number };
const g = globalThis as Global;

export function dbDriver(): 'neon' | 'pglite' {
  const explicit = process.env.DB_DRIVER;
  if (explicit === 'neon' || explicit === 'pglite') return explicit;
  return process.env.NODE_ENV === 'production' ? 'neon' : 'pglite';
}

async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = dataDir === 'memory' ? new PGlite() : new PGlite(dataDir ?? process.env.PGLITE_DIR ?? '.data/pglite');
  await pg.waitReady;
  const wrap = (q: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const res = await q.query(text, params);
      return res.rows as T[];
    },
  });
  return {
    driver: 'pglite',
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
  };
}

async function createNeon(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required when DB_DRIVER=neon (production).');
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    driver: 'neon',
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params);
      return res.rows as T[];
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          async query<T extends Row>(text: string, params: unknown[] = []) {
            const res = await client.query(text, params);
            return res.rows as T[];
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.tx(async (q) => {
    // Serialise concurrent cold starts.
    await q.query('SELECT pg_advisory_xact_lock(724001)');
    const done = new Set((await q.query<{ id: string }>('SELECT id FROM schema_migrations')).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      for (const statement of splitSql(m.sql)) await q.query(statement);
      await q.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    }
  });
}

/** Splits a migration into statements. Migrations avoid semicolons inside literals and function bodies. */
function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter((s) => s.length > 0);
}

/** Test helper: a fresh, migrated, in-memory database. */
export async function createTestDb(): Promise<Db> {
  const db = await createPglite('memory');
  await migrate(db);
  return db;
}

export function getDb(): Promise<Db> {
  // A running dev server keeps its connection across hot reloads; apply migrations added since it started.
  if (g.__aksenDb && g.__aksenMigrationCount !== MIGRATIONS.length) {
    g.__aksenMigrationCount = MIGRATIONS.length;
    g.__aksenDb = g.__aksenDb.then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  if (!g.__aksenDb) {
    g.__aksenMigrationCount = MIGRATIONS.length;
    g.__aksenDb = (async () => {
      const db = dbDriver() === 'neon' ? await createNeon() : await createPglite();
      await migrate(db);
      if (db.driver === 'pglite' && process.env.AKSEN_SEED_DEMO !== '0') {
        const { seedDemoIfEmpty } = await import('../demo-seed');
        await seedDemoIfEmpty(db);
      }
      return db;
    })().catch((err) => {
      g.__aksenDb = undefined;
      throw err;
    });
  }
  return g.__aksenDb;
}
