import { NextResponse } from 'next/server';
import { chatComplete, ChatMessage } from '@/lib/openrouter';

interface ExtractedData {
  inquiryType: 'quote' | 'bureau_setup' | 'syndicate' | 'general';
  amount?: string;
  corridor?: 'NGN -> GHS' | 'GHS -> NGN' | 'UNKNOWN';
  settlementMethod?: string;
  counterpartyName?: string;
  whatsappPhone?: string;
  isComplete: boolean;
}

const DESK_PHONE_FORMATTED = '+234 915 583 3108';

/**
 * Deterministic Regex & Rule-Based Fallback Engine
 * Ensures 100% demo uptime even if upstream LLM rate-limits or is offline
 */
function runDeterministicFallback(
  latestText: string,
  currentState: Partial<ExtractedData> = {}
): { reply: string; extracted: ExtractedData } {
  const text = latestText.trim();
  const lower = text.toLowerCase();
  const updated: ExtractedData = {
    inquiryType: currentState.inquiryType || 'quote',
    amount: currentState.amount,
    corridor: currentState.corridor || 'NGN -> GHS',
    settlementMethod: currentState.settlementMethod || 'MTN MoMo',
    counterpartyName: currentState.counterpartyName,
    whatsappPhone: currentState.whatsappPhone,
    isComplete: false,
  };

  // 1. Detect Inquiry Type
  if (lower.includes('bureau') || lower.includes('setup') || lower.includes('software') || lower.includes('operating')) {
    updated.inquiryType = 'bureau_setup';
  } else if (lower.includes('syndicate') || lower.includes('float') || lower.includes('capital') || lower.includes('pool')) {
    updated.inquiryType = 'syndicate';
  } else {
    updated.inquiryType = 'quote';
  }

  // 2. Extract Volume / Amount
  const amountMatch =
    text.match(/₦\s*([\d,]+(?:\.\d+)?\s*[kKmMbB]?)/i) ||
    text.match(/(?:gh[¢c]|cedis?)\s*([\d,]+(?:\.\d+)?\s*[kKmMbB]?)/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*(?:million|m|k|billion|b)\s*(?:naira|ngn|cedis|ghs)?/i) ||
    text.match(/₦?\s*([\d,]{4,})/);

  if (amountMatch) {
    updated.amount = amountMatch[0].trim();
  }

  // 3. Extract Corridor
  if (lower.includes('cedis') || lower.includes('ghs') || lower.includes('ghana') || lower.includes('accra') || lower.includes('kumasi')) {
    if (lower.includes('naira') || lower.includes('ngn') || lower.includes('₦')) {
      if (lower.includes('ghs to ngn') || lower.includes('cedis to naira')) {
        updated.corridor = 'GHS -> NGN';
      } else {
        updated.corridor = 'NGN -> GHS';
      }
    }
  }

  // 4. Extract Settlement Method
  if (lower.includes('mtn') || lower.includes('momo') || lower.includes('mobile money')) {
    updated.settlementMethod = 'MTN MoMo';
  } else if (lower.includes('telecel') || lower.includes('vodafone')) {
    updated.settlementMethod = 'Telecel Cash';
  } else if (lower.includes('bank') || lower.includes('gtb') || lower.includes('opay') || lower.includes('zenith')) {
    updated.settlementMethod = 'Bank Deposit';
  }

  // 5. Extract Phone Number
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3}[-.\s]?\d{3,4}/);
  if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 10) {
    updated.whatsappPhone = phoneMatch[0].trim();
  }

  // 6. Extract Name
  const nameMatch = text.match(/(?:i am|my name is|this is|call me)\s+([A-Za-z\s]+?)(?=[.,!?]|\s+(?:and|my|i|phone)|$)/i);
  if (nameMatch) {
    updated.counterpartyName = nameMatch[1].trim();
  }

  // Determine readiness
  const hasContact = Boolean(updated.counterpartyName || updated.whatsappPhone);
  const hasScope = Boolean(updated.amount || updated.inquiryType === 'bureau_setup' || updated.inquiryType === 'syndicate');
  updated.isComplete = hasContact && hasScope;

  // Construct context-rich institutional reply
  let reply = '';
  if (updated.isComplete) {
    reply = `Thank you, ${updated.counterpartyName || 'Trader'}. I have bundled your trade request for ${updated.amount || 'the desk'}. Tap below to dispatch your ticket directly to our clearing officer at ${DESK_PHONE_FORMATTED}.`;
  } else if (!hasContact) {
    if (updated.amount) {
      reply = `Understood! We can execute ${updated.amount} on the ${updated.corridor} corridor with zero commission fee. What is your full name and WhatsApp phone number so we can prepare your rate-lock ticket?`;
    } else {
      reply = `Welcome to the Aksen OTC Desk. How much volume are you looking to settle between Nigeria and Ghana today, or are you inquiring about bureau setup?`;
    }
  } else {
    reply = `Got it, ${updated.counterpartyName || 'Trader'}. What volume or transaction scope would you like to lock today?`;
  }

  return { reply, extracted: updated };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages = [], currentState = {} } = body;

    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';

    // Prepare system prompt for OpenRouter LLM
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: `You are the Aksen OTC Desk Concierge, an institutional trading assistant for Nigeria (NGN) ⇄ Ghana (GHS) cross-border settlements.
Our trading hubs operate in Lagos (Allen / Balogun) and Accra (Circle / Cowlane).
Official WhatsApp Desk Number: ${DESK_PHONE_FORMATTED}.
Current indicative rate: 1 GHS ≈ 105.06 NGN, 0% commission, guaranteed 15-minute rate-lock upon quote request.

Guidelines:
1. Speak in a concise, warm, professional institutional West African OTC trading tone.
2. Keep responses to 2-3 sentences max.
3. Understand trade jargon: "Momo", "Naira", "Cedis", "Kumasi", "Accra", "Alhaji", "Chief", "Float", "Bureau".
4. Maintain or update extracted trade state:
   - inquiryType: "quote" | "bureau_setup" | "syndicate" | "general"
   - amount: string or null
   - corridor: "NGN -> GHS" | "GHS -> NGN" | "UNKNOWN"
   - settlementMethod: "MTN MoMo" | "Telecel Cash" | "Bank Deposit" | "UNKNOWN"
   - counterpartyName: string or null
   - whatsappPhone: string or null
   - isComplete: true if counterparty provided trade details AND contact info (name or phone)
5. If missing counterparty name or phone, politely ask for them so our clearing officer on ${DESK_PHONE_FORMATTED} can review their locked ticket.

Current known state:
${JSON.stringify(currentState, null, 2)}

You MUST respond with valid JSON:
{
  "reply": "Your conversational response",
  "extracted": {
    "inquiryType": "quote" | "bureau_setup" | "syndicate" | "general",
    "amount": "string or null",
    "corridor": "NGN -> GHS" | "GHS -> NGN" | "UNKNOWN",
    "settlementMethod": "string or null",
    "counterpartyName": "string or null",
    "whatsappPhone": "string or null",
    "isComplete": true/false
  }
}`,
    };

    const chatHistory: ChatMessage[] = [
      systemPrompt,
      ...messages.slice(-8).map((m: any) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content || m.text || '',
      })),
    ];

    try {
      const aiResponse = await chatComplete({
        messages: chatHistory,
        json: true,
        temperature: 0.2,
        maxTokens: 350,
        timeoutMs: 12000,
      });

      const parsed = JSON.parse(aiResponse.content);
      return NextResponse.json({
        reply: parsed.reply || 'Understood. Let our clearing officer assist you.',
        extracted: {
          ...currentState,
          ...parsed.extracted,
        },
        telemetry: aiResponse.telemetry,
      });
    } catch (llmError: any) {
      console.warn('OpenRouter free tier unavailable or rate-limited. Engaging deterministic engine:', llmError?.message);
      // Seamlessly fall back to local rule-based extractor
      const fallback = runDeterministicFallback(latestUserMsg, currentState);
      return NextResponse.json({
        reply: fallback.reply,
        extracted: fallback.extracted,
        telemetry: {
          model: 'heuristic_fallback',
          requestedModels: ['qwen/qwen3.8-27b:free'],
          durationMs: 2,
          status: 'FALLBACK_USED',
        },
      });
    }
  } catch (error: any) {
    console.error('Concierge chat error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
