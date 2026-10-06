# Susu naming, navigation and responsive UI review — 6 October 2026

## What changed

- The sidebar says **Susu savings** so it is distinguishable from the FX desk. The operator flow uses **contribution** for money received, **collection fee** for the one-day deduction, **payout** for money handed back, **rollover** for a balance carried forward, and **month-end closing** for the decision screen. Database and API names remain stable.
- Withdrawal and month-end actions now say **record** because this application records an operator's external cash, MoMo or bank payout; it does not execute that transfer.
- Sidebar clicks immediately show a named progress cue and a page-shaped skeleton while the server resolves the destination. Next.js already splits route code and prefetches `Link` destinations; `src/app/loading.tsx` supplies a route fallback for direct navigation and slow server responses.
- The tablet/mobile menu is a focusable, scrollable drawer with Escape and Tab handling. It no longer pushes the current page down.
- Trades have a card layout below wide desktop width, and filters wrap into two columns on tablet. Insights' detailed table can scroll inside its card. Segmented controls remain usable within narrow containers. Inbox uses the visible viewport height.

## Review evidence and limits

The local sample desk was reviewed in the browser at approximately 900 px width. Its twelve sidebar destinations were opened or inspected: Desk, Inbox, Trades, Customers, Susu savings, Accounts, Day close, Rates, Insights, Team, Settings, and WhatsApp & SMS. The sidebar drawer, immediate navigation skeleton, Susu overview, month-end empty state, Inbox, Trades and WhatsApp screens were visually inspected. Several pages required their own API response after the route appeared; this review addresses perceived wait time, not a measured reduction in server latency. The narrow-phone breakpoints were reviewed in source but were not exercised at a 375 px browser viewport. Susu payout and month-end populated states were covered in earlier domain tests, not visual testing here.

TypeScript and an isolated production build both passed after the UI changes. The build reported the existing missing-ESLint warning; it was not a lint check. This is UI readiness work, not a real-cash launch signoff. Cash reconciliation, corrections/reversals, second-person approval, live Neon concurrency and a client policy agreement remain outstanding in [susu-verification.md](../audit-2026-10-05/susu-verification.md).

There is also a distinct eligibility question before offering Susu to a forex-bureau client. A [Bank of Ghana financial-literacy table](https://www.bog.gov.gh/wp-content/uploads/2021/09/Series-1-Bank-of-Ghana-Financial-Literacy.pdf) describes Susu collectors as collecting deposits for later refund and says forex bureaus do not accept deposits. This is a reason to verify the exact client's authorization and operating entity before any real-money Susu pilot, not a determination of its legal status from the UI code.
