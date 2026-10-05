import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { AuthFrame } from '@/components/auth-frame';
import { getCtx } from '@/server/http';
import { clerkEnabled } from '@/server/clerk';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create your desk · Aksen OTC' };

export default async function SignupPage() {
  if (await getCtx()) redirect('/desk');
  return (
    <AuthFrame title="Create your desk" subtitle="Set up takes about ten minutes: your rates, your accounts, then your first quote link.">
      {clerkEnabled() ? (
        <div className="flex justify-center">
          <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/onboarding" />
        </div>
      ) : (
        <SignupForm />
      )}
    </AuthFrame>
  );
}
