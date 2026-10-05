'use client';

import { useState } from 'react';
import { Building2, UserPlus } from 'lucide-react';
import { SignOutButton } from '@clerk/nextjs';
import { api, ApiError } from '@/lib/api';
import { ROLE_LABEL, type Role } from '@/lib/auth';
import { Button, Field, Input, Notice } from '@/components/ui';

export function OnboardingForm({ invites }: { invites: { id: string; deskName: string; role: Role; invitedBy: string }[] }) {
  const [deskName, setDeskName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, json: unknown) => {
    setBusy(key);
    setError(null);
    try {
      await api('/api/onboarding', { method: 'POST', json });
      window.location.href = '/desk';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Notice tone="risk">{error}</Notice>}
      {invites.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-ink">Desks that invited you</h2>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{i.deskName}</div>
                <div className="text-xs text-muted">{ROLE_LABEL[i.role]} · invited by {i.invitedBy}</div>
              </div>
              <Button size="sm" icon={<UserPlus size={14} />} busy={busy === i.id} onClick={() => run(i.id, { action: 'accept_invite', inviteId: i.id })}>Join</Button>
            </div>
          ))}
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run('create', { action: 'create_desk', deskName });
        }}
      >
        <h2 className="text-sm font-bold text-ink">{invites.length ? 'Or start your own desk' : 'Start your desk'}</h2>
        <Field label="Desk or business name" htmlFor="desk-name">
          <Input id="desk-name" value={deskName} onChange={(e) => setDeskName(e.target.value)} placeholder="e.g. DineroYard" autoFocus />
        </Field>
        <Button type="submit" className="w-full" busy={busy === 'create'} disabled={deskName.trim().length < 2} icon={<Building2 size={15} />}>Create desk</Button>
      </form>
      <div className="text-center text-xs text-muted">
        Wrong account? <SignOutButton redirectUrl="/login"><button type="button" className="font-semibold text-brand hover:underline cursor-pointer">Sign out</button></SignOutButton>
      </div>
    </div>
  );
}
