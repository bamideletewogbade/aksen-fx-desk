/**
 * Which OpenRouter models the desk uses, in one place.
 *
 * Order of precedence: the desk's own setting (Settings → AI assistant), then
 * OPENROUTER_MODEL / OPENROUTER_FALLBACK_MODELS, then the built-in free
 * defaults below. Topping up the OpenRouter account and switching to a paid
 * model is a model-name change in Settings; no deploy is needed.
 */

/** Chosen from a 2026-10-06 test on real customer phrasing (Pidgin, typos, payout lines). */
export const BUILT_IN_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
export const BUILT_IN_FALLBACKS = ['google/gemma-4-31b-it:free', 'dots-studio/dots-3-note-preview:free'];

export interface ModelPreset {
  id: string;
  label: string;
  tier: 'free' | 'paid';
  /** USD per million input / output tokens, from OpenRouter's catalogue on 2026-10-06. */
  price?: [number, number];
  note: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B', tier: 'free', note: 'Best free result in our test: 4 of 5 messy messages read correctly, about 0.7 s.' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', tier: 'free', note: 'Good JSON support, but often rate-limited on the free tier.' },
  { id: 'dots-studio/dots-3-note-preview:free', label: 'dots 3 note (preview)', tier: 'free', note: '2 of 5 in our test. Use as a last fallback only.' },
  { id: 'openai/gpt-5-nano', label: 'GPT-5 nano', tier: 'paid', price: [0.05, 0.4], note: 'Cheap and fast. A good first paid model.' },
  { id: 'qwen/qwen3.7-flash', label: 'Qwen 3.7 Flash', tier: 'paid', price: [0.03, 0.13], note: 'Lowest cost with JSON support.' },
  { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B (paid)', tier: 'paid', price: [0.09, 0.34], note: 'Same model as the free one, without the free-tier queue.' },
  { id: 'openai/gpt-oss-120b', label: 'gpt-oss 120B', tier: 'paid', price: [0.04, 0.17], note: 'Open-weight, strong at structured output.' },
];

const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function isModelId(id: string): boolean {
  return MODEL_ID.test(id.trim()) && id.length <= 120;
}

export function isFreeModel(id: string): boolean {
  return id.endsWith(':free');
}

export function parseModelList(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? '').split(/[\s,]+/).map((m) => m.trim()).filter((m) => m && isModelId(m)))];
}

export interface AiModels {
  model: string;
  fallbacks: string[];
  source: 'desk' | 'environment' | 'built-in';
}

/** The model chain to use, given the desk's own setting (null when the desk hasn't chosen). */
export function resolveModels(desk?: { model: string | null; fallbacks: string | null } | null): AiModels {
  const envModel = process.env.OPENROUTER_MODEL?.trim();
  const envFallbacks = parseModelList(process.env.OPENROUTER_FALLBACK_MODELS);
  if (desk?.model && isModelId(desk.model)) {
    const fallbacks = desk.fallbacks !== null ? parseModelList(desk.fallbacks) : envFallbacks.length ? envFallbacks : BUILT_IN_FALLBACKS;
    return { model: desk.model, fallbacks: fallbacks.filter((m) => m !== desk.model), source: 'desk' };
  }
  if (envModel && isModelId(envModel)) return { model: envModel, fallbacks: envFallbacks.filter((m) => m !== envModel), source: 'environment' };
  return { model: BUILT_IN_MODEL, fallbacks: BUILT_IN_FALLBACKS, source: 'built-in' };
}

export function modelChain(m: AiModels): string[] {
  return [m.model, ...m.fallbacks.filter((f) => f !== m.model)];
}
