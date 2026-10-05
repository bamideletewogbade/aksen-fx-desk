'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff, PlayCircle } from 'lucide-react';
import { SignIn } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

export function LoginForm({ next, demo, clerk }: { next: string; demo: { email: string; approver: string; password: string } | null; clerk: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (e: string, p: string, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', json: { email: e, password: p } });
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {clerk ? (
        <div className="flex justify-center">
          <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl={next} />
        </div>
      ) : (
      <Card className="p-6">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); signIn(email, password, 'form'); }}>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" htmlFor="password">
            <div className="relative">
              <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-2.5 text-subtle hover:text-ink cursor-pointer">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          {error && <Notice tone="risk">{error}</Notice>}
          <Button type="submit" size="lg" className="w-full" busy={busy === 'form'}>Sign in</Button>
        </form>
      </Card>
      )}
      {!clerk && <p className="text-center text-sm text-muted">New desk? <Link href="/signup" className="font-semibold text-brand hover:underline">Create an account</Link></p>}
      {demo && (
        <Card className="border-dashed p-5">
          <div className="text-sm font-semibold text-ink">Explore the sample desk</div>
          <p className="mt-1 text-xs text-muted">A working desk with demo customers and trades. No real money or messages. Sign in as two people to try two-person approval.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<PlayCircle size={14} />} busy={busy === 'demo'} onClick={() => signIn(demo.email, demo.password, 'demo')}>Owner (Adwoa)</Button>
            <Button size="sm" variant="secondary" icon={<PlayCircle size={14} />} busy={busy === 'approver'} onClick={() => signIn(demo.approver, demo.password, 'approver')}>Second admin (Tunde)</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
