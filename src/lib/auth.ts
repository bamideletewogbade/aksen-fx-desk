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
  OWNER: 'All desk actions, including changing another owner’s access.',
  ADMIN: 'Run the desk, approve trade payouts, record Susu cash-outs, and manage rates, accounts, channels, team and day close.',
  DEALER: 'Handle customers and messages, record trade funds and approved payouts, collect Susu savings and roll balances forward. Cannot approve cash-outs or change desk controls.',
  VIEWER: 'View desk work, customers, Susu, balances and reports. Cannot change records or move money.',
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
