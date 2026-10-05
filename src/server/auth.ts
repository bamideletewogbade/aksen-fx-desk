import type { Db, Queryable } from './db';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { DomainError, fail } from './errors';
import { appendAudit } from './audit';

export type Role = 'OWNER' | 'ADMIN' | 'DEALER' | 'VIEWER';

/** Everything a request needs to know about who is acting and for which desk. */
export interface Ctx {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  email: string;
  role: Role;
  isDemo: boolean;
  sessionId: string;
}

export const SESSION_TTL_DAYS = 14;

const RANK: Record<Role, number> = { VIEWER: 0, DEALER: 1, ADMIN: 2, OWNER: 3 };

export type Permission =
  | 'read'
  | 'trade' // quote, record funds, record payout, hold, cancel
  | 'approve' // approve payouts, refunds
  | 'configure' // rates, rails, desk policy, day close
  | 'team'; // invites and roles

const NEEDS: Record<Permission, Role> = {
  read: 'VIEWER',
  trade: 'DEALER',
  approve: 'ADMIN',
  configure: 'ADMIN',
  team: 'ADMIN',
};

export function can(ctx: Pick<Ctx, 'role'>, permission: Permission): boolean {
  return RANK[ctx.role] >= RANK[NEEDS[permission]];
}

export function requirePermission(ctx: Ctx, permission: Permission) {
  if (!can(ctx, permission)) {
    fail('FORBIDDEN', `Your role (${ctx.role.toLowerCase()}) cannot do this. Ask a desk admin.`);
  }
}

export const actorOf = (ctx: Ctx) => ({ type: 'USER' as const, id: ctx.userId, label: ctx.userName });

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'desk'
  );
}

export function validatePassword(pw: string) {
  if (pw.length < 10) fail('INVALID', 'Use at least 10 characters for your password.');
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password)/i.test(pw)) {
    fail('INVALID', 'That password is too easy to guess.');
  }
}

/** Creates a desk (organisation) with its first owner. */
export async function signup(
  db: Db,
  input: { deskName: string; name: string; email: string; password: string; isDemo?: boolean },
): Promise<{ orgId: string; userId: string }> {
  validatePassword(input.password);
  const email = normEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  return db.tx(async (q) => {
    const existing = await q.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.length) fail('CONFLICT', 'An account with this email already exists. Sign in instead.');
    const base = slugify(input.deskName);
    const taken = await q.query<{ slug: string }>('SELECT slug FROM organizations WHERE slug LIKE $1', [`${base}%`]);
    const slug = taken.length ? `${base}-${taken.length + 1}` : base;
    const [org] = await q.query<{ id: string }>(
      'INSERT INTO organizations (name, slug, is_demo) VALUES ($1, $2, $3) RETURNING id',
      [input.deskName.trim(), slug, Boolean(input.isDemo)],
    );
    const [user] = await q.query<{ id: string }>(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, input.name.trim(), passwordHash],
    );
    await q.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'OWNER')", [org.id, user.id]);
    await appendAudit(q, {
      orgId: org.id,
      action: 'desk.created',
      actor: { type: 'USER', id: user.id, label: input.name.trim() },
      data: { deskName: input.deskName.trim() },
    });
    return { orgId: org.id, userId: user.id };
  });
}

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

/** Verifies credentials and opens a session. Returns the raw token for the cookie. */
export async function login(
  db: Db,
  input: { email: string; password: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const email = normEmail(input.email);
  const [user] = await db.query<{ id: string; password_hash: string; failed_logins: number; locked_until: Date | string | null }>(
    'SELECT id, password_hash, failed_logins, locked_until FROM users WHERE email = $1',
    [email],
  );
  const wrong = () => fail('UNAUTHENTICATED', 'Email or password is incorrect.');
  if (!user) {
    // Spend comparable time so response timing does not reveal which emails exist.
    await verifyPassword(input.password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    return wrong();
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    fail('RATE_LIMITED', `Too many attempts. Try again after ${LOCK_MINUTES} minutes or reset with your desk admin.`);
  }
  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    const failed = Number(user.failed_logins) + 1;
    const lock = failed >= MAX_FAILED;
    await db.query(
      `UPDATE users SET failed_logins = $2,
         locked_until = CASE WHEN $3 THEN now() + interval '${LOCK_MINUTES} minutes' ELSE NULL END
       WHERE id = $1`,
      [user.id, lock ? 0 : failed, lock],
    );
    return wrong();
  }
  const [membership] = await db.query<{ org_id: string }>(
    `SELECT m.org_id FROM memberships m JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1 AND m.active ORDER BY m.created_at LIMIT 1`,
    [user.id],
  );
  if (!membership) fail('FORBIDDEN', 'Your access to this desk has been removed. Contact your desk admin.');
  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
  return openSession(db, user.id, membership.org_id, input.userAgent);
}

export async function openSession(db: Queryable, userId: string, orgId: string, userAgent?: string | null) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await db.query(
    'INSERT INTO sessions (token_hash, user_id, org_id, expires_at, user_agent) VALUES ($1, $2, $3, $4, $5)',
    [sha256(token), userId, orgId, expiresAt, userAgent?.slice(0, 200) ?? null],
  );
  return { token, expiresAt };
}

export async function resolveSession(db: Db, token: string | undefined | null): Promise<Ctx | null> {
  if (!token || token.length < 20) return null;
  const [row] = await db.query<{
    session_id: string;
    org_id: string;
    org_name: string;
    is_demo: boolean;
    user_id: string;
    user_name: string;
    email: string;
    role: Role;
    last_seen_at: Date | string;
  }>(
    `SELECT s.id AS session_id, s.org_id, o.name AS org_name, o.is_demo, u.id AS user_id, u.name AS user_name,
            u.email, m.role, s.last_seen_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id AND m.active
       JOIN organizations o ON o.id = s.org_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
  }
  return {
    orgId: row.org_id,
    orgName: row.org_name,
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    role: row.role,
    isDemo: Boolean(row.is_demo),
    sessionId: row.session_id,
  };
}

// ---------- Clerk sign-in ----------
//
// Clerk proves who the person is; this database still decides which desk they
// belong to and what they may do. Nothing here trusts an unverified email.

/** Marks a password column for Clerk-only users: verifyPassword never accepts it. */
const CLERK_ONLY = 'clerk';

/** The desk session for a linked Clerk user, or null when they have no active desk yet. */
export async function ctxForClerkUser(db: Db, clerkUserId: string, clerkSessionId: string | null): Promise<Ctx | null> {
  const [row] = await db.query<{ user_id: string; user_name: string; email: string; org_id: string; org_name: string; is_demo: boolean; role: Role }>(
    `SELECT u.id AS user_id, u.name AS user_name, u.email, m.org_id, o.name AS org_name, o.is_demo, m.role
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.active
       JOIN organizations o ON o.id = m.org_id
      WHERE u.clerk_user_id = $1
      ORDER BY m.created_at LIMIT 1`,
    [clerkUserId],
  );
  if (!row) return null;
  return {
    orgId: row.org_id,
    orgName: row.org_name,
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    role: row.role,
    isDemo: Boolean(row.is_demo),
    sessionId: `clerk:${clerkSessionId ?? clerkUserId}`,
  };
}

/**
 * Finds or creates the local user for a Clerk identity. An existing account is
 * claimed only through an email Clerk has verified, so nobody can take over a
 * desk by typing someone else's address.
 */
export async function linkClerkUser(
  db: Db,
  input: { clerkUserId: string; email: string | null; emailVerified: boolean; name: string },
): Promise<{ userId: string; email: string; name: string }> {
  return db.tx(async (q) => {
    const [linked] = await q.query<{ id: string; email: string; name: string }>('SELECT id, email, name FROM users WHERE clerk_user_id = $1', [input.clerkUserId]);
    if (linked) return { userId: linked.id, email: linked.email, name: linked.name };
    if (!input.email || !input.emailVerified) fail('FORBIDDEN', 'Verify your email address with Clerk first.');
    const email = normEmail(input.email!);
    const [byEmail] = await q.query<{ id: string; name: string; clerk_user_id: string | null }>('SELECT id, name, clerk_user_id FROM users WHERE email = $1 FOR UPDATE', [email]);
    if (byEmail) {
      if (byEmail.clerk_user_id && byEmail.clerk_user_id !== input.clerkUserId) fail('CONFLICT', 'This email is already linked to a different sign-in.');
      await q.query('UPDATE users SET clerk_user_id = $2, last_login_at = now() WHERE id = $1', [byEmail.id, input.clerkUserId]);
      return { userId: byEmail.id, email, name: byEmail.name };
    }
    const name = input.name.trim() || email.split('@')[0];
    const [created] = await q.query<{ id: string }>('INSERT INTO users (email, name, password_hash, clerk_user_id) VALUES ($1, $2, $3, $4) RETURNING id', [email, name, CLERK_ONLY, input.clerkUserId]);
    return { userId: created.id, email, name };
  });
}

/** Invites waiting for this email (shown on onboarding instead of a password-based join). */
export async function invitesForEmail(db: Db, email: string) {
  return db.query<{ id: string; org_name: string; role: Role; invited_by: string }>(
    `SELECT i.id, o.name AS org_name, i.role, u.name AS invited_by
       FROM invites i JOIN organizations o ON o.id = i.org_id JOIN users u ON u.id = i.invited_by
      WHERE i.email = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      ORDER BY i.created_at DESC`,
    [normEmail(email)],
  );
}

export async function acceptInviteAsUser(db: Db, user: { userId: string; email: string; name: string }, inviteId: string) {
  await db.tx(async (q) => {
    const [inv] = await q.query<{ id: string; org_id: string; role: Role }>(
      `SELECT id, org_id, role FROM invites
        WHERE id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`,
      [inviteId, normEmail(user.email)],
    );
    if (!inv) fail('EXPIRED', 'This invite has expired or was already used. Ask for a new one.');
    await q.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true`,
      [inv.org_id, user.userId, inv.role],
    );
    await q.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [inv.id]);
    await appendAudit(q, { orgId: inv.org_id, action: 'team.joined', actor: { type: 'USER', id: user.userId, label: user.name }, data: { email: user.email, role: inv.role } });
  });
}

/** A Clerk-signed-in person creates their own desk and becomes its owner. */
export async function createDeskForUser(db: Db, user: { userId: string; name: string }, deskName: string): Promise<string> {
  const name = deskName.trim();
  if (name.length < 2) fail('INVALID', 'Enter your desk or business name.');
  return db.tx(async (q) => {
    const existing = await q.query('SELECT 1 FROM memberships WHERE user_id = $1 AND active', [user.userId]);
    if (existing.length) fail('CONFLICT', 'You already belong to a desk.');
    const base = slugify(name);
    const taken = await q.query<{ slug: string }>('SELECT slug FROM organizations WHERE slug LIKE $1', [`${base}%`]);
    const slug = taken.length ? `${base}-${taken.length + 1}` : base;
    const [org] = await q.query<{ id: string }>('INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id', [name, slug]);
    await q.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'OWNER')", [org.id, user.userId]);
    await appendAudit(q, { orgId: org.id, action: 'desk.created', actor: { type: 'USER', id: user.userId, label: user.name }, data: { deskName: name } });
    return org.id;
  });
}

export async function logout(db: Db, token: string | undefined) {
  if (!token) return;
  await db.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1', [sha256(token)]);
}

// ---------- Team ----------

export async function createInvite(db: Db, ctx: Ctx, input: { email: string; role: Exclude<Role, 'OWNER'> }) {
  requirePermission(ctx, 'team');
  const email = normEmail(input.email);
  const token = newToken(24);
  return db.tx(async (q) => {
    const member = await q.query(
      'SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND u.email = $2 AND m.active',
      [ctx.orgId, email],
    );
    if (member.length) fail('CONFLICT', 'This person is already on your desk.');
    await q.query('UPDATE invites SET revoked_at = now() WHERE org_id = $1 AND email = $2 AND accepted_at IS NULL', [ctx.orgId, email]);
    const [inv] = await q.query<{ id: string }>(
      `INSERT INTO invites (org_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`,
      [ctx.orgId, email, input.role, sha256(token), ctx.userId],
    );
    await appendAudit(q, { orgId: ctx.orgId, action: 'team.invited', actor: actorOf(ctx), data: { email, role: input.role } });
    return { inviteId: inv.id, token };
  });
}

export async function getInvite(db: Db, token: string) {
  const [inv] = await db.query<{ id: string; email: string; role: Role; org_name: string; existing_user: boolean }>(
    `SELECT i.id, i.email, i.role, o.name AS org_name,
            EXISTS (SELECT 1 FROM users u WHERE u.email = i.email) AS existing_user
       FROM invites i JOIN organizations o ON o.id = i.org_id
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`,
    [sha256(token)],
  );
  return inv ?? null;
}

export async function acceptInvite(
  db: Db,
  input: { token: string; name: string; password: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  return db.tx(async (q) => {
    const [inv] = await q.query<{ id: string; org_id: string; email: string; role: Role }>(
      `SELECT id, org_id, email, role FROM invites
        WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`,
      [sha256(input.token)],
    );
    if (!inv) fail('EXPIRED', 'This invite link has expired or was already used. Ask for a new one.');
    let [user] = await q.query<{ id: string; name: string; password_hash: string }>(
      'SELECT id, name, password_hash FROM users WHERE email = $1',
      [inv.email],
    );
    if (user) {
      if (!(await verifyPassword(input.password, user.password_hash))) {
        fail('UNAUTHENTICATED', 'You already have an Aksen account. Enter that password to join this desk.');
      }
    } else {
      validatePassword(input.password);
      [user] = await q.query<{ id: string; name: string; password_hash: string }>(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, name, password_hash',
        [inv.email, input.name.trim(), await hashPassword(input.password)],
      );
    }
    await q.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true`,
      [inv.org_id, user.id, inv.role],
    );
    await q.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [inv.id]);
    await appendAudit(q, {
      orgId: inv.org_id,
      action: 'team.joined',
      actor: { type: 'USER', id: user.id, label: user.name },
      data: { email: inv.email, role: inv.role },
    });
    return openSession(q, user.id, inv.org_id, input.userAgent);
  });
}

export async function listTeam(db: Db, ctx: Ctx) {
  const members = await db.query<{ user_id: string; name: string; email: string; role: Role; active: boolean; last_login_at: string | null }>(
    `SELECT u.id AS user_id, u.name, u.email, m.role, m.active, u.last_login_at
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1 ORDER BY m.active DESC, m.created_at`,
    [ctx.orgId],
  );
  const invites = can(ctx, 'team')
    ? await db.query<{ id: string; email: string; role: Role; expires_at: string }>(
        `SELECT id, email, role, expires_at FROM invites
          WHERE org_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC`,
        [ctx.orgId],
      )
    : [];
  return { members, invites };
}

export async function updateMember(db: Db, ctx: Ctx, input: { userId: string; role?: Role; active?: boolean }) {
  requirePermission(ctx, 'team');
  if (input.userId === ctx.userId) fail('INVALID', 'You cannot change your own role or access.');
  return db.tx(async (q) => {
    const [m] = await q.query<{ role: Role }>(
      'SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2 FOR UPDATE',
      [ctx.orgId, input.userId],
    );
    if (!m) fail('NOT_FOUND', 'Team member not found.');
    if (m.role === 'OWNER' && ctx.role !== 'OWNER') fail('FORBIDDEN', 'Only an owner can change another owner.');
    if (input.role === 'OWNER' && ctx.role !== 'OWNER') fail('FORBIDDEN', 'Only an owner can make someone an owner.');
    await q.query(
      'UPDATE memberships SET role = COALESCE($3, role), active = COALESCE($4, active) WHERE org_id = $1 AND user_id = $2',
      [ctx.orgId, input.userId, input.role ?? null, input.active ?? null],
    );
    if (input.active === false) {
      await q.query('UPDATE sessions SET revoked_at = now() WHERE org_id = $1 AND user_id = $2 AND revoked_at IS NULL', [ctx.orgId, input.userId]);
    }
    await appendAudit(q, { orgId: ctx.orgId, action: 'team.updated', actor: actorOf(ctx), data: { userId: input.userId, role: input.role, active: input.active } });
  });
}

export async function revokeInvite(db: Db, ctx: Ctx, inviteId: string) {
  requirePermission(ctx, 'team');
  await db.query('UPDATE invites SET revoked_at = now() WHERE id = $1 AND org_id = $2', [inviteId, ctx.orgId]);
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
