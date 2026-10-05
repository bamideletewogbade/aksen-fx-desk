'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

export function JoinForm({ token, existing }: { token: string; existing: boolean }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(`/api/invites/${token}`, { method: 'POST', json: { name: existing ? 'existing' : name, password } });
            window.location.href = '/desk';
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        {!existing && <Field label="Your name" htmlFor="j-name"><Input id="j-name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
        <Field label={existing ? 'Your Aksen password' : 'Choose a password'} htmlFor="j-pw" hint={existing ? 'You already have an account with this email.' : 'At least 10 characters.'}>
          <Input id="j-pw" type="password" required autoComplete={existing ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Notice tone="risk">{error}</Notice>}
        <Button type="submit" size="lg" className="w-full" busy={busy}>Join desk</Button>
      </form>
    </Card>
  );
}
