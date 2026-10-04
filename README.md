# AKSEN OTC · West Africa Bureau Operating System

> **Zero-Leakage OTC Currency Desk Operating Platform for Nigeria (NGN) ⇄ Ghana (GHS)**  
> Engineered by Aksen Labs for cross-border informal FX desks, syndicates, and market operators.

---

## ⚡ Overview & Capabilities

Traditional cross-border FX corridors in West Africa lose millions annually to fake bank slips, Photoshop alterations, account freezing from static collection accounts, and slow manual quoting over WhatsApp.

**AKSEN OTC** provides an institutional-grade, air-gapped operating system:
1. **Interactive AI WhatsApp Agent:**
   - Handles natural language trade negotiations (*"Hi, I want to change money"*, *"Swap ₦1.5M to Ghana MoMo"*).
   - Instant calculation against real-time wholesale corridor spreads (`1 GHS = 105.06 NGN`).
   - Generates 15-minute rate locks with unique ticket identifiers (`AKS-xxxxx`).
   - Automatically assigns rotated Nigeria collection bank accounts with strict narration enforcement.
2. **GEV System 1 & System 2 Slip Forensics:**
   - Multi-layer analysis of payment slips detecting font deviations, ELA noise variance, and NIBSS session discrepancies.
   - Fast-path verification under 1.2s for clean receipts, automated hold/escalation for altered slips.
3. **Operator Desk Workspace:**
   - Collapsible docking navigation bar (64px collapsed rail with smooth hover expansion to 240px).
   - Real-time ticket queue with Neon PostgreSQL synchronization.
   - Complete audit trail, WhatsApp message inspector, and payout execution controls.
4. **Treasury & Rails Management:**
   - Dynamic collection account rotation (Zenith, Access, Providus, Moniepoint) to prevent BVN freezes.
   - Real-time balance monitors and Ghana MoMo disbursement settlement controls.
5. **Business Intelligence & AI Briefs:**
   - Monthly volume graphs, inflow/outflow breakdown, corridor split charts, and AI-generated executive summaries.

---

## 🛠 Tech Stack

- **Framework:** [Next.js 15 (App Router)](https://nextjs.org) + React 19
- **Styling & UI:** Tailwind CSS, Lucide Icons
- **Database:** [Neon Serverless PostgreSQL](https://neon.tech) via `@neondatabase/serverless`
- **AI & Forensics:** OpenRouter LLM API + Jev routing + GEV Forensics
- **Hosting / Edge:** Cloudflare Pages / Cloudflare Workers & Vercel
- **Messaging:** Meta WhatsApp Cloud API & Webhook listener

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- `pnpm` (v9 or v10)
- Neon PostgreSQL connection string

### 2. Installation
```bash
git clone https://github.com/bamideletewogbade/aksen-fx-desk.git
cd aksen-fx-desk
pnpm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local` and add your credentials:
```bash
cp .env.example .env.local
```

```ini
# Neon PostgreSQL
DATABASE_URL="postgres://neondb_owner:***@ep-***.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# OpenRouter (Optional: for natural language AI chat expansion)
OPENROUTER_API_KEY="sk-or-v1-***"

# Meta WhatsApp Cloud API (For Live WhatsApp traffic)
WHATSAPP_ACCESS_TOKEN="EAAB..."
WHATSAPP_PHONE_NUMBER_ID="10987654321"
WHATSAPP_VERIFY_TOKEN="aksen_otc_token"
WHATSAPP_WEBHOOK_SECRET=""
```

### 4. Database Setup
Run the table migrations if connecting to a fresh database:
The system automatically queries or creates `otc_trade_tickets`, `bank_accounts`, `momo_wallets`, and `operator_users`.

### 5. Running Locally
```bash
pnpm dev --port 3010
```
Open [http://localhost:3010](http://localhost:3010) in your browser:
- **Public Corridor Page:** `/`
- **Operator Desk:** `/desk`
- **Live WhatsApp Simulator:** Built directly into the desk header and `/whatsapp`
- **Settings & Rails:** `/settings`
- **Analytics & BI:** `/analytics`
- **Treasury:** `/treasury`
- **Trade History:** `/history`

---

## 📱 WhatsApp Live Integration

1. Go to **Settings ➔ WhatsApp Gateway** (`/whatsapp`).
2. Set your Meta Cloud API webhook URL to:  
   `https://<your-domain>/api/whatsapp/webhook`
3. Enter your verify token (`aksen_otc_token`).
4. Real WhatsApp inbound messages will immediately be processed by the AI conversational agent, generate rate locks, assign rotated banks, run GEV receipt forensics, and drop tickets into the Operator Desk in real-time.

---

## 🔐 Security & Architecture

- **Air-Gapped Payouts:** MoMo and NIBSS payouts require manual operator authorization or multi-signature syndicate sign-off.
- **Account Rotation:** High-velocity intake accounts are retired after hitting preset turnover thresholds to prevent bank flags.
- **Audited Transcripts:** Complete unalterable conversational transcripts are stored with each ticket in Neon Postgres.
