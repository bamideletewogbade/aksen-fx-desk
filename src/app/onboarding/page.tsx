import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { getDb } from '@/server/db';
import { getCtx } from '@/server/http';
import { clerkPerson } from '@/server/clerk';
import { invitesForEmail } from '@/server/auth';
import { OnboardingForm } from './onboarding-form';

export const metadata = { title: 'Set up your desk · Aksen OTC' };

export default async function OnboardingPage() {
  if (await getCtx()) redirect('/desk');
  const db = await getDb();
  const person = await clerkPerson(db).catch(() => null);
  if (!person) redirect('/login');
  const invites = await invitesForEmail(db, person.email);
  return (
    <AuthFrame title={`Welcome, ${person.name.split(' ')[0]}`} subtitle={`Signed in as ${person.email}. Join a desk that invited you, or set up your own.`}>
      <OnboardingForm invites={invites.map((i) => ({ id: i.id, deskName: i.org_name, role: i.role, invitedBy: i.invited_by }))} />
    </AuthFrame>
  );
}
