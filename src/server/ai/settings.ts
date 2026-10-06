import type { Db } from '../db';
import { requirePermission, type Ctx } from '../auth';
import { appendAudit } from '../audit';
import { fail } from '../errors';
import { accountStatus, aiConfigured, chatComplete, coolingModels, type AccountStatus } from '@/lib/openrouter';
import { isFreeModel, isModelId, MODEL_PRESETS, modelChain, parseModelList, resolveModels, type AiModels, type ModelPreset } from './models';
import { decideWithAi, type Complete } from './assist';
import { describeReading, groundReading, maskNumbers, readingPrompt } from './reader';
import * as A from '../assistant';

export interface DeskAi {
  readsChat: boolean;
  models: AiModels;
  /** The desk's own choice, before defaults (for the settings form). */
  own: { model: string | null; fallbacks: string | null };
}

export async function loadDeskAi(db: Db, orgId: string): Promise<DeskAi> {
  const [o] = await db.query<{ ai_model: string | null; ai_fallback_models: string | null; ai_reads_chat: boolean }>(
    'SELECT ai_model, ai_fallback_models, ai_reads_chat FROM organizations WHERE id = $1',
    [orgId],
  );
  const own = { model: o?.ai_model ?? null, fallbacks: o?.ai_fallback_models ?? null };
  return { readsChat: o ? Boolean(o.ai_reads_chat) : true, models: resolveModels(own), own };
}

/** A model caller for this desk's chat, or null when AI reading is off or no key is set. */
export function chatReader(ai: DeskAi): Complete | null {
  if (!ai.readsChat || !aiConfigured()) return null;
  return async (messages) => {
    const r = await chatComplete({ messages, models: modelChain(ai.models), json: true, temperature: 0, maxTokens: 300, timeoutMs: 5000, budgetMs: 9000, reasoning: 'off' });
    return { content: r.content, model: r.model };
  };
}

export interface AiOverview {
  account: AccountStatus;
  readsChat: boolean;
  models: AiModels;
  own: DeskAi['own'];
  presets: ModelPreset[];
  cooling: ReturnType<typeof coolingModels>;
  usage: { readLast7Days: number; usedLast7Days: number; failedLast7Days: number; avgMs: number | null };
}

export async function aiOverview(db: Db, ctx: Ctx): Promise<AiOverview> {
  requirePermission(ctx, 'read');
  const [ai, account, [u]] = await Promise.all([
    loadDeskAi(db, ctx.orgId),
    accountStatus(),
    db.query<{ total: string; used: string; failed: string; avg_ms: string | null }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE ai_note->>'status' = 'used')::text AS used,
              count(*) FILTER (WHERE ai_note->>'status' = 'failed')::text AS failed,
              round(avg((ai_note->>'ms')::numeric))::text AS avg_ms
         FROM messages WHERE org_id = $1 AND ai_note IS NOT NULL AND created_at > now() - interval '7 days'`,
      [ctx.orgId],
    ),
  ]);
  return {
    account,
    readsChat: ai.readsChat,
    models: ai.models,
    own: ai.own,
    presets: MODEL_PRESETS,
    cooling: coolingModels(),
    usage: { readLast7Days: Number(u?.total ?? 0), usedLast7Days: Number(u?.used ?? 0), failedLast7Days: Number(u?.failed ?? 0), avgMs: u?.avg_ms ? Number(u.avg_ms) : null },
  };
}

/** Owner-only: switching to a paid model spends the platform's OpenRouter credit. */
export async function saveDeskAi(db: Db, ctx: Ctx, input: { readsChat: boolean; model: string | null; fallbacks: string | null }) {
  requirePermission(ctx, 'configure');
  if (ctx.role !== 'OWNER') fail('FORBIDDEN', 'Only a desk owner can change the AI model.');
  const model = input.model?.trim() || null;
  if (model && !isModelId(model)) fail('INVALID', 'Use an OpenRouter model id such as nvidia/nemotron-3-super-120b-a12b:free.');
  const fallbacks = input.fallbacks === null ? null : parseModelList(input.fallbacks).join(',');
  await db.tx(async (q) => {
    await q.query('UPDATE organizations SET ai_model = $2, ai_fallback_models = $3, ai_reads_chat = $4 WHERE id = $1', [ctx.orgId, model, fallbacks, input.readsChat]);
    await appendAudit(q, {
      orgId: ctx.orgId,
      action: 'settings.ai',
      actor: { type: 'USER', id: ctx.userId, label: ctx.userName },
      data: { model, fallbacks, readsChat: input.readsChat, paid: model ? !isFreeModel(model) : false },
    });
  });
  return aiOverview(db, ctx);
}

const SAMPLES = [
  'abeg how much be 200k naira for cedis',
  'my sister go collect 3k cedis for vodafone',
  'oya lock am',
  'send am to MTN 0241234567, name na Kwame Asante',
];

/** Runs sample customer messages through the real reading path with the desk's models. Nothing is saved or sent. */
export async function testDeskAi(db: Db, ctx: Ctx, override?: { model?: string | null }) {
  requirePermission(ctx, 'configure');
  const ai = await loadDeskAi(db, ctx.orgId);
  const models = override?.model && isModelId(override.model) ? { ...ai.models, model: override.model.trim(), source: 'desk' as const } : ai.models;
  if (!aiConfigured()) fail('CONFLICT', 'OPENROUTER_API_KEY is not set on the server.');
  const complete = chatReader({ ...ai, readsChat: true, models })!;
  const facts: A.Facts = {
    deskName: ctx.orgName, timezone: 'Africa/Accra', now: new Date(), profileName: 'Test', customerName: null,
    rates: [{ corridor: 'NGN_GHS', rate: '106.20', feeMinor: 0, minPayMinor: 0, maxPayMinor: null }, { corridor: 'GHS_NGN', rate: '103.90', feeMinor: 0, minPayMinor: 0, maxPayMinor: null }],
    quoteTtlMinutes: 15, fundsWindowMinutes: 60, trade: null, lastPayout: null, recentlyTalked: true, phone: null,
  };
  const results = [];
  for (const text of SAMPLES) {
    const started = Date.now();
    try {
      // Always ask the model here (even where the rules would cope) so every sample shows what it read.
      const { masked, numbers } = maskNumbers(text);
      const r = await complete(readingPrompt({ maskedText: masked, step: 'IDLE', lastReply: null }));
      const reading = groundReading(r.content, { text, numbers });
      const live = await decideWithAi({ text, media: 'none', state: { ...A.FRESH }, facts }, async () => r);
      results.push({ text, ok: Boolean(reading), model: r.model, ms: Date.now() - started, reading: reading ? describeReading(reading) : null, reply: live.decision.replies.join(' ') || null });
    } catch (e) {
      results.push({ text, ok: false, model: null, ms: Date.now() - started, reading: null, reply: null, error: (e as Error).message });
    }
  }
  return { models, results };
}
