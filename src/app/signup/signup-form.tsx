'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

export function SignupForm() {
  const [f, setF] = useState({ deskName: '', name: '', email: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/api/auth/signup', { method: 'POST', json: f });
              window.location.href = '/desk';
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          <Field label="Desk or business name" htmlFor="desk"><Input id="desk" required value={f.deskName} onChange={set('deskName')} placeholder="e.g. Circle Forex Ltd" /></Field>
          <Field label="Your name" htmlFor="name"><Input id="name" required autoComplete="name" value={f.name} onChange={set('name')} /></Field>
          <Field label="Work email" htmlFor="email"><Input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Password" htmlFor="pw" hint="At least 10 characters. A short phrase is easiest to remember."><Input id="pw" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
          <label className="flex gap-2.5 text-xs text-muted">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#175b3b]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I confirm my business is licensed or otherwise permitted to offer currency exchange where it operates. Aksen provides software only and does not hold or move money.</span>
          </label>
          {error && <Notice tone="risk">{error}</Notice>}
          <Button type="submit" size="lg" className="w-full" busy={busy} disabled={!agree}>Create desk</Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link></p>
    </div>
  );
}
