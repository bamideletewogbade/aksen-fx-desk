import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/server/db';
import { acceptInvite, createInvite, listTeam, login, resolveSession, revokeInvite, signup, updateMember, type Ctx } from '@/server/auth';

const password = 'team-access-test-2026';

describe('team access', () => {
  let db: Db;
  let owner: Ctx;

  beforeAll(async () => {
    db = await createTestDb();
    await signup(db, { deskName: 'DineroYard', name: 'Desk owner', email: 'owner@team.test', password });
    owner = (await resolveSession(db, (await login(db, { email: 'owner@team.test', password })).token))!;
  });

  it('applies role changes to an existing session and blocks a demoted actor using a stale request context', async () => {
    const { token } = await createInvite(db, owner, { email: 'admin@team.test', role: 'ADMIN' });
    const session = await acceptInvite(db, { token, name: 'Desk admin', password });
    const admin = (await resolveSession(db, session.token))!;
    await updateMember(db, owner, { userId: admin.userId, role: 'OWNER' });
    const secondOwner = (await resolveSession(db, session.token))!;
    expect(secondOwner.role).toBe('OWNER');

    await updateMember(db, secondOwner, { userId: owner.userId, role: 'VIEWER' });
    expect((await resolveSession(db, (await login(db, { email: 'owner@team.test', password })).token))?.role).toBe('VIEWER');
    await expect(updateMember(db, owner, { userId: admin.userId, role: 'VIEWER' })).rejects.toThrow(/team access has changed/i);
    await expect(createInvite(db, owner, { email: 'stale@team.test', role: 'ADMIN' })).rejects.toThrow(/team access has changed/i);
    await expect(updateMember(db, secondOwner, { userId: secondOwner.userId, active: false })).rejects.toThrow(/own role or access/i);
    owner = secondOwner;
  });

  it('rejects empty changes and revokes removed members’ sessions', async () => {
    const { token } = await createInvite(db, owner, { email: 'dealer@team.test', role: 'DEALER' });
    const session = await acceptInvite(db, { token, name: 'Desk dealer', password });
    const dealer = (await resolveSession(db, session.token))!;
    expect((await listTeam(db, dealer)).members.map((m) => m.user_id)).toEqual([dealer.userId]);
    await expect(updateMember(db, owner, { userId: dealer.userId })).rejects.toThrow(/Choose a role or access change/);
    await updateMember(db, owner, { userId: dealer.userId, active: false });
    expect(await resolveSession(db, session.token)).toBeNull();
    expect((await listTeam(db, owner)).members.find((m) => m.user_id === dealer.userId)?.active).toBe(false);
  });

  it('records invite revocation and will not revoke the same invite twice', async () => {
    const { inviteId } = await createInvite(db, owner, { email: 'viewer@team.test', role: 'VIEWER' });
    await revokeInvite(db, owner, inviteId);
    await expect(revokeInvite(db, owner, inviteId)).rejects.toThrow(/Pending invite not found/);
  });
});
