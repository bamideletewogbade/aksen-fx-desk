import { redirect } from 'next/navigation';

/** Clerk's default path; the desk's own sign-in page lives at /login. */
export default function SignInPage() {
  redirect('/login');
}
