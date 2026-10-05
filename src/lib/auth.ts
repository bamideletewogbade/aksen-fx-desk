/**
 * Client-safe view of the signed-in operator. Authentication itself lives in
 * src/server/auth.ts; sessions are opaque HttpOnly cookies the browser cannot read.
 */
export type Role = 'OWNER' | 'ADMIN' | 'DEALER' | 'VIEWER';

export interface Session {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  email: string;
  role: Role;
  isDemo: boolean;
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  DEALER: 'Dealer',
  VIEWER: 'Viewer',
};

export const ROLE_HELP: Record<Role, string> = {
  OWNER: 'Everything, including other owners.',
  ADMIN: 'Approve payouts and refunds, set rates, manage accounts, team and day close.',
  DEALER: 'Create quotes, record credits and payouts, put trades on hold.',
  VIEWER: 'Read-only access to trades and reports.',
};

const RANK: Record<Role, number> = { VIEWER: 0, DEALER: 1, ADMIN: 2, OWNER: 3 };
export const canTrade = (s: Pick<Session, 'role'>) => RANK[s.role] >= 1;
export const canApprove = (s: Pick<Session, 'role'>) => RANK[s.role] >= 2;

export function initialsOf(session?: Pick<Session, 'userName'> | null): string {
  if (!session?.userName) return 'OP';
  return session.userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
