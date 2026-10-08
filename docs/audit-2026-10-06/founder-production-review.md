# Aksen OTC — source, product and production-readiness review

Review started 6 October and continued 7 October 2026. Source baseline: `57c774e` (`latest push`), initially clean working tree. Live URL supplied by founder: https://aksen-otc.bishoptewogbade.workers.dev/ . This report separates source evidence, isolated execution and live observations; it is not a blanket production certification.

**Decision: keep the architecture, fix the critical operational controls, and use a measured shadow pilot before this becomes the sole record of a real-money operation.** The product is substantially beyond the earlier prototype. Its happy path works locally, but several exception paths still undermine the money/control story. The deployed public/auth boundary responds, while full live settlement and recovery remain unverified.

Companion: [five founder metrics and Lean Startup experiments](founder-metrics-and-lean.md).

## What is in the product

| Area | Implemented responsibility | Boundary |
|---|---|---|
| Public acquisition | Landing page, example quote calculator, sample workflow, walkthrough enquiry | An enquiry is stored, not proof of follow-up, demand or willingness to pay |
| Identity and setup | Clerk integration, built-in password sessions, organizations, roles, invitations, onboarding checklist | Clerk and built-in sessions coexist; test configuration is not production identity readiness |
| FX desk | Rates, customer records/KYC flags, bank/MoMo account records, quote creation, customer bearer link, evidence, funds recording, approval, payout recording, holds, cancellation and refunds | Operators verify statements and execute transfers outside Aksen; there is no independently verified bank settlement in this flow |
| Inbox | Twilio inbound/outbound, conversation state, human takeover, delivery statuses, simulator, media | Requires approved/configured channel; outage/retry recovery is incomplete; direct Meta route only acknowledges messages |
| AI | Rules-first conversation; model fallback for difficult phrasing; structured/grounded readings; summaries from computed facts; Susu nudge suggestions | No model should establish credit or payout authority. No evidence here of calibrated live accuracy or live provider reliability |
| Susu | Saver booklets, daily contributions, whole-day allocation/change, bulk rounds, request idempotency, withdrawals, month-end payout/rollover, one-day fee | Separate savings subledger; records cash actions, does not execute them. Not reconciled by the FX day-close report |
| Operations | Day close, insights, activity, CSV export, audit chain, staff administration | Incomplete reconciliation/close invariants; operational statistics are not Aksen company financial metrics |

The main FX journey is: operator setup → customer and rate → quote → customer accepts beneficiary → collection instructions → evidence → operator records independently observed credit → admin approval → external payout recorded → customer completion → statement comparison/day close.

## Fresh verification evidence

| Layer | Result | Scope and limitations |
|---|---|---|
| TypeScript | Passed `tsc --noEmit --incremental false` | Original source before the new focused audit test; subsequent complete test run also exercised that test |
| Automated tests | 114 passed, 5 skipped, 0 failed; 119 total | **Nine passing tests reproduce defects/unsafe or incompletely isolated behavior.** The other 105 passes are functional checks. Skips: four live-AI cases and one Neon migration smoke test. In-memory PGlite is not a production Neon concurrency test |
| Production compilation | Two snapshot builds completed with exit 0 | First without Clerk config; second with supplied Clerk test keys. Both reported missing ESLint during the lint phase. Compilation success does not mean lint passed |
| Lint | Blocked by repository dependency setup | Direct configured command reports ESLint must be installed; `eslint` and `eslint-config-next` are not declared in package.json despite the config imports |
| HTTP FX + pages | 47/47 assertions passed | Original restored source, isolated PGlite database, Clerk test configuration; quote → acceptance → funds → approval → recorded payout → customer completion, API reads, page responses and session revocation |
| HTTP boundaries + Susu | 15/15 assertions passed | Synthetic saver creation/collection/withdrawal, identical retry, changed-payload conflict, negative amount rejection, tenant read isolation, origin rejection, audit chain and disabled-provider checks |
| Clerk browser | Synthetic test signup, reserved test-email code verification, onboarding and authenticated desk reached | Used official `+clerk_test`/`424242` behavior; no verification email sent. Google OAuth, MFA, recovery, invited-user Clerk journey and production identity instance not tested |
| Browser UX | Landing, sign-in, onboarding, mobile menu, Susu creation, live redirect observed | Mobile 390×844 and desktop 1366×900 were requested through browser viewport controls; measured mobile desk document had no horizontal overflow. Broader device/accessibility certification remains outstanding |
| Live deployment | 12 read-only route checks | Public pages 200; six protected APIs 401; retired tickets 410; invalid portal 404. `/desk` returns streamed HTML 200 and then redirects in browser to `/login?next=%2Fdesk`; HTTP status alone is not proof of protected-page access |
| Live integrations | Not signed off | No real funds, external customer messages, production record mutations, Twilio delivery, Meta onboarding, bank verification, Neon restore or OpenRouter reliability test in this review |

The initial package-manager invocation was sandbox-blocked. Installed binaries ran successfully with reviewed execution. A temporary Clerk-free harness was used to unblock early local investigation, then its three changed files were restored from source before the final 47-check HTTP pass. Do not count that early harness run as Clerk evidence. The `.audit/founder-20261006` copy has an ignored local test environment; no provided key appears in the reports.

Evidence files: `founder-tests.json`, `http-results.json`, `founder-boundary-results.json`, `production-smoke.json`, and the executable HTTP probes in this directory. The original source application was not repaired during this audit. The added `tests/founder-audit.test.ts` is explicitly labeled as a defect reproduction.

## Priority findings

### P1 — KYC decisions are not preserved through the full transaction

`src/server/desk.ts:370` authorizes based on the requested KYC status. A dealer can change a rejected customer to UNVERIFIED and quote again. `src/server/trades.ts:496` checks APPROVED status and the payout account but does not recheck a later customer rejection. Both reproduced in the current test run.

Required: privileged KYC transitions, checks against existing restricted status, and final risk revalidation/invalidation of stale approval when customer/evidence conditions change. Regression tests should assert rejection of the unsafe action, replacing the present reproduction expectations.

### P1 — Late and post-refund funds can have the wrong operational state

`src/server/trades.ts:399` checks a stored trade status without checking `funds_due_at` during funds recording. A late payment can become FUNDS_CONFIRMED if expiry has not been swept first. A fresh credit on a fully REFUNDED trade remains terminal REFUNDED despite money now owed. Both reproduced.

Required: evaluate deadlines and outstanding liability under the same transaction lock as the receipt. Record genuine late money but route it into a visible hold/refund decision. A terminal status must not conceal a positive customer liability.

### P1 — Day close is not complete bank/cash reconciliation

`src/server/day-close.ts` sums trade receipts/payouts/refunds. It omits float movements and the separate Susu collections/withdrawals. Current tests reproduce ignored top-ups and additional credits changing a previously closed day. Archived accounts are omitted from the report. The UI now correctly starts statement fields blank—this part of the older review has been fixed.

Required: define which financial book each close covers; reconcile all relevant movements; preserve immutable close snapshots; introduce authorized reopening/corrections; include archived accounts for historical periods. Until then, avoid presenting an FX match as a full company cash close.

### P1 — WhatsApp routing trusts unverified number ownership

`src/server/inbox.ts:725` accepts an available syntactically valid number without provider-backed ownership/allocation. Inbound routing selects a desk from the destination address. Provider signature authenticity does not establish which tenant owns that destination. Arbitrary number attachment reproduced locally.

Required: platform-managed/verified sender provisioning tied to organization and provider account identity. Scope production channels to approved businesses and verify the exact permitted use case.

### P1 — Messaging failures can be acknowledged without recoverable completion

`src/app/api/twilio/inbound/route.ts:38` catches processing failures and still returns 200. `src/server/inbox.ts` inserts/deduplicates messages before all assistant effects and outbound sending complete. Outbound persistence and provider sending are separate operations; conversation serialization is process-local.

Required: durable receipt state, transactional outbox, idempotent effects, retries/dead-letter visibility, replay controls and database-backed ordering. Run actual provider retry/outage tests. This is a source-confirmed reliability risk, not an observed live message loss in this audit.

### P1 — Previous assistant reply bypasses AI number masking

`src/server/ai/assist.ts:43` passes `lastReply` without masking; `src/server/ai/reader.ts:79` interpolates it into the model prompt. The prior reply can contain a bank/MoMo number even though the current customer text is masked. `tests/founder-audit.test.ts` captures a synthetic account number reaching the model callback. No live model was called to prove it.

Required: sanitize every prompt field, including previous replies/context, with consistent token mappings; test the entire payload sent at the provider boundary. Remove the absolute claim that numbers never leave the server until that guarantee is verified. Retain rules as the authority for amounts, state and payments.

### P1 — Channel-policy feasibility is unresolved

The current [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy) prohibits facilitating exchange of real currency and restricts requesting full financial account numbers; licenses do not automatically override its restrictions. The assistant's currency quote and beneficiary collection flow creates a material platform-eligibility issue. A working Twilio sandbox or successful message is not approval.

Required: written provider determination on exact operator use, countries and message examples. Keep the desk/secure-portal value hypothesis testable separately. Do not describe a currency chat workflow as launch-ready before this is resolved. Licensing/privacy obligations for the intended operator and the distinct Susu workflow also require confirmation outside this source audit.

### P2 — Production identity presentation and demo promise are inconsistent

Live login visibly shows **Development mode** and **Sign in to dineroyard** inside Aksen OTC. The landing page's “Try the sample desk” reaches that login with no sample-owner buttons. This was verified in the deployed browser, not inferred only from config.

Required: decide whether the deployment is a preview or production, label it appropriately, align product/client branding, and provide an actual isolated sample desk or change the CTA. Verify the production Clerk instance, callback URLs, roles, recovery and invitation flow before treating identity as signed off. Current sample UI is enabled only for local PGlite/demo config.

### P2 — Test data isolation is improved, but still incomplete

The existing reproduction confirms simulated conversations create normal customer/trade table rows. Current source now uses a test address, exposes Test labels, and excludes rehearsal-linked trades from main Insights totals; the older blanket claim that all analytics are polluted is outdated. Still, this is shared-tenant operational data, and `matchCustomer` matches last-nine phone digits before assistant effects. Some lookup/count paths need the same test boundary.

Required: use a separate demo organization/database, or enforce a test boundary consistently across customer association, trade mutations, ledger, exports and every aggregate. Audit `customers.returning`'s historical subquery as well. Do not reuse a real customer phone for rehearsals.

### P2 — Deployment/docs/quality controls lag the implementation

The current OpenNext Cloudflare Worker adapter replaces the older static packager; the deployed API responds. Preserve this improvement. However README still promises zero leakage, forensic image analysis, NIBSS checks, real-time wholesale rates and bank-freeze prevention that are not established by current behavior. `.env.example` lists the older Meta path and misses key current runtime settings. Clerk is described as optional in server code, but middleware/root client components require it; missing keys broke the unmodified app during this review. Lint is not runnable from declared dependencies.

Required: rewrite setup/claims against the real flow, make Clerk consistently optional or explicitly required, restore lint dependencies/CI enforcement, and record deploy version/build provenance. The live commit has not been matched conclusively to the local Git hash.

## UI, UX and product design judgment

Good foundations: action-based work queue; distinct receipt/funds/approval steps; signed customer page without an app installation; readable controls; accessible labels in inspected forms; modal focus/escape handling in source; mobile navigation; empty-state setup checklist; transparent Susu fee/change preview. Preserve these rather than redesigning everything.

Specific improvements:

- Replace the new desk's “The assistant has it covered” when no channel/rates exist with “No channel connected” or an equivalent truthful setup state.
- Name the product's first-value goal and guide to it. Seven equally presented setup items include channel connection before policy feasibility is established; prioritize the permitted manual quote/portal workflow when appropriate.
- Keep “record payout” wording distinct from executing a transfer. Completion currently means an operator supplied a reference, not that a bank independently verified settlement.
- Let onboarding capture a usable operator name: the synthetic account's email local-part became a long greeting. Align tenant and product branding on login.
- Add bounded request timeouts and an explicit retry/error path to the API client. Onboarding displayed a prolonged spinner; local dev chunk failure left the saver page at its shell. Neither should be mistaken for customer abandonment without instrumentation. These observations are not production latency benchmarks.
- Give FX and Susu separate activation/value/close definitions. Both may serve a desk, but the public acquisition story currently sells FX while the authenticated app also contains savings operations.
- Tie readiness to more than a matched day close. Identity, provider approval, liability handling, retries, restore and support ownership are also required.

Full WCAG review, screen-reader testing, field usability with actual operators, mobile-device/network testing and statistically meaningful performance/load tests remain open. Source responsiveness classes and a desktop browser viewport are insufficient substitutes.

## Architecture judgment

Keep the modular monolith: Next.js App Router → authenticated/validated route wrappers → domain services → Postgres, audit and financial records. Money calculations use integer minor units/scaled rates. Trade mutations use row locks and optimistic versions. Sessions use hashed random tokens and HttpOnly cookies; local passwords use scrypt; Clerk proves identity while the app database decides membership/role. These are appropriate foundations.

Production uses Neon by default and does not silently fall back to local storage; tests use PGlite. Migration locking and transactional domain actions are implemented. Tenancy relies mainly on application SQL scoping, so strengthen tenant-invariant tests and database constraints. Request limits and conversation queues are per-process, which is insufficient for coordinated serverless abuse/retry control. Audit chaining is tamper-evident, not proof against a privileged party rewriting the full chain/head. Media in Postgres needs retention, size limits, and restore-cost planning.

Do not introduce microservices to solve these issues. Put effort into authoritative state transitions, durable message recovery, correction/reversal workflows, recovery evidence, consistent financial boundaries, and observable errors. No independently verified bank balance should be implied: current payout recording intentionally does not enforce liquidity from a known live balance.

## Release decision and next sequence

1. Fix KYC/final approval, terminal liabilities, deadline transitions, AI prompt sanitization and close invariants. Turn reproductions into safety regressions.
2. Resolve sender ownership and platform eligibility; build durable delivery/replay handling if messaging remains in scope.
3. Repair production auth/demo/branding/config and quality gates; identify deployed commit and environment.
4. Run staging tests on isolated Neon plus real test-provider callbacks, concurrent actions, timeouts, retries, restored backups, revoked staff sessions and customer-link revocation. Recheck both Clerk and built-in auth paths or remove the unused one.
5. Run a supervised shadow pilot with named operator responsibility, measured baseline, zero unexplained monetary differences, and actual willingness-to-pay evidence. Agree measurable go/no-go criteria before moving to operational reliance.

This review changed audit artifacts and one reproduction test; it did not deploy changes, move funds, send customer messages, or repair the production application. A synthetic Clerk test identity was created using the provided test instance; the associated desk/saver records live only in the isolated local database.
