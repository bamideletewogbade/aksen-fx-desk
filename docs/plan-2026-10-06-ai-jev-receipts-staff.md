# Build plan: AI chat, JEV, receipt checks, staff accounts (6 Oct 2026)

One rule runs through every level: **rules and people decide money; AI reads, sorts and suggests.** A model never sets a rate, confirms a payment, approves a payout or moves a trade.

Status key: ✅ done and tested · 🔜 next · ⏳ later · 💳 needs OpenRouter credit to verify

---

## Track A: AI in the customer chat (OpenRouter)

**How it works now.** The rule-based assistant (`src/server/assistant.ts`) answers every message it understands, instantly and for free. Only a message it would re-ask or hand over for (a "miss") is sent to the model. The model returns a small structured reading (intent, amount, currency, payout, name). That reading is **grounded**: amounts must be written in the customer's own words (digits, `200k`, or "two hundred thousand"), account numbers must be ones the customer sent, and names must be words they typed. The reading is then turned back into a phrase the rules know ("200,000 naira", "yes", "MTN 0241234567 Kwame Asante"), and the rules act exactly as before. If the model is slow, busy, unpaid or unsure, the customer gets the rules' original answer.

Privacy: every run of 9+ digits (phones, wallets, accounts) is masked as `#1`, `#2` before anything leaves the server, so the model never sees an account number and can't invent one. Paid models are called with `data_collection: deny`.

| Level | What | Status |
|---|---|---|
| A1 | Model chain in one place: desk setting → `OPENROUTER_MODEL` → built-in free default. Switching to a paid model after topping up is a model-name change in **Settings → AI assistant**, no deploy. | ✅ |
| A1 | Fixed broken config: the primary `qwen/qwen3.8-27b:free` no longer exists (every call wasted a 404); the old fallback leaked "Here's a thinking process" into replies. New free default `nvidia/nemotron-3-super-120b-a12b:free`, chosen by a benchmark on Pidgin/typo messages. | ✅ |
| A1 | Client hardening: reasoning off for extraction (≈1–1.6 s instead of 3+ s), 9 s total budget across the model chain (Twilio webhooks time out at 15 s), skips rate-limited (60 s) or retired (10 min) models, detects "no credit". | ✅ |
| A1 | "AI read this as …" note under the customer's message in the Inbox; handoffs carry an AI summary for the operator. | ✅ |
| A1 | Settings card: key status, live OpenRouter balance, free requests used today, 7-day usage, model picker with free/paid presets and prices, on/off switch (owner only), "Test on sample messages". | ✅ |
| A1 | Tests: 16 unit tests (grounding, masking, fallbacks), plus an opt-in live test (`AI_LIVE=1 npx vitest run tests/ai-live.test.ts`). The live test passed 4/4 on the free model. | ✅ |
| A2 | Desk FAQ the owner writes (hours, fees, locations, "is this legit?"). The model may only answer from FAQ text, and any number in its answer must appear in the FAQ. Otherwise it hands over. | 🔜 |
| A3 | Reply tone that matches the customer (Pidgin/Ghanaian English) from approved templates, not free generation. | ⏳ |
| A4 | Learning loop: every message the AI rescued or failed (`messages.ai_note`) becomes a test case. Recurring patterns get added to the rules, so fewer messages need the model over time. That is the long-term cost cut. | ⏳ |

**Cost when paid.** A reading is about 600 input and 80 output tokens. On `openai/gpt-5-nano` ($0.05 / $0.40 per million tokens) that is about **$0.00006 per rescued message**, or about $0.60 per 10,000. The model is only called on misses, a minority of messages.

---

## Track B: JEV (OpenRouter Decisions API) for lower cost and faster answers

JEV answers typed questions about a described situation with small, calibrated, machine-readable outputs, so it can be cheaper and faster than a chat model writing prose that then has to be parsed.

Confirmed against the live API today: question types are `noul` (probability), `choice` (needs `criteria: { option: description }`) and `score` (needs `criteria: [rubric]`). The old client sent `boolean` and `score` without criteria, so **every JEV call had been failing silently** and the Susu nudges had always used the plain rules. The account currently has no credit (balance −$0.27), and JEV returns 402, so answers are 💳 until topped up.

| Level | What | Status |
|---|---|---|
| B1 | Client fixed to the real schema; Susu nudges ask `noul` questions; a 5-minute pause after "no credit" so pages don't wait on a 402. Removed `evaluateSlipWithJev`: when JEV failed it returned made-up passes ("NIBSS session matched", "identity 100% verified") and flagged anyone named Chioma or Kofi. | ✅ |
| B2 | JEV as the first reader for in-step answers (after "Shall I lock this rate?": `choice` accept / decline / new amount / other). The chat model is only used when an amount or payout must be pulled out. Compare cost and latency per message using `ai_note`. | 🔜 💳 |
| B3 | Inbox triage: `noul` "is this customer upset?" and "does this look like a known scam pattern?" to sort **Needs you** by urgency. Hints only. | ⏳ 💳 |
| B4 | Try `typesafe/jev-router` (in the catalogue, dynamic pricing) as the chat model and let it pick the cheapest capable model per request. Keep it only if cost per rescued message drops without more failures. | ⏳ 💳 |

---

## Track C: Receipt checks (evidence, never payment)

A receipt never confirms funds; only the operator's own statement does. These checks help an operator **look in the right place and spot fakes faster**. They never mark anything paid or "authentic".

| Level | What | Status |
|---|---|---|
| C1 | Vision model reads the receipt image: amount, sender, bank, reference/narration, date and time. Shown side by side, "Receipt claims" vs "Trade expects" (amount, `AK-` reference in the narration, customer name, within the payment window), with mismatches highlighted. The credit form is **not** pre-filled from the receipt. | 🔜 |
| C2 | Reuse detection beyond the existing same-file hash: the same extracted reference or amount and time on another trade or customer. | 🔜 |
| C3 | JEV risk hints on the extracted fields (`noul`: "narration contains the trade reference?", "sender plausibly the customer or a known third party?") → a "check carefully" badge. Wording never says "verified". | ⏳ 💳 |
| C4 | Statement import (CSV/PDF from GTBank, Moniepoint, MoMo) and auto-matching of credits to trades. This is the real time saver; receipt checks only order the queue until then. | ⏳ |

---

## Track D: Staff accounts without Gmail (owner adds them from the dashboard)

Today: sign-in is Clerk (any email address, not only Gmail) plus email invite links. Password sessions already exist inside the app (sample desk, tests). Codex is currently hardening role changes in `src/server/auth.ts` and the Team page, so **D1 starts after that work is committed** to avoid two agents editing the same file.

The desk **Owner** is the super admin of their desk. A platform-wide super admin (you, across all desks) is a separate SaaS feature (E7).

| Level | What | Status |
|---|---|---|
| D1 | **Team → Add staff**: full name, username, role (Admin / Dealer / Viewer), and a generated temporary password shown once to the owner. Staff sign in on `/login` → **Staff sign-in** with desk code + username + password, and must set their own password on first sign-in. Passwords hashed; every add, reset and deactivate on the audit trail. Owner can reset a password or remove access (signs them out at once). | 🔜 |
| D2 | Safety: lockout after repeated wrong passwords, shorter sessions for staff, "sign out everywhere", password rules, staff can't change their own role. | 🔜 |
| D3 | Shared counter device: quick switch between staff with a PIN, so each action is still recorded against the right person. | ⏳ |
| D4 | Finer permissions where roles are too coarse (e.g. can collect Susu but not handle FX). Staff activity view: who did what today. | ⏳ |

---

## Track E: carried over from the 6 Oct review

| # | What | Status |
|---|---|---|
| E1 | Fix the 8 P1 gaps reproduced in `tests/deployment-audit.test.ts` | 🔜 |
| E2 | Per-desk switch for Susu (hide it for FX-only desks, including the sample desk) | 🔜 |
| E3 | Give the sample desk a built-in test channel so prospects can try the assistant without Twilio | 🔜 |
| E4 | Rename the Clerk application from "dineroyard" to "Aksen OTC" (Clerk dashboard) | owner action |
| E5 | Delete unused marketing files with fake testimonials and guarantees (`trust-and-reviews.tsx`, `contact-desk.tsx`, `origin-story.tsx`, `demo-form.tsx`) | needs owner OK |
| E6 | Commit Codex's and Claude's work, then shadow DineroYard's paper book for two weeks | 🔜 |
| E7 | SaaS: per-desk Twilio numbers, billing, platform super admin, per-desk AI budget caps | ⏳ |

## Recommended order

1. **Now:** E6 commit (after Codex's team work lands) → D1 + D2 staff accounts → E2 Susu switch → E3 sample-desk channel.
2. **Before real money:** E1 P1 fixes → C1 + C2 receipt reading → A2 desk FAQ.
3. **After topping up OpenRouter (about $10 is plenty to start):** switch the model in Settings, run "Test on sample messages", then B2 and B4 to measure cost and latency, then C3 and B3.
4. **SaaS:** E7, then C4 statement import.
