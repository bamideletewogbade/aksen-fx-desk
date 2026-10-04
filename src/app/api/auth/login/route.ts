import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, encodeSession, sessionFromEmail } from '@/lib/auth';

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; name?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '').trim();
  const name = body.name ? String(body.name).trim() : undefined;

  // Zero-friction check: Any valid email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address (e.g., operator@bureau.com).' }, { status: 400 });
  }

  // Zero-friction check: Any 6-character or 6-digit password/PIN
  if (password.length < 6) {
    return NextResponse.json({ error: 'Passcode must be at least 6 characters/digits.' }, { status: 400 });
  }

  const session = sessionFromEmail(email, name);

  const response = NextResponse.json({
    ok: true,
    session,
    message: 'Authenticated successfully.',
  });

  response.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: false, // Accessible by client components for avatar and session state
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
