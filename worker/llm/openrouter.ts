/**
 * OpenRouter Chat integration with multi-model fallback and deterministic domain backup.
 */

import type { ChatMessage, ChatReply, ChatRequest } from '../types.ts';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DEFAULT_MODELS = [
  'liquid/lfm-2.5-2.6b:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.5-flash',
];

const SYSTEM_PROMPT = `You are the Aksen Labs OTC FX & Remittance Autonomous Agent for West Africa.
Key parameters:
- Primary Corridor: Lagos (NGN) <-> Accra (GHS) mobile money and commercial banking.
- Current Benchmark Wholesale Rate: 1 GHS = 104.55 NGN (or 100,000 NGN = ~956.48 GHS).
- Settlement mechanisms: GTBank / Access Bank Nigeria inbound, MTN MoMo / Telecel Cash / Vodafone Cash Ghana outbound.
- Payout SLA: Under 90 seconds once transfer receipt passes JEV verification.
- Autonomous limits: Orders up to ₦1,000,000 can auto-settle if JEV confidence >= 95%. Larger transactions require operator 1-click treasury signoff.
- Liquidity Syndicates: Investors can pool capital (minimum ₦250k - ₦5M) into regional syndicates with 70% LP profit waterfall, 20% operator carry, and 10% reserve.
- Tone: Professional, fast, respectful (West African financial market context: "Akwaaba", "Good day", concise financial terminology).

Always provide concise, helpful financial answers. If the user mentions an amount to swap, summarize the quote clearly with rate and estimated payout.`;

export async function askChatAi(
  apiKey: string | undefined,
  siteUrl: string | undefined,
  request: ChatRequest,
  timeoutMs = 8000
): Promise<{ reply: ChatReply; source: 'openrouter' | 'heuristic_engine'; usdMicros: number }> {
  // If API key is provided, attempt OpenRouter with multiple models
  if (apiKey?.trim()) {
    try {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      if (request.history && request.history.length > 0) {
        // Keep last 4 turns for context
        const recent = request.history.slice(-4);
        for (const h of recent) {
          messages.push({ role: h.role, content: h.content });
        }
      }

      messages.push({ role: 'user', content: request.message });

      const res = await fetch(CHAT_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${apiKey.trim()}`,
          'content-type': 'application/json',
          'HTTP-Referer': siteUrl || 'https://aksen-fx-desk.bishoptewogbade.workers.dev',
          'X-Title': 'Aksen OTC FX Desk',
        },
        body: JSON.stringify({
          model: DEFAULT_MODELS[0],
          models: DEFAULT_MODELS,
          messages,
          temperature: 0.3,
          max_tokens: 350,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { cost?: number };
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          const parsed = parseAiOutput(text, request.message);
          return {
            reply: parsed,
            source: 'openrouter',
            usdMicros: Math.round((data.usage?.cost ?? 0) * 1_000_000),
          };
        }
      }
    } catch {
      // Fallback cleanly to domain heuristic
    }
  }

  // Resilient heuristic domain fallback (guarantees zero demo failures)
  const fallbackReply = generateHeuristicReply(request.message, request.context);
  return {
    reply: fallbackReply,
    source: 'heuristic_engine',
    usdMicros: 0,
  };
}

function parseAiOutput(text: string, userQuery: string): ChatReply {
  const lower = userQuery.toLowerCase();
  let intent: ChatReply['intent'] = 'general';

  if (lower.includes('rate') || lower.includes('quote') || lower.includes('how much') || /\d+/.test(lower)) {
    intent = 'quote_request';
  } else if (lower.includes('syndicate') || lower.includes('pool') || lower.includes('invest') || lower.includes('dividend')) {
    intent = 'syndicate_inquiry';
  } else if (lower.includes('status') || lower.includes('settle') || lower.includes('receipt') || lower.includes('momo')) {
    intent = 'settlement_check';
  }

  // Extract amount if present
  const numMatch = userQuery.replace(/,/g, '').match(/\b(\d{4,9})\b/);
  let extractedQuote: ChatReply['extractedQuote'] | undefined;
  if (numMatch && numMatch[1]) {
    const amt = parseFloat(numMatch[1]);
    const rate = 104.55;
    extractedQuote = {
      amountIn: amt,
      corridor: lower.includes('cedi') || lower.includes('ghs') ? 'GHS_TO_NGN' : 'NGN_TO_GHS',
      rate,
      amountOut: parseFloat((amt / rate).toFixed(2)),
    };
  }

  return {
    text,
    intent,
    extractedQuote,
    suggestedPrompts: [
      'Lock ₦1,500,000 Quote 🇬🇭',
      'View Active Syndicates & Yields 📊',
      'What are the settlement limits?',
    ],
  };
}

function generateHeuristicReply(msg: string, context?: ChatRequest['context']): ChatReply {
  const text = msg.toLowerCase();
  const rate = context?.rate || 104.55;

  // Amount extraction
  const numMatch = msg.replace(/,/g, '').match(/\b(\d{4,9})\b/);
  if (numMatch && numMatch[1]) {
    const amt = parseFloat(numMatch[1]);
    const outGhs = (amt / rate).toFixed(2);
    return {
      text: `For ₦${amt.toLocaleString()} NGN at our locked wholesale rate of 1 GHS = ₦${rate.toFixed(2)}, you will receive GH₵ ${parseFloat(outGhs).toLocaleString()} directly into your MTN or Telecel Mobile Money wallet. Payout is dispatched in under 90 seconds after transfer receipt verification.`,
      intent: 'quote_request',
      extractedQuote: {
        amountIn: amt,
        corridor: 'NGN_TO_GHS',
        rate,
        amountOut: parseFloat(outGhs),
      },
      suggestedPrompts: [
        `Lock ₦${amt.toLocaleString()} Quote Now`,
        'Change MoMo Beneficiary',
        'Upload Transfer Receipt',
      ],
    };
  }

  if (text.includes('syndicate') || text.includes('pool') || text.includes('invest') || text.includes('dividend') || text.includes('lp')) {
    return {
      text: `Aksen Liquidity Syndicates allow liquidity providers (LPs) to co-fund high-velocity OTC float pools. Current pool APY is ~34.8% annualized, distributed on a 7-day epoch cycle. Returns follow a 70% LP / 20% Operator Carry / 10% Risk Reserve waterfall. Minimum commitment starts at ₦250,000.`,
      intent: 'syndicate_inquiry',
      suggestedPrompts: [
        'Explore Lagos-Accra Float Syndicate',
        'Simulate ₦1,000,000 LP Return',
        'Create New Syndicate Group',
      ],
    };
  }

  if (text.includes('rate') || text.includes('spread') || text.includes('price')) {
    return {
      text: `Current Live OTC Rates:\n• NGN → GHS: 1 GHS = ₦${rate.toFixed(2)} (Wholesale spread: 1.18%)\n• GHS → NGN: 1 GHS = ₦103.20\n• Settlement: Instant MoMo (MTN / Telecel) or NIBSS Instant Payment.`,
      intent: 'rate_inquiry',
      suggestedPrompts: [
        'Quote ₦500,000 NGN',
        'Quote ₦1,500,000 NGN',
        'Quote GH₵ 2,500 GHS',
      ],
    };
  }

  return {
    text: `Welcome to Aksen OTC FX & Remittance Desk. I can assist you with wholesale NGN/GHS swaps, instant Mobile Money payouts across Ghana, or joining our liquidity syndicates for passive yield. How can I help you today?`,
    intent: 'general',
    suggestedPrompts: [
      'Swap ₦500,000 NGN to Cedis',
      'Swap ₦1,500,000 NGN to Cedis',
      'Join Liquidity Pool Syndicate',
    ],
  };
}
