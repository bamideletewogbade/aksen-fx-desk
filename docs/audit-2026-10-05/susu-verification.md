# Susu functional verification — 5 October 2026

## Decision

The booklet works as a supervised, synthetic demonstration. Its core operations now have passing database tests and an authenticated local HTTP journey. It is **not yet suitable as the only record of a real client's cash**: collections and payouts are entered by operators but are not reconciled to a counted cash drawer, bank/MoMo statement, or the desk's existing journal and day close.

## Intended flow and evidence

| Flow | Observed behavior | Evidence / limit |
| --- | --- | --- |
| Add saver | Creates a desk-scoped `S-` reference and starts this month's page on today's box. The preview uses the desk date. | Database test; preview source and type check. The changed preview was not browser retested. |
| Collect cash | Converts cash to whole daily boxes, returns remainder as change, and fills a future page when needed. Paused savers cannot be collected from. | Database tests and authenticated HTTP probe. No physical cash verification. |
| Quick round | Parses names, phones and saver references, asks the operator to resolve ambiguous lines, refuses to save an incomplete preview, and saves the round atomically. More than 200 lines is rejected visibly. | Parser and transaction tests; source/UI review. No live collector device test. |
| Retry collection | A UUID request key is stored with a payload hash and result in the same transaction. Retrying the same request returns the result without recording another payment; reusing the key for different cash is rejected. | Database test and authenticated HTTP retry. A refreshed browser or a newly entered request gets a new key; accidental duplicate *business* entries still need a correction and reconciliation workflow. |
| Change daily amount | Unfilled current boxes can change immediately. Filled boxes retain their value; a queued change takes effect when another new page opens. Reverting to the current amount cancels the queued change. Already prepaid pages keep their original rate. | Database test and copy/source review. Confirm this commercial policy with the client. |
| Withdraw / close | One day's amount is charged when a page with savings is closed; a positive remainder can be paid out or carried forward. Paused savers can still be edited and paid out. Rollover avoids charging carried money again. | Database tests, authenticated HTTP withdrawal, paused-saver browser view. Actual payout execution and receipt are not verified. |
| Overview / history | Open-page fee estimate includes all eligible open pages. A payment spanning two pages stays whole in the last 200 payments shown. | Regression tests. History is intentionally limited to 200 payments in the UI. |

The domain rules are in `src/lib/susu.ts` and `src/server/susu.ts`, with Postgres-shaped tables in migrations `004_susu` and `005_susu_collection_requests`. The UI is under `src/app/susu`; authenticated routes are under `src/app/api/susu`. Local tests use PGlite. The optional AI summary is separate from the money rules and was not exercised against a live model.

## Verification record

- Focused Susu suite: **21/21 passed** after the final history/date/copy changes.
- Full suite before those final changes: **92 passed, 1 skipped**; final changes affected only the Susu query/UI and the focused suite passed afterward.
- TypeScript: `tsc --noEmit` passed after the final changes. The sandbox could not traverse some pnpm symlinks, so this check used an approved unsandboxed command.
- Production Next build passed after the final changes, using isolated PGlite and build directories. ESLint is not installed, so the build did not constitute a lint check.
- Authenticated local HTTP probe: create saver, collect GH₵25, return GH₵5 change, retry without duplication, resolve `S-0001`, block collection while paused, and withdraw GH₵10 after the one-day fee. These ran with disposable demo data. A paused saver page was also inspected in the local browser.
- `git diff --check` passed. No live Neon concurrency, Clerk tenant, real WhatsApp, cash count, external payment, backup restore, or real client data was tested.

## Before a real-cash pilot

1. Connect each collection, change given, fee, payout and rollover to a cash-account movement and signed daily reconciliation. Require a second person or a verifiable statement/cash count for payouts and exceptions.
2. Add controlled correction/reversal for wrong saver, wrong amount, duplicate business entry and disputed payout, preserving the original event and an audit reason. Request-key retry protection does not solve those cases.
3. Confirm the client's precise rules for mid-month join, one-day fee on partial pages, prepaid months, rate changes, early withdrawal, unclaimed balances and rounding. The current implementation encodes one particular booklet policy.
4. Test migration `005` and concurrent collection/close against a disposable production-like Neon branch; PGlite does not prove lock behavior under a real multi-worker load.
5. Run two-role UAT on a mobile collector device, then shadow the client's existing paper/cash book for several full day closes and a month end. The existing records remain authoritative until every difference is explained.
