import { beforeAll, describe, expect, it } from 'vitest';
import { login, resolveSession, signup, type Ctx } from '@/server/auth';
import { createTestDb, type Db } from '@/server/db';
import { getRates, rateHistory, setRate } from '@/server/desk';

describe('simple rate board', () => {
  let db: Db;
  let owner: Ctx;

  beforeAll(async () => {
    db = await createTestDb();
    await signup(db, { deskName: 'Rate Desk', name: 'Rate Owner', email: 'rates@example.test', password: 'rate-desk-password' });
    owner = (await resolveSession(db, (await login(db, { email: 'rates@example.test', password: 'rate-desk-password' })).token))!;
  });

  it('stores four USD directions and neutralizes retired quote modifiers', async () => {
    await setRate(db, owner, {
      corridor: 'NGN_GHS',
      customerRate: '8.40',
      referenceRate: '8.10',
      feeMinor: 50_000,
      minPayMinor: 100_000,
      maxPayMinor: 2_000_000,
      active: false,
    });
    await setRate(db, owner, { corridor: 'USD_NGN', customerRate: '1,625.50' });
    await setRate(db, owner, { corridor: 'NGN_USD', customerRate: '1,640.00' });
    await setRate(db, owner, { corridor: 'USD_GHS', customerRate: '12.40' });
    await setRate(db, owner, { corridor: 'GHS_USD', customerRate: '12.70' });

    const rates = await getRates(db, owner);
    expect(rates.find((rate) => rate.corridor === 'NGN_GHS')).toMatchObject({
      customerRate: '8.40',
      referenceRate: null,
      feeMinor: 0,
      minPayMinor: 0,
      maxPayMinor: null,
      active: true,
    });
    expect(rates.find((rate) => rate.corridor === 'USD_NGN')).toMatchObject({ customerRate: '1625.50', active: true });
    expect(rates.find((rate) => rate.corridor === 'NGN_USD')).toMatchObject({ customerRate: '1640.00', active: true });
    expect(rates.find((rate) => rate.corridor === 'USD_GHS')).toMatchObject({ customerRate: '12.40', active: true });
    expect(rates.find((rate) => rate.corridor === 'GHS_USD')).toMatchObject({ customerRate: '12.70', active: true });
    expect((await rateHistory(db, owner))[0]).toMatchObject({ corridor: 'GHS_USD', to: '12.70' });
  });
});
