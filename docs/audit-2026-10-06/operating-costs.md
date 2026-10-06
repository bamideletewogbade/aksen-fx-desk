# Aksen OTC operating-cost model — 6 October 2026

This is a planning estimate for **one Ghana-based client business**, not a provider invoice or a live deployment sign-off. USD prices were checked on 6 October 2026. GHS conversions use the [Bank of Ghana 5 October 2026 interbank mid-rate](https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/) of **GH₵11.7650 per US$1**. Card settlement, tax and FX spread can be higher. Recheck every vendor account's rate card before quoting a client.

## What the code actually depends on

The proposed production path is a Cloudflare Worker running the Next.js app (`wrangler.jsonc`), Neon Postgres (`src/server/db/index.ts`), Twilio Programmable Messaging for WhatsApp/SMS (`src/server/twilio.ts`), OpenRouter for AI fallback and summaries (`src/server/ai`, `src/server/susu-ai.ts`), and optional Clerk authentication (`src/server/clerk.ts`). Production secrets and provider accounts were **not** inspected. The configured WhatsApp sender in `wrangler.jsonc` is Twilio's sandbox sender, so a production sender must be registered and priced separately. The direct Meta webhook route is a preview stub, not a deployed replacement for Twilio. Media attachments are currently stored in Postgres, so they add to Neon storage and backup size; R2 is not integrated.

## Published prices and Ghana equivalents

| Item | Global list price | Approximate GHS | Budget treatment |
| --- | ---: | ---: | --- |
| [Cloudflare Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) | $5/month, including 10m requests and 30m CPU-ms; then $0.30/m requests and $0.02/m CPU-ms | GH₵58.83/month | Use $5 for a modest pilot; measure actual CPU. Static asset requests are free. |
| [Neon Launch](https://neon.com/blog/major-compute-price-reduction-on-neon) | $0.106 per CU-hour, $0.35/GB-month storage; $5/month minimum spend | GH₵1.25 per CU-hour, GH₵4.12/GB-month | Compute-hours, not calendar hours. Scale-to-zero and attachment volume matter. |
| [Neon Scale](https://neon.com/blog/major-compute-price-reduction-on-neon) | $0.222 per CU-hour; storage $0.35/GB-month | GH₵2.61 per CU-hour | Consider for production recovery/SLA needs; check plan inclusions in account. |
| [Twilio WhatsApp](https://www.twilio.com/en-us/whatsapp/pricing) | $0.005 per **inbound or outbound** message, plus Meta outbound fees | GH₵0.0588 per message before Meta | Count both sides of the chat. Twilio's public page has some pre-October copy, so use the current Meta card for pass-through. |
| Meta Ghana service replies | Planning assumption: first 1,000 delivered service replies per business number/month free, then **$0.0040** each | GH₵0.0471 each after allowance | [October 2026 rate transcription](https://whautomate.com/whatsapp-business-api-pricing); verify against the [official Meta rate card](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) or actual Twilio bill before contract. In-window utility templates are charged separately from the first delivered message. |
| Meta Ghana marketing templates | Planning assumption: $0.0225 per delivered message | GH₵0.2647 each | Not part of the current response flow; add only if a campaign feature is built and approved. Same verification caveat. |
| [Twilio SMS to Ghana](https://www.twilio.com/en-us/sms/pricing/gh) | $0.3741 per outbound **segment**, plus possible carrier fees | GH₵4.40 per segment | 100 one-segment SMS cost $37.41 / GH₵440.13. Sender/route approval must be tested. |
| [OpenRouter Standard](https://openrouter.ai/pricing/) | No monthly base; 5.5% platform fee on credit purchase, plus model tokens | Depends on model | Free tier is capped at 50 requests/day; do not rely on free models for a production promise. |
| [Qwen3.7 Flash](https://openrouter.ai/qwen/qwen3.7-flash) | $0.03/M input tokens; $0.13/M output tokens | GH₵0.35/M input; GH₵1.53/M output | Model can be changed in app settings; verify current model/provider before billing. |
| [GPT-5 nano via OpenRouter](https://openrouter.ai/openai/gpt-5-nano/providers) | $0.05/M input; $0.40/M output | GH₵0.59/M input; GH₵4.71/M output | At 1,000 input + 150 output tokens, about $0.00011 per call before credit fee. |
| [Clerk Hobby / Pro](https://clerk.com/pricing) | Hobby $0; Pro $25 monthly or $20/month billed annually | Pro GH₵294.13 monthly | Pro includes MFA. Current app uses its own employee membership/RBAC, so the $100 B2B enhancement is not assumed. |
| [.com domain at Cloudflare Registrar](https://pricing.registrar.cloudflare.com/) | $10.46/year | GH₵10.26/month amortized | Zero incremental cost if using an existing domain. This is **not** a quoted `.com.gh` price. |

**Local SMS alternative:** [Arkesel's Ghana pricing](https://arkesel.com/pricing/) lists GH₵20 for 696 three-month-expiry credits (GH₵0.0288/SMS), or GH₵20 for 645 no-expiry credits (GH₵0.0310/SMS). [Hubtel's published SMS page](https://hubtel.com/consumer/sms) lists a Ghana gateway at GH₵0.033/SMS. Those are materially lower than Twilio's international Ghana SMS list rate, but Aksen OTC only implements Twilio today. Changing the provider needs integration, sender-ID registration, network delivery testing and support for inbound/receipt behavior. Compare actual delivered cost and credit expiry, not headline rate alone.

## Monthly estimates, one number, one client

Assume half the WhatsApp messages are delivered outbound **service replies** to Ghana numbers, no templates, no SMS, no extra Cloudflare usage, one existing/owned WhatsApp sender with unquoted number fee excluded, Clerk Pro paid monthly, and the `.com` amortization. The AI line is a **cash allowance**, not a measured token bill. Neon compute sizing/hours and message volumes are illustrative, not load-test findings.

| Scenario | Conversations | WhatsApp messages total | Neon assumption | Twilio WA | Meta WA | Neon | Other fixed + AI¹ | Total USD | Total GHS |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | 100 × 8 | 800 | 0.25 CU × 260 h + 1 GB | $4.00 | $0 | $7.24 | $31.87 | **$43.11** | **GH₵507** |
| Client pilot | 500 × 10 | 5,000 | 0.25 CU × 350 h + 1 GB | $25.00 | $6.00 | $9.63 | $31.87 | **$72.50** | **GH₵853** |
| Busy desk | 2,000 × 12 | 24,000 | 0.5 CU × 720 h + 5 GB | $120.00 | $44.00 | $39.91 | $32.87 | **$236.78** | **GH₵2,786** |

¹ Workers $5 + Clerk Pro $25 + domain $0.87 + AI allowance $1 in starter/pilot or $2 in busy. Display rounding may differ by one cent. If Clerk Hobby is acceptable after an auth review, subtract $25 / GH₵294. If the domain is already paid, subtract $0.87 / GH₵10. A dedicated phone number, taxes, support plans and card FX spread are not included.

The pilot's direct vendor cost is about **GH₵853/month**. For cash planning, reserve roughly **GH₵1,000–1,300/month** before SMS, number rental and people costs, then refine with the first two weeks of actual usage. Do not use this as a client subscription price: onboarding, support, operations, security work, compliance and margin are separate.

## Reusable formula

```text
USD/month = Cloudflare base/overage
          + max(Neon minimum, Neon CU × active hours × CU-hour rate + GB × storage rate)
          + $0.005 × (WhatsApp inbound + WhatsApp outbound)
          + Ghana Meta service rate × max(0, delivered service replies − 1,000 per business number)
          + Meta utility/authentication/marketing template fees, if used
          + SMS segments × SMS destination rate + sender rental/fees
          + OpenRouter input tokens/1m × model input price
          + OpenRouter output tokens/1m × model output price
          + Clerk plan + domain/12 + other contracted tools
GHS/month = USD/month × actual card or bank conversion rate
```

The [editable calculator](./monthly-cost-calculator.html) applies this formula for the current Twilio path and lets the business enter measured message counts, Neon usage, model tokens, SMS volume and FX. It separates quoted local SMS cost from the current Twilio integration.

## Costs and assumptions to validate before signing a real client

1. Obtain Twilio's actual approved **production WhatsApp sender** and current Meta Ghana charge from the account bill/rate card. The sandbox sender in configuration cannot be treated as a production number. Confirm WhatsApp policy eligibility for this FX/OTC workflow; pricing alone does not grant permission.
2. Run a two-week pilot dashboard of **inbound, delivered outbound, failed, service/template category, SMS segments, AI tokens, Neon CU-hours/storage, and Worker CPU**. Rebuild the quote from those measurements.
3. Decide whether to move media attachments out of Neon into object storage before volumes grow. The present `bytea` path can make database storage, restore and retention costs grow faster than the text-message model suggests.
4. Confirm the auth plan and MFA requirement. If Clerk is optional/not configured, a separate security review of the built-in auth path is needed; merely removing Clerk from the bill does not preserve the same controls.
5. Price separately: money-transfer/MoMo/bank fees, reconciliation labor, customer support, legal/compliance, backup/export strategy, monitoring, domain email, and taxes. The code does not currently prove a payment processor or dedicated email/monitoring vendor spend. These are not hidden inside the infrastructure estimate.
