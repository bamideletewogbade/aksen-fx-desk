// OpenRouter Client Integration for Aksen OTC
// Follows Aksen Labs multi-model fallback architecture with latency & token telemetry

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.8-27b:free';
export const FALLBACK_MODELS = (
  process.env.OPENROUTER_FALLBACK_MODELS ||
  'nvidia/nemotron-3.5-lightning:free,dots-studio/dots-3-note-preview:free,liquid/lfm-2.5-2.6b:free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

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
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not configured in environment variables.');
  }
  return key;
}

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
  json?: boolean;
}): Promise<{
  content: string;
  model: string;
  telemetry: AiTelemetry;
}> {
  const models = options.models && options.models.length > 0 
    ? options.models 
    : [DEFAULT_MODEL, ...FALLBACK_MODELS];

  const timeoutMs = options.timeoutMs || 20000;
  const started = Date.now();
  let lastError: any = null;

  // Try each model sequentially to maximize resilience against free tier rate limits
  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
          ...siteHeaders(),
        },
        body: JSON.stringify({
          model: currentModel,
          provider: {
            allow_fallbacks: true,
            ...(options.json ? { require_parameters: true } : {}),
          },
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens || 1200,
          messages: options.messages,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.warn(`OpenRouter model ${currentModel} failed (status ${response.status}):`, errorBody.slice(0, 100));
        lastError = new Error(`Status ${response.status}: ${errorBody.slice(0, 100)}`);
        continue;
      }

      const data = await response.json();
      if (data.error) {
        console.warn(`OpenRouter model ${currentModel} returned error:`, data.error);
        lastError = new Error(data.error.message || 'OpenRouter model error');
        continue;
      }

      const choice = data.choices?.[0];
      let rawContent = choice?.message?.content?.trim() || '';
      if (!rawContent) {
        lastError = new Error(`Empty content returned by ${currentModel}`);
        continue;
      }

      // Strip think tags and raw chain-of-thought traces if present
      let content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (content.toLowerCase().startsWith("here's a thinking process:") || content.toLowerCase().startsWith("here is a thinking process:")) {
        const headerMatch = content.search(/\n\s*(#{1,4}|\*\*[A-Z])/);
        if (headerMatch !== -1) {
          content = content.slice(headerMatch).trim();
        }
      }

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
    } catch (err: any) {
      lastError = err;
      console.warn(`Error trying model ${currentModel}:`, err?.message || err);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('All configured OpenRouter models failed.');
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
