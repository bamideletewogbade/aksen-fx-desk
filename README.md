# Aksen OTC

Aksen OTC is an operator workspace for licensed NGN/GHS currency desks. It keeps customer quotes, statement-backed payment checks, approvals, payouts, account movements, customer conversations, Susu booklets, and audit history in one system.

The software does not hold customer money or connect directly to a bank. Staff confirm funds against the desk's own statement and record the payout reference. Higher-value payouts can require approval by a second administrator.

## Current product areas

- **Desk and trades:** create locked customer quotes, share a customer link, record statement evidence, approve payouts, and preserve the event history.
- **Inbox:** handle customer conversations through the active Twilio integration. The rules engine handles routine requests; the optional OpenRouter model only interprets messages the rules cannot parse.
- **Customers:** keep contact details, KYC status, limits, notes, and trade history.
- **Accounts and day close:** manage bank and MoMo rails, adjust float with an audit record, and compare recorded movements with real statement totals.
- **Rates:** maintain separate NGN/GHS customer rates and directional USD reference rates for USD/NGN and USD/GHS. USD rates do not enable USD trade execution.
- **Susu savings:** manage daily booklet contributions, catch-up and prepaid days, one-day collection fees, month-end payout or rollover, partial early withdrawals, and optional Arkesel SMS receipts.
- **Team and controls:** owner, admin, dealer, and viewer roles; two-person payout thresholds; tamper-evident audit verification; configurable business-day timezone.

## Trust boundaries

- Uploaded receipts and screenshots are evidence only. They never confirm payment.
- A staff member confirms money from the desk's statement before payout can proceed.
- SMS failure never reverses or changes a saved contribution.
- An uncertain SMS provider result is held for review rather than automatically sent again.
- The AI assistant cannot set rates, confirm funds, approve payouts, or change trade status.
- Sample desks are clearly labelled and do not send messages or move money.

## Stack

- Next.js 15 and React 19
- Tailwind CSS and Lucide icons
- Neon PostgreSQL in hosted environments; PGlite for local development and tests
- Clerk or the built-in password session flow for authentication
- Twilio for the active customer messaging route
- Arkesel for Susu transactional SMS
- OpenRouter for bounded natural-language interpretation and summaries
- Cloudflare Workers through OpenNext; Vercel configuration is also included

## Local setup

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

The app opens at `http://localhost:3010`. With `DB_DRIVER=pglite`, the local login page offers a labelled sample desk.

For a hosted environment, set `DB_DRIVER=neon`, provide `DATABASE_URL`, and set an `APP_SECRET` of at least 32 characters. Provider keys and webhook secrets are documented in `.env.example`. Do not copy development or sample credentials into production.

## Quality checks

```bash
pnpm test
pnpm lint
pnpm build
```

The test suite uses an isolated PGlite database. Provider and live-deployment checks that need external credentials remain separate from the local suite.

## Deployment notes

Cloudflare is the primary configured worker path. The scheduled worker drains and refreshes the Susu SMS queue through `/api/internal/susu-sms`, protected by `SUSU_SMS_CRON_SECRET`. Normal Susu actions also attempt dispatch after the financial transaction commits.

Before a live-money launch, verify the hosted database, Clerk production instance if used, Twilio signatures and callbacks, Arkesel sender approval and delivery reporting, real account reconciliation, role assignments, backups, monitoring, and an end-to-end pilot with the client. A successful local build is not live-provider sign-off.
