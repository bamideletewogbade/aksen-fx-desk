import { NextResponse } from 'next/server';
import { DEFAULT_MODEL, FALLBACK_MODELS } from '@/lib/openrouter';
import { getCtx } from '@/server/http';

/** Reports configuration only. Usage numbers are not shown because they are not measured. */
export async function GET() {
  if (!(await getCtx())) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } }, { status: 401 });
  const configured = Boolean(process.env.OPENROUTER_API_KEY);
  return NextResponse.json({
    configured,
    provider: 'OpenRouter',
    primaryModel: configured ? DEFAULT_MODEL : null,
    fallbackModels: configured ? FALLBACK_MODELS : [],
    usedFor: ['Rewording the desk brief from computed facts'],
    neverUsedFor: ['Confirming payments', 'Approving payouts', 'Changing trade status'],
  });
}
