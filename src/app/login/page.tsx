import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { getCtx } from '@/server/http';
import { dbDriver } from '@/server/db';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_APPROVER_EMAIL } from '@/server/demo-seed';
import { clerkEnabled } from '@/server/clerk';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Aksen OTC' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/desk';
  if (await getCtx()) redirect(safeNext);
  const demoEnabled = dbDriver() === 'pglite' || process.env.AKSEN_SEED_DEMO === '1';
  return (
    <AuthFrame title="Sign in to your desk" subtitle="Use the email your desk admin invited, or the one you signed up with.">
      <Suspense>
        <LoginForm next={safeNext} clerk={clerkEnabled()} demo={demoEnabled ? { email: DEMO_EMAIL, approver: DEMO_APPROVER_EMAIL, password: DEMO_PASSWORD } : null} />
      </Suspense>
    </AuthFrame>
  );
}
