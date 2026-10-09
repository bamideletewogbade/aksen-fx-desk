/**
 * Ordered, append-only schema migrations. Never edit a shipped migration;
 * add a new one. Every tenant-owned table carries org_id and every query in
 * src/server filters by it.
 *
 * Money is stored as bigint minor units (kobo, pesewas). Rates are numeric
 * with six decimal places and are always quoted as "1 GHS = <rate> NGN".
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_core',
    sql: `
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Africa/Accra',
  support_phone text,
  customer_note text,
  quote_ttl_minutes integer NOT NULL DEFAULT 15 CHECK (quote_ttl_minutes BETWEEN 1 AND 1440),
  funds_window_minutes integer NOT NULL DEFAULT 60 CHECK (funds_window_minutes BETWEEN 5 AND 10080),
  approval_threshold_ngn bigint NOT NULL DEFAULT 500000000,
  approval_threshold_ghs bigint NOT NULL DEFAULT 5000000,
  is_demo boolean NOT NULL DEFAULT false,
  audit_seq bigint NOT NULL DEFAULT 0,
  audit_head text NOT NULL DEFAULT 'GENESIS',
  trade_seq bigint NOT NULL DEFAULT 0,
  customer_seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','ADMIN','DEALER','VIEWER')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','DEALER','VIEWER')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ref text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  kyc_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (kyc_status IN ('UNVERIFIED','VERIFIED','REJECTED')),
  id_type text,
  id_reference text,
  per_trade_limit_ngn bigint,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, ref)
);
CREATE INDEX customers_org_name_idx ON customers (org_id, lower(name));

CREATE TABLE rate_board (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  corridor text NOT NULL CHECK (corridor IN ('NGN_GHS','GHS_NGN')),
  customer_rate numeric(18,6) NOT NULL CHECK (customer_rate > 0),
  reference_rate numeric(18,6) CHECK (reference_rate > 0),
  fee_minor bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  min_pay_minor bigint NOT NULL DEFAULT 0,
  max_pay_minor bigint,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, corridor)
);

CREATE TABLE rails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('NGN','GHS')),
  kind text NOT NULL CHECK (kind IN ('BANK','MOMO')),
  provider text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  can_collect boolean NOT NULL DEFAULT true,
  can_pay boolean NOT NULL DEFAULT true,
  daily_soft_cap_minor bigint,
  low_balance_minor bigint,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, currency, provider, account_number)
);

CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ref text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  corridor text NOT NULL CHECK (corridor IN ('NGN_GHS','GHS_NGN')),
  pay_currency text NOT NULL,
  receive_currency text NOT NULL,
  pay_minor bigint NOT NULL CHECK (pay_minor > 0),
  receive_minor bigint NOT NULL CHECK (receive_minor > 0),
  fee_minor bigint NOT NULL DEFAULT 0,
  rate numeric(18,6) NOT NULL,
  reference_rate numeric(18,6),
  quote_mode text NOT NULL CHECK (quote_mode IN ('PAY','RECEIVE')),
  status text NOT NULL,
  status_before_hold text,
  version integer NOT NULL DEFAULT 1,
  quote_expires_at timestamptz NOT NULL,
  funds_due_at timestamptz,
  accepted_at timestamptz,
  accepted_by text,
  collection_rail_id uuid REFERENCES rails(id),
  beneficiary jsonb,
  funds_received_minor bigint NOT NULL DEFAULT 0,
  funds_confirmed_at timestamptz,
  funds_confirmed_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id),
  paid_out_at timestamptz,
  paid_out_by uuid REFERENCES users(id),
  completed_at timestamptz,
  refunded_minor bigint NOT NULL DEFAULT 0,
  closed_reason text,
  hold_reason text,
  portal_nonce text NOT NULL,
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, ref)
);
CREATE INDEX trades_org_status_idx ON trades (org_id, status, updated_at DESC);
CREATE INDEX trades_org_customer_idx ON trades (org_id, customer_id, created_at DESC);

CREATE TABLE funds_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES trades(id),
  rail_id uuid NOT NULL REFERENCES rails(id),
  currency text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  bank_reference text NOT NULL,
  payer_name text,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, rail_id, bank_reference)
);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES trades(id),
  rail_id uuid NOT NULL REFERENCES rails(id),
  kind text NOT NULL DEFAULT 'PAYOUT' CHECK (kind IN ('PAYOUT','REFUND')),
  currency text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  reference text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, rail_id, reference)
);
CREATE UNIQUE INDEX payouts_one_payout_per_trade ON payouts (trade_id) WHERE kind = 'PAYOUT';

CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES trades(id),
  submitted_by text NOT NULL CHECK (submitted_by IN ('CUSTOMER','OPERATOR')),
  note text,
  file_name text,
  mime text,
  size_bytes integer,
  sha256 text,
  data bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_trade_idx ON evidence (trade_id);
CREATE INDEX evidence_hash_idx ON evidence (org_id, sha256);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES trades(id),
  kind text NOT NULL,
  memo text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_lines (
  id bigserial PRIMARY KEY,
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  account text NOT NULL,
  currency text NOT NULL,
  amount_minor bigint NOT NULL
);
CREATE INDEX journal_lines_account_idx ON journal_lines (org_id, account, currency);

CREATE TABLE day_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  rail_id uuid NOT NULL REFERENCES rails(id),
  expected_in_minor bigint NOT NULL,
  expected_out_minor bigint NOT NULL,
  statement_in_minor bigint NOT NULL,
  statement_out_minor bigint NOT NULL,
  note text,
  closed_by uuid NOT NULL REFERENCES users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, business_date, rail_id)
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  trade_id uuid,
  action text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('USER','CUSTOMER','SYSTEM')),
  actor_id text,
  actor_label text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  at_iso text NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  UNIQUE (org_id, seq)
);
CREATE INDEX audit_trade_idx ON audit_events (trade_id, seq);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business text,
  phone text,
  email text,
  role text,
  monthly_trades text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
)
`,
  },
  {
    // Customer messaging. A channel is one number a desk talks from; a
    // conversation is one customer on one channel; every inbound, outbound and
    // internal note is a message. `rev` comes from one sequence so the inbox can
    // stream "anything newer than rev N" across both tables.
    id: '002_inbox',
    sql: `
CREATE SEQUENCE inbox_rev_seq;

CREATE TABLE channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'TWILIO' CHECK (provider IN ('TWILIO')),
  kind text NOT NULL CHECK (kind IN ('WHATSAPP','SMS')),
  address text NOT NULL UNIQUE,
  label text NOT NULL,
  assistant_enabled boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  address text NOT NULL,
  phone text NOT NULL,
  profile_name text,
  customer_id uuid REFERENCES customers(id),
  trade_id uuid REFERENCES trades(id),
  mode text NOT NULL DEFAULT 'ASSISTANT' CHECK (mode IN ('ASSISTANT','HUMAN')),
  needs_human boolean NOT NULL DEFAULT false,
  handoff_reason text,
  assigned_to uuid REFERENCES users(id),
  bot jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false,
  unread integer NOT NULL DEFAULT 0,
  last_inbound_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_preview text,
  rev bigint NOT NULL DEFAULT nextval('inbox_rev_seq'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, address)
);
CREATE INDEX conversations_org_last_idx ON conversations (org_id, last_message_at DESC);
CREATE INDEX conversations_org_rev_idx ON conversations (org_id, rev);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('IN','OUT','NOTE')),
  author text NOT NULL CHECK (author IN ('CUSTOMER','ASSISTANT','OPERATOR','SYSTEM')),
  author_user_id uuid REFERENCES users(id),
  author_label text,
  body text,
  media_mime text,
  media_data bytea,
  media_count integer NOT NULL DEFAULT 0,
  trade_id uuid REFERENCES trades(id),
  provider_sid text,
  status text NOT NULL,
  error text,
  rev bigint NOT NULL DEFAULT nextval('inbox_rev_seq'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messages_provider_sid_idx ON messages (provider_sid) WHERE provider_sid IS NOT NULL;
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_org_rev_idx ON messages (org_id, rev);

ALTER TABLE trades ADD COLUMN conversation_id uuid REFERENCES conversations(id)
`,
  },
  {
    // Clerk handles sign-in; desks, roles and the audit trail stay here. A user
    // row is linked to one Clerk user. Clerk-only users have no usable password.
    id: '003_clerk',
    sql: `
ALTER TABLE users ADD COLUMN clerk_user_id text UNIQUE
`,
  },
  {
    // Susu: daily savings kept like a paper booklet. A page is one saver's
    // month (or the rest of it after a mid-month withdrawal). Collections fill
    // whole days; a payment that spans months writes one row per page.
    id: '004_susu',
    sql: `
ALTER TABLE organizations ADD COLUMN susu_seq bigint NOT NULL DEFAULT 0;

CREATE TABLE susu_savers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ref text NOT NULL,
  name text NOT NULL,
  phone text,
  notes text,
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency IN ('GHS','NGN')),
  daily_minor bigint NOT NULL CHECK (daily_minor > 0),
  next_daily_minor bigint CHECK (next_daily_minor > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','CLOSED')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, ref)
);
CREATE INDEX susu_savers_org_name_idx ON susu_savers (org_id, lower(name));

CREATE TABLE susu_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  saver_id uuid NOT NULL REFERENCES susu_savers(id) ON DELETE CASCADE,
  page_no integer NOT NULL,
  period text NOT NULL,
  start_day integer NOT NULL CHECK (start_day BETWEEN 1 AND 31),
  capacity integer NOT NULL CHECK (capacity >= 0),
  daily_minor bigint NOT NULL CHECK (daily_minor > 0),
  brought_forward_minor bigint NOT NULL DEFAULT 0,
  days_paid integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  close_kind text CHECK (close_kind IN ('PAYOUT','ROLLOVER','WITHDRAWAL')),
  fee_minor bigint,
  paid_out_minor bigint,
  carried_minor bigint,
  payout_method text,
  payout_reference text,
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (days_paid BETWEEN 0 AND capacity),
  UNIQUE (saver_id, page_no)
);
CREATE INDEX susu_pages_org_period_idx ON susu_pages (org_id, period, status);
CREATE INDEX susu_pages_saver_idx ON susu_pages (saver_id, page_no DESC);

CREATE TABLE susu_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  saver_id uuid NOT NULL REFERENCES susu_savers(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES susu_pages(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  days integer NOT NULL CHECK (days > 0),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  received_minor bigint NOT NULL DEFAULT 0,
  change_minor bigint NOT NULL DEFAULT 0,
  note text,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX susu_collections_saver_idx ON susu_collections (saver_id, created_at DESC);
CREATE INDEX susu_collections_org_time_idx ON susu_collections (org_id, created_at)
`,
  },
  {
    // A collector can safely retry after a lost HTTP response without filling
    // the same booklet boxes twice. The whole round shares one request key.
    id: '005_susu_collection_requests',
    sql: `
CREATE TABLE susu_collection_requests (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, request_id)
)
`,
  },
  {
    // AI reading of customer chat. A desk can pick its own OpenRouter model
    // (null = platform default) and turn the reading off. Each customer message
    // the model read keeps a note of what it understood, for operators.
    id: '006_ai_reading',
    sql: `
ALTER TABLE organizations ADD COLUMN ai_model text;
ALTER TABLE organizations ADD COLUMN ai_fallback_models text;
ALTER TABLE organizations ADD COLUMN ai_reads_chat boolean NOT NULL DEFAULT true;
ALTER TABLE messages ADD COLUMN ai_note jsonb
`,
  },
  {
    id: '007_susu_sms',
    sql: `
ALTER TABLE organizations ADD COLUMN susu_sms_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE susu_savers ADD COLUMN sms_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE susu_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  saver_id uuid NOT NULL REFERENCES susu_savers(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  kind text NOT NULL,
  recipient text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','ACCEPTED','SANDBOX','DELIVERED','NOT_DELIVERED','FAILED','UNKNOWN','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0,
  provider_id text,
  error_code text,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, event_key)
);
CREATE INDEX susu_sms_queue_idx ON susu_sms (available_at, created_at) WHERE status = 'QUEUED';
CREATE INDEX susu_sms_org_idx ON susu_sms (org_id, created_at DESC);
CREATE INDEX susu_sms_saver_idx ON susu_sms (saver_id, created_at DESC);
CREATE INDEX susu_sms_receipts_idx ON susu_sms (checked_at) WHERE status = 'ACCEPTED'
`,
  },
  {
    // Generated receipts wait for a human review. Operators can edit or skip
    // the draft before it becomes eligible for the background sender.
    id: '008_susu_sms_drafts',
    sql: `
ALTER TABLE susu_sms DROP CONSTRAINT susu_sms_status_check;
ALTER TABLE susu_sms ALTER COLUMN status SET DEFAULT 'DRAFT';
ALTER TABLE susu_sms ADD CONSTRAINT susu_sms_status_check CHECK (status IN ('DRAFT','QUEUED','SENDING','ACCEPTED','SANDBOX','DELIVERED','NOT_DELIVERED','FAILED','UNKNOWN','CANCELLED'))
`,
  },
  {
    // The rate board is intentionally one number per route. Clear the retired
    // quote modifiers and add a USD/NGN benchmark without enabling USD trades.
    id: '009_simple_rate_board',
    sql: `
UPDATE rate_board SET reference_rate = NULL, fee_minor = 0, min_pay_minor = 0, max_pay_minor = NULL, active = true;
ALTER TABLE rate_board DROP CONSTRAINT rate_board_corridor_check;
ALTER TABLE rate_board ADD CONSTRAINT rate_board_corridor_check CHECK (corridor IN ('NGN_GHS','GHS_NGN','USD_NGN'))
`,
  },
  {
    // Separate buy and sell benchmarks for USD against both local currencies.
    id: '010_usd_rate_directions',
    sql: `
ALTER TABLE rate_board DROP CONSTRAINT rate_board_corridor_check;
ALTER TABLE rate_board ADD CONSTRAINT rate_board_corridor_check CHECK (corridor IN ('NGN_GHS','GHS_NGN','USD_NGN','NGN_USD','USD_GHS','GHS_USD'))
`,
  },
  {
    // Each saver can opt into immediate SMS delivery. Review remains the
    // default, and the desk-wide SMS switch still controls all sending.
    id: '011_susu_sms_auto_send',
    sql: `
ALTER TABLE susu_savers ADD COLUMN sms_auto_send boolean NOT NULL DEFAULT false
`,
  },
  {
    // Desk-wide SMS dispatch policy: when true, contributions send immediately
    // to savers by default. Review remains available as an explicit preference.
    id: '012_susu_sms_desk_policy',
    sql: `
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS susu_sms_auto_send boolean NOT NULL DEFAULT false
`,
  },
  {
    // A repayable advance is not a contribution and must never colour a new
    // booklet day. Keep advances, repayments and close-time settlements in a
    // separate append-only history so the calendar remains truthful.
    id: '013_susu_advances',
    sql: `
ALTER TABLE channels DROP CONSTRAINT channels_provider_check;
ALTER TABLE channels ADD CONSTRAINT channels_provider_check CHECK (provider IN ('TWILIO','TEST'));

CREATE TABLE susu_advance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  saver_id uuid NOT NULL REFERENCES susu_savers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ADVANCE','REPAYMENT','SETTLEMENT')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  method text,
  reference text,
  note text,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX susu_advance_saver_idx ON susu_advance_transactions (saver_id, created_at DESC);
CREATE INDEX susu_advance_org_idx ON susu_advance_transactions (org_id, created_at DESC)
`,
  },
];
