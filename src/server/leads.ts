import type { Db } from './db';
import { fail } from './errors';

/** Demo requests from the public site. Stored first; the response only claims what happened. */
export async function saveLead(
  db: Db,
  input: { name: string; business?: string | null; phone?: string | null; email?: string | null; role?: string | null; monthlyTrades?: string | null; message?: string | null },
) {
  if (!input.phone?.trim() && !input.email?.trim()) fail('INVALID', 'Leave a phone number or email so we can reach you.');
  const clip = (s?: string | null, n = 200) => s?.trim().slice(0, n) || null;
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO leads (name, business, phone, email, role, monthly_trades, message) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [clip(input.name, 120), clip(input.business), clip(input.phone, 40), clip(input.email, 160), clip(input.role, 80), clip(input.monthlyTrades, 40), clip(input.message, 1000)],
  );
  return row.id;
}
