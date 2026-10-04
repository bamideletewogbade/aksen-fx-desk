import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, encodeSession, sessionFromEmail } from '@/lib/auth';

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; name?: unknown; org?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '').trim();
  const name = body.name ? String(body.name).trim() : undefined;
  const org = body.org ? String(body.org).trim() : undefined;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Passcode must be at least 6 characters/digits.' }, { status: 400 });
  }

  const session = sessionFromEmail(email, name, org);

  const response = NextResponse.json({
    ok: true,
    session,
    message: 'Account created and session activated.',
  });

  response.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
