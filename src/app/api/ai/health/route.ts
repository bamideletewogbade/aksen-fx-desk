import { NextResponse } from 'next/server';
import { aiConfigured } from '@/lib/openrouter';
import { getCtx } from '@/server/http';
import { getDb } from '@/server/db';
import { loadDeskAi } from '@/server/ai/settings';

/** What AI does on this desk and with which model. Live account status is on /api/settings/ai. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } }, { status: 401 });
  const configured = aiConfigured();
  const ai = await loadDeskAi(await getDb(), ctx.orgId);
  return NextResponse.json({
    configured,
    provider: 'OpenRouter',
    primaryModel: configured ? ai.models.model : null,
    fallbackModels: configured ? ai.models.fallbacks : [],
    usedFor: [
      ...(ai.readsChat ? ['Reading customer chat messages the assistant’s rules could not follow'] : []),
      'Rewording the desk brief and the Susu summary from computed facts',
    ],
    neverUsedFor: ['Setting rates or quotes', 'Confirming payments', 'Approving payouts', 'Changing trade status'],
  });
}
