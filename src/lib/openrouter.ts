// OpenRouter client for Aksen OTC: tries each model in turn, hides model
// reasoning from the reply, and remembers for a while which models are
// rate-limited or retired so the next request doesn't wait on them again.

import { isFreeModel, modelChain, resolveModels } from '@/server/ai/models';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** Platform default (environment, else built-in). A desk's own choice is passed in as `models`. */
export const DEFAULT_MODEL = resolveModels(null).model;
export const FALLBACK_MODELS = resolveModels(null).fallbacks;

export type AiErrorCode = 'NOT_CONFIGURED' | 'NO_CREDIT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'TIMEOUT' | 'FAILED';

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) {
    super(message);
  }
}

// A model that just said "busy" (429) or "gone" (404) is skipped for a while.
type Cool = { until: number; code: AiErrorCode };
const g = globalThis as typeof globalThis & { __aksenAiCooldown?: Map<string, Cool> };
const cooldown = (g.__aksenAiCooldown ??= new Map());
const COOL_MS: Partial<Record<AiErrorCode, number>> = { RATE_LIMITED: 60_000, UNAVAILABLE: 10 * 60_000, NO_CREDIT: 5 * 60_000 };

function codeFor(status: number): AiErrorCode {
  if (status === 401 || status === 403) return 'NOT_CONFIGURED';
  if (status === 402) return 'NO_CREDIT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'UNAVAILABLE';
  return 'FAILED';
}

/** Models currently being skipped, for the Settings page. */
export function coolingModels(): { model: string; code: AiErrorCode; secondsLeft: number }[] {
  const now = Date.now();
  return [...cooldown.entries()].filter(([, c]) => c.until > now).map(([model, c]) => ({ model, code: c.code, secondsLeft: Math.ceil((c.until - now) / 1000) }));
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiTelemetry {
  model: string;
  requestedModels: string[];
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  costMicros?: number;
  status: 'SUCCESS' | 'FALLBACK_USED' | 'FAILED';
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new AiError('NOT_CONFIGURED', 'OPENROUTER_API_KEY is not set.');
  return key;
}

export const aiConfigured = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());

function siteHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': process.env.SITE_URL || 'https://aksenlabs.com',
    'X-Title': 'Aksen OTC Bureau Desk',
  };
}

/**
 * Executes a chat completion via OpenRouter with automatic provider fallbacks
 */
export async function chatComplete(options: {
  messages: ChatMessage[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Total time allowed across every model tried. */
  budgetMs?: number;
  /** 'off' skips a reasoning model's thinking entirely (faster; fine for extraction). Default: think, but never show it. */
  reasoning?: 'hidden' | 'off';
  json?: boolean;
}): Promise<{
  content: string;
  model: string;
  telemetry: AiTelemetry;
}> {
  const all = options.models && options.models.length > 0 ? options.models : modelChain(resolveModels(null));
  const key = apiKey();
  const now = Date.now();
  // Skip models that recently failed, unless every model is cooling down.
  const ready = all.filter((m) => (cooldown.get(m)?.until ?? 0) <= now);
  const models = ready.length ? ready : all;

  const timeoutMs = options.timeoutMs || 20000;
  const started = Date.now();
  let lastError: AiError | null = null;

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    // An overall budget across the chain, so a webhook never waits for three slow models in a row.
    const left = options.budgetMs ? options.budgetMs - (Date.now() - started) : timeoutMs;
    if (left < 1500) {
      lastError ??= new AiError('TIMEOUT', 'Ran out of time before trying every model.');
      break;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, left));

    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...siteHeaders(),
        },
        body: JSON.stringify({
          model: currentModel,
          provider: {
            allow_fallbacks: true,
            ...(options.json ? { require_parameters: true } : {}),
            // Paid models: only providers that don't keep or train on prompts. (Free endpoints require it, so it can't be set there.)
            ...(isFreeModel(currentModel) ? {} : { data_collection: 'deny' }),
          },
          // Reasoning models think first; we only want the answer, never the thinking, in a reply.
          reasoning: options.reasoning === 'off' ? { enabled: false } : { exclude: true },
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens || 1200,
          messages: options.messages,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const code = codeFor(response.status);
        console.warn(`[aksen] OpenRouter ${currentModel} failed (${response.status}):`, errorBody.slice(0, 160));
        lastError = new AiError(code, code === 'NO_CREDIT' ? 'The OpenRouter account has no credit for this model.' : `${currentModel} returned ${response.status}.`);
        if (COOL_MS[code]) cooldown.set(currentModel, { until: Date.now() + COOL_MS[code]!, code });
        if (code === 'NOT_CONFIGURED') break; // a bad key fails for every model
        continue;
      }

      const data = await response.json();
      if (data.error) {
        const code = codeFor(Number(data.error.code) || 500);
        console.warn(`[aksen] OpenRouter ${currentModel} returned an error:`, data.error.message);
        lastError = new AiError(code, data.error.message || 'OpenRouter model error');
        if (COOL_MS[code]) cooldown.set(currentModel, { until: Date.now() + COOL_MS[code]!, code });
        continue;
      }

      const choice = data.choices?.[0];
      const rawContent: string = choice?.message?.content?.trim() || '';
      if (!rawContent) {
        lastError = new AiError('FAILED', `${currentModel} returned an empty answer.`);
        continue;
      }

      // Some free models still write their thinking into the answer. Never pass that on.
      const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (/^(here'?s|here is) (a|my) thinking process/i.test(content) || /^\s*(okay|ok),? (so )?(the user|let me|i need to)\b/i.test(content)) {
        lastError = new AiError('FAILED', `${currentModel} answered with its reasoning instead of a reply.`);
        continue;
      }
      cooldown.delete(currentModel);

      const resolvedModel = data.model || currentModel;
      const durationMs = Date.now() - started;
      const cost = data.usage?.cost;
      const costMicros = typeof cost === 'number' && Number.isFinite(cost) ? Math.round(cost * 1_000_000) : undefined;

      const telemetry: AiTelemetry = {
        model: resolvedModel,
        requestedModels: models,
        durationMs,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        costMicros,
        status: resolvedModel !== models[0] ? 'FALLBACK_USED' : 'SUCCESS',
      };

      return {
        content,
        model: resolvedModel,
        telemetry,
      };
    } catch (err: unknown) {
      if (err instanceof AiError) throw err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      lastError = new AiError(aborted ? 'TIMEOUT' : 'FAILED', aborted ? `${currentModel} took longer than ${timeoutMs} ms.` : `${currentModel}: ${(err as Error)?.message ?? err}`);
      console.warn(`[aksen] OpenRouter ${currentModel}:`, lastError.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new AiError('FAILED', 'All configured OpenRouter models failed.');
}

export interface AccountStatus {
  configured: boolean;
  keyWorks: boolean;
  /** Prepaid balance in USD (credits bought minus usage); null when OpenRouter didn't say. */
  balanceUsd: number | null;
  freeRequests: { used: number; limit: number } | null;
  error: string | null;
}

/** Key validity, prepaid balance and today's free-model allowance, straight from OpenRouter. */
export async function accountStatus(): Promise<AccountStatus> {
  if (!aiConfigured()) return { configured: false, keyWorks: false, balanceUsd: null, freeRequests: null, error: 'OPENROUTER_API_KEY is not set.' };
  const headers = { Authorization: `Bearer ${apiKey()}`, ...siteHeaders() };
  try {
    const [k, c] = await Promise.all([
      fetch(`${OPENROUTER_BASE}/key`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${OPENROUTER_BASE}/credits`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!k.ok) return { configured: true, keyWorks: false, balanceUsd: null, freeRequests: null, error: `OpenRouter rejected the key (${k.status}).` };
    const key = (await k.json())?.data ?? {};
    const credits = c.ok ? (await c.json())?.data ?? null : null;
    const balance = credits && typeof credits.total_credits === 'number' ? Math.round((credits.total_credits - credits.total_usage) * 100) / 100 : null;
    const free = key.free_model_daily_requests;
    return {
      configured: true,
      keyWorks: true,
      balanceUsd: balance,
      freeRequests: free && typeof free.limit === 'number' ? { used: Number(free.used) || 0, limit: free.limit } : null,
      error: null,
    };
  } catch (e) {
    return { configured: true, keyWorks: false, balanceUsd: null, freeRequests: null, error: `Could not reach OpenRouter: ${(e as Error).message}` };
  }
}

/**
 * System 2 GEV Forensic Synthesizer: Runs multi-model deep inference on flagged receipts
 */
export async function synthesizeGevEvidence(evidence: {
  remitterName: string;
  momoName: string;
  whatsappPhone: string;
  amountIn: number;
  collectionBank: string;
  flags: string[];
}): Promise<{
  synthesis: string;
  recommendedAction: string;
  telemetry: AiTelemetry;
}> {
  const prompt: ChatMessage[] = [
    {
      role: 'system',
      content: `You are the Aksen GEV Sentinel System 2 Reasoner, an institutional forensic expert for West African OTC currency desks (Nigeria NGN ⇄ Ghana GHS corridor).
Analyze the counterparty evidence for triangular fraud, Canva receipt editing, or third-party bank hijack.
Provide concise, decisive analysis in plain business language.
Output JSON with keys: "synthesis" (2-3 sentences explaining the fraud risk) and "recommendedAction" (e.g., "HOLD DISBURSAL", "REQUEST VIDEO KYC", "REFUND REMITTER").`,
    },
    {
      role: 'user',
      content: JSON.stringify(evidence, null, 2),
    },
  ];

  try {
    const result = await chatComplete({
      messages: prompt,
      json: true,
      temperature: 0.1,
    });

    const parsed = JSON.parse(result.content);
    return {
      synthesis: parsed.synthesis || 'Anomaly detected in remitter identity. Recommend holding disbursal.',
      recommendedAction: parsed.recommendedAction || 'HOLD DISBURSAL FOR OPERATOR REVIEW',
      telemetry: result.telemetry,
    };
  } catch (error) {
    // Graceful deterministic fallback if network is offline
    return {
      synthesis: `Identity mismatch flagged: Remitter (${evidence.remitterName}) does not match receiving MoMo name (${evidence.momoName}). Potential triangular fraud scheme.`,
      recommendedAction: 'HOLD DISBURSAL FOR OPERATOR REVIEW',
      telemetry: {
        model: 'heuristic_fallback',
        requestedModels: [DEFAULT_MODEL],
        durationMs: 5,
        status: 'FAILED',
      },
    };
  }
}
