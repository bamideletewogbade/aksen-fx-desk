import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, decodeSession, DEFAULT_DEMO_OPERATOR } from '@/lib/auth';

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const session = decodeSession(sessionCookie);

  return NextResponse.json({
    authenticated: Boolean(session),
    session: session || null,
  });
}
