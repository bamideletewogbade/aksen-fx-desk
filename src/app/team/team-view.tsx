'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, useLoad } from '@/lib/api';
import { canApprove, ROLE_HELP, ROLE_LABEL, type Role } from '@/lib/auth';
import { dateTime, timeAgo } from '@/lib/time';
import { Button, Card, Dialog, Field, Input, Notice, PageHeader, Pill, Select, Skeleton, toast } from '@/components/ui';
import { ShareInvite } from './share-invite';
import { useSession } from '@/components/app-shell';

type Team = { members: { user_id: string; name: string; email: string; role: Role; active: boolean; last_login_at: string | null }[]; invites: { id: string; email: string; role: Role; expires_at: string }[] };

export function TeamView() {
  const session = useSession();
  const { data, setData, loading } = useLoad<Team>('/api/team');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DEALER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const admin = canApprove(session);

  const update = async (payload: Record<string, unknown>, msg: string) => {
    try {
      setData(await api<Team>('/api/team', { method: 'PUT', json: payload }));
      toast(msg);
    } catch (e) {
      toast((e as Error).message, 'risk');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Team" subtitle="Who can use your desk and what they can do. Payouts above your limit need a second person, so invite at least one other admin." actions={admin && <Button icon={<UserPlus size={15} />} onClick={() => { setOpen(true); setLink(null); setEmail(''); setError(null); }}>Invite</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(['OWNER', 'ADMIN', 'DEALER', 'VIEWER'] as Role[]).map((r) => (
          <Card key={r} className="p-4"><div className="text-sm font-semibold text-ink">{ROLE_LABEL[r]}</div><div className="mt-1 text-xs text-muted">{ROLE_HELP[r]}</div></Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        {loading && !data ? <Skeleton className="m-4 h-24" /> : (
          <ul className="divide-y divide-line">
            {data?.members.map((m) => (
              <li key={m.user_id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-ink">{m.name}{m.user_id === session.userId && <span className="ml-1 text-xs font-normal text-subtle">(you)</span>}</div>
                  <div className="text-xs text-subtle">{m.email} · <span suppressHydrationWarning>{m.last_login_at ? `signed in ${timeAgo(m.last_login_at)}` : 'never signed in'}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  {!m.active && <Pill tone="done">Removed</Pill>}
                  {admin && m.user_id !== session.userId && m.active ? (
                    <>
                      <Select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => update({ userId: m.user_id, role: e.target.value }, 'Role updated')} className="!w-auto !py-1.5 text-xs">
                        {(['OWNER', 'ADMIN', 'DEALER', 'VIEWER'] as Role[]).filter((r) => r !== 'OWNER' || session.role === 'OWNER').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </Select>
                      <Button size="sm" variant="danger" onClick={() => confirm(`Remove ${m.name}? They are signed out immediately.`) && update({ userId: m.user_id, active: false }, 'Access removed')}>Remove</Button>
                    </>
                  ) : admin && !m.active ? (
                    <Button size="sm" variant="secondary" onClick={() => update({ userId: m.user_id, active: true }, 'Access restored')}>Restore</Button>
                  ) : (
                    <Pill>{ROLE_LABEL[m.role]}</Pill>
                  )}
                </div>
              </li>
            ))}
            {data?.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 bg-[#fbfcfa] px-5 py-3 text-sm">
                <span><span className="text-ink">{i.email}</span> <span className="text-xs text-subtle">invited as {ROLE_LABEL[i.role]} · expires <span suppressHydrationWarning>{dateTime(i.expires_at)}</span></span></span>
                {admin && <Button size="sm" variant="ghost" onClick={() => update({ revokeInviteId: i.id }, 'Invite cancelled')}>Cancel invite</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={link ? 'Send this invite link' : 'Invite a teammate'}
        footer={link ? <Button onClick={() => setOpen(false)}>Done</Button> : (
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button busy={busy} disabled={!email.includes('@')} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const d = await api<Team & { invitePath: string }>('/api/team', { method: 'POST', json: { email, role } });
                setData({ members: d.members, invites: d.invites });
                setLink(d.invitePath);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}>Create invite</Button>
          </>
        )}
      >
        {link ? <ShareInvite path={link} email={email} /> : (
          <div className="space-y-4">
            <Field label="Their email" htmlFor="inv-email"><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Role" htmlFor="inv-role" hint={ROLE_HELP[role]}>
              <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(['ADMIN', 'DEALER', 'VIEWER'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            {error && <Notice tone="risk">{error}</Notice>}
          </div>
        )}
      </Dialog>
    </div>
  );
}
