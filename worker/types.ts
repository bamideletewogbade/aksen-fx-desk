/**
 * Type definitions for Aksen Labs OTC FX & Remittance Worker.
 */

export interface Env {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY?: string;
  SITE_URL?: string;
  JEV_MODEL?: string;
  ANSWER_MODELS?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContext {
  corridor?: 'NGN_TO_GHS' | 'GHS_TO_NGN' | 'USD_TO_NGN';
  rate?: number;
  amountIn?: number;
  activeSyndicate?: string;
  userRole?: 'trader' | 'lp' | 'treasury' | 'guest';
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  context?: ChatContext;
}

export interface ChatReply {
  text: string;
  intent: 'quote_request' | 'rate_inquiry' | 'syndicate_inquiry' | 'settlement_check' | 'general';
  suggestedPrompts?: string[];
  extractedQuote?: {
    amountIn: number;
    corridor: string;
    rate: number;
    amountOut: number;
  };
}

export interface JevForensicRequest {
  receiptRef: string;
  amount: number;
  currency: string;
  senderName?: string;
  recipientAccount?: string;
  narration?: string;
}

export interface JevForensicVerdict {
  model: string;
  confidence: number;
  nibssAuthenticity: number;
  triangularFraudRisk: number;
  imageTamperingDetected: boolean;
  recommendation: 'AUTO_SETTLE' | 'MANUAL_AUDIT' | 'REJECT';
  reasons: string[];
  latencyMs: number;
  usdMicros: number;
}

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
    ms: number;
    source: 'openrouter' | 'jev' | 'heuristic_engine';
    usdMicros?: number;
  };
}
