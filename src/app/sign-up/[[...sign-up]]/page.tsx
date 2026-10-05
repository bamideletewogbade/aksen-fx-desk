import { redirect } from 'next/navigation';

/** Clerk's default path; the desk's own sign-up page lives at /signup. */
export default function SignUpPage() {
  redirect('/signup');
}
