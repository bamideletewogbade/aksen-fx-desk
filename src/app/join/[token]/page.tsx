import { AuthFrame } from '@/components/auth-frame';
import { getDb } from '@/server/db';
import { getInvite } from '@/server/auth';
import { ROLE_LABEL } from '@/lib/auth';
import { Notice } from '@/components/ui';
import { JoinForm } from './join-form';
import { clerkEnabled } from '@/server/clerk';
import Link from 'next/link';

export const metadata = { title: 'Join a desk · Aksen OTC', robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(await getDb(), token);
  if (!invite) {
    return (
      <AuthFrame title="Invite not available">
        <Notice tone="warn">This invite link has expired or was already used. Ask your desk admin for a new one.</Notice>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={`Join ${invite.org_name}`} subtitle={`You were invited as ${ROLE_LABEL[invite.role]} with ${invite.email}.`}>
      {clerkEnabled() ? (
        <div className="space-y-4 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm text-muted">Sign in with the invited email address. After your email is verified, this desk will appear on your onboarding screen.</p>
          <Link href="/onboarding" className="inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Continue to sign in</Link>
        </div>
      ) : <JoinForm token={token} existing={invite.existing_user} />}
    </AuthFrame>
  );
}
