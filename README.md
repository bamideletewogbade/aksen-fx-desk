# Aksen Labs OTC FX & Remittance Engine

> **Multi-Agent West Africa Corridor Bureau (NGN ⇄ GHS) with Liquidity Syndicates, OpenRouter LLM, and JEV Autonomous Forensics deployed on Cloudflare Workers.**

🌐 **Live Deployment:** [https://aksen-fx-desk.bishoptewogbade.workers.dev](https://aksen-fx-desk.bishoptewogbade.workers.dev)

---

## 🏛️ Executive Summary

Informal money changing across the Lagos–Accra trade corridor moves tens of millions of dollars each month, almost entirely via fragmented WhatsApp messages, volatile manual spreads, and high exposure to triangular payment fraud.

**Aksen OTC FX Desk** digitizes the bureau de change operations with:
1. **Conversational Intake Agent:** Instant wholesale quote generation locked for 15 minutes, calculating net Mobile Money (MTN / Telecel Cash) or bank settlement.
2. **OpenRouter AI Backend:** Full-stack integration with fallback model pipelines (`google/gemini-2.5-flash`, `liquid/lfm-2.5-2.6b:free`, `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-chat`).
3. **JEV Decision Engine (`typesafe/jev-1.13`):** Probabilistic forensic scoring on NIBSS bank transfer references, image tampering detection, and anti-triangular fraud gates.
4. **Liquidity Syndicates & LP Pools:** Dynamic pool coordination allowing passive capital providers to co-fund float vaults, earning yield governed by a 70% LP / 20% Operator Carry / 10% Risk Reserve waterfall.
5. **Bounded Autonomy Safety:** Trades &le; ₦1,000,000 auto-settle if JEV confidence &ge; 95%; larger tickets require 1-click human operator authorization.

---

## ⚡ Multi-Agent System Architecture

```
                      ┌──────────────────────────────────────┐
                      │        Customer WhatsApp / UI        │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Cloudflare Edge Worker Routing    │
                      │  (Rate Limiter, Circuit Breaker)     │
                      └───────┬──────────────────────┬───────┘
                              │                      │
             POST /api/chat   │                      │   POST /api/jev
                              ▼                      ▼
           ┌──────────────────────┐      ┌───────────────────────────────┐
           │   OpenRouter Chat    │      │    OpenRouter Decisions API   │
           │  (Intake & Support)  │      │     (typesafe/jev-1.13)       │
           └──────────┬───────────┘      └──────────────┬────────────────┘
                      │                                 │
                      ▼                                 ▼
           ┌──────────────────────┐      ┌───────────────────────────────┐
           │ Dynamic Quote Engine │      │   NIBSS Authenticity & Anti-  │
           │   & Corridor Float   │      │ Triangular Fraud Verification │
           └──────────┬───────────┘      └──────────────┬────────────────┘
                      │                                 │
                      └───────────────┬─────────────────┘
                                      │
                                      ▼
                      ┌──────────────────────────────────────┐
                      │        Operator Treasury Desk        │
                      │   (1-Click MoMo Payout Dispatch)     │
                      └──────────────────────────────────────┘
```

---

## 📡 API Endpoints

### 1. `POST /api/chat`
Conversational intake agent providing real-time quotes, corridor rate advice, and syndicate guidance.

**Request:**
```json
{
  "message": "I want to swap 1,500,000 Naira to Cedis, what is the rate?",
  "context": {
    "corridor": "NGN_TO_GHS",
    "rate": 104.55
  }
}
```

**Response:**
```json
{
  "ok": true,
  "reply": {
    "text": "For ₦1,500,000 NGN at our locked wholesale rate of 1 GHS = ₦104.55, you will receive GH₵ 14,347.20 directly into your MTN or Telecel Mobile Money wallet...",
    "intent": "quote_request",
    "extractedQuote": {
      "amountIn": 1500000,
      "corridor": "NGN_TO_GHS",
      "rate": 104.55,
      "amountOut": 14347.20
    },
    "suggestedPrompts": ["Lock ₦1,500,000 Quote Now", "Change MoMo Beneficiary"]
  },
  "meta": {
    "requestId": "2936a446-938b-46f2-81ee-6bc8addd1b28",
    "ms": 142,
    "source": "openrouter"
  }
}
```

### 2. `POST /api/jev`
Autonomous forensic verification of incoming bank transfer slips and NIBSS session numbers.

**Request:**
```json
{
  "receiptRef": "NIBSS-100001240928172938",
  "amount": 1500000,
  "currency": "NGN",
  "senderName": "Bishop Kwame",
  "recipientAccount": "0123984752",
  "narration": "FX-73912"
}
```

**Response:**
```json
{
  "ok": true,
  "verdict": {
    "model": "typesafe/jev-1.13",
    "confidence": 98.8,
    "nibssAuthenticity": 98.8,
    "triangularFraudRisk": 1.2,
    "imageTamperingDetected": false,
    "recommendation": "MANUAL_AUDIT",
    "reasons": [
      "NIBSS session key verified against banking pattern standards",
      "Triangular laundering risk assessed at 1.2%",
      "Operator approval required for settlement disbursement"
    ]
  }
}
```

### 3. `GET /api/rates`
Live corridor base rates, spreads, and treasury liquidity depth.

### 4. `GET /api/health`
Worker health status and AI engine telemetry.

---

## 🛠️ Local Development & Deployment

### Prerequisites
- Node.js &ge; 20
- Cloudflare Wrangler CLI
- OpenRouter API Key (configured in `.dev.vars` locally or via `wrangler secret put OPENROUTER_API_KEY`)

### Commands
```bash
# Install dependencies
npm install

# Build static assets into dist/
npm run build

# Start local worker dev server
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

---

## 🔒 Security & Guardrails

- **Zero API Key Leakage:** API keys are never bundled in client assets; they reside strictly in Cloudflare Worker edge secrets.
- **Edge Rate Limiting:** Token-bucket rate limiting (30 requests burst, refill every 5 seconds per IP).
- **Body Size Caps:** Maximum 16KB JSON payload per request.
- **Bounded Payout Limits:** Hard ceiling on autonomous payout (&le; ₦1,000,000). All transactions above this threshold or below 95% JEV confidence trigger mandatory human-in-the-loop sign-off.
