# DineroYard team access and navigation review — 6 October 2026

This review is based on the current local source and isolated test database. It does not assign roles to real employees or verify a deployed DineroYard tenant.

## Employee journey

1. An Admin or Owner creates a seven-day, single-use invite for a verified work email and chooses Admin, Dealer, or Viewer. The app shows the link once; it does not send an email. A localhost link cannot be used by a remote employee.
2. On a Clerk-enabled desk, the employee signs in with that verified email, sees the pending desk on onboarding, and accepts. Without Clerk, the invite link uses the built-in password flow. The Clerk-enabled invite page no longer offers the incompatible password form.
3. Each request resolves the employee's active membership from the database. A role change applies to the next request. Removing a member revokes built-in sessions immediately; Clerk requests stop resolving a desk because the membership is inactive.
4. The employee lands on Desk, then works in Inbox, Trades, Customers, or Susu. Admins also configure money, channels, policy, and staff. Day close records the bank or MoMo statement against the trade ledger.

## Current role matrix

| Action | Viewer | Dealer | Admin | Owner |
| --- | --- | --- | --- | --- |
| View desk, trades, customers, Susu, money and reports | Yes | Yes | Yes | Yes |
| View team | Own membership only | Own membership only | Full team and invites | Full team and invites |
| Reply to chats; create quotes and customer records; record incoming trade funds | — | Yes | Yes | Yes |
| Record an already approved trade payout or authorized refund | — | Yes | Yes | Yes |
| Add savers, collect contributions, roll Susu balances forward | — | Yes | Yes | Yes |
| Record Susu cash payouts and early withdrawals | — | — | Yes | Yes |
| Approve trade payouts, initiate refunds, set verified/rejected KYC status, use custom rates | — | — | Yes | Yes |
| Set rates, accounts, float, desk policy, channels/assistant, and close trade-ledger days | — | — | Yes | Yes |
| Invite staff, change or remove non-owner staff | — | — | Yes | Yes |
| Promote, change, or remove another owner | — | — | — | Yes |

The role names are fixed profiles, not per-feature custom grants. An owner cannot change their own access. Large trade payouts require approval from an Admin or Owner other than the person who confirmed funds. That four-eyes rule applies at or above the configured currency threshold; it does not apply to Susu cash-outs. The role picker now previews the rights it grants before applying a change.

## Navigation decision

Keep the twelve destinations, grouped as **Daily work**, **Money & review**, and **Manage desk**. These names describe the user's intent better than the previous Operate / Money / Desk headings. Do not merge Inbox with WhatsApp & SMS: one handles live conversations, the other configures channels. Do not bury Rates under Settings: it is an operational control that staff may use daily. Accounts, Day close, and Insights also have distinct tasks and authorization paths. The existing mobile drawer and route-loading skeleton remain in place.

## Remaining launch gates

- **Susu cash control:** An Admin can now record a payout or withdrawal, but the system has no separate request-and-approve step, no second-person check, and an optional payout reference. Decide the business cash custody policy with DineroYard before real funds move. The Susu book is separate from the trade/account ledger, so trade day close does not reconcile Susu cash.
- **Trade payout proof:** The server enforces role and state transitions, but `recordPayout` records an externally made transfer by reference. It does not verify the bank or MoMo transfer with a provider. Trial with controlled amounts and independent statement reconciliation is still required.
- **Auth consolidation:** Clerk and built-in password sessions coexist. The UI uses Clerk when configured, but the built-in login API remains available. Decide whether to disable legacy login for a production Clerk-only tenant after migrating existing accounts and the demo route.
- **Invite delivery and membership scope:** Invites are manual links; a Clerk account already attached to another desk is redirected to that desk instead of joining a second one. Test the intended employee email and sign-in path on the deployed domain.
- **Role assignment:** No live employee names or job responsibilities were supplied. Assign roles only after mapping who confirms incoming funds, who approves payouts, who records outgoing transfers, and who closes the day; maintain at least two Admin/Owner approvers for large trades.

## Verification

The local test suite covers permission changes, session revocation, invite revocation, and denial of Dealer Susu cash-outs including an atomic mixed close batch. TypeScript and the full Vitest suite passed (97 passed, 1 skipped). An isolated Next.js production build passed with lint disabled because ESLint is not installed. The first build against the shared `.next` directory failed during route collection while other Node processes were active; the isolated build generated all 35 static pages. Deployed multi-user checks are still outstanding.
