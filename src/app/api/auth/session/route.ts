import { NextResponse } from 'next/server';
import { getCtx } from '@/server/http';

export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ session: null }, { status: 401 });
  const { sessionId: _sessionId, ...session } = ctx;
  return NextResponse.json({ session }, { headers: { 'Cache-Control': 'no-store' } });
}
