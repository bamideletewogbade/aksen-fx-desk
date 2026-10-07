import { z } from 'zod';
import { parseMajor } from '@/lib/money';

/** Amounts arrive as major-unit strings ("1,500,000" or "1.5m") and leave as integer minor units. */
export const money = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return parseMajor(v);
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: (e as Error).message });
    return z.NEVER;
  }
});
export const optionalMoney = z.union([money, z.literal('').transform(() => null), z.null()]).optional();

export const corridor = z.enum(['NGN_GHS', 'GHS_NGN']);
export const currency = z.enum(['NGN', 'GHS']);
export const rate = z.string().trim().regex(/^\d+(\.\d{1,6})?$/, 'Use a rate like 105.06');
export const version = z.number().int().positive();
export const uuid = z.string().uuid();

export const beneficiary = z.object({
  kind: z.enum(['BANK', 'MOMO']),
  provider: z.string().trim().min(2).max(60),
  accountNumber: z.string().trim().min(6).max(20),
  accountName: z.string().trim().min(3).max(80),
  relationship: z.enum(['SELF', 'FAMILY', 'BUSINESS', 'OTHER']).default('SELF'),
});

export const signupSchema = z.object({
  deskName: z.string().trim().min(2, 'Enter your desk or business name').max(80),
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password').max(200),
});

export const quoteSchema = z.object({
  /** Optional only when quoting inside a chat: the chat's customer is used (or created). */
  customerId: uuid.optional().nullable(),
  conversationId: uuid.optional().nullable(),
  corridor,
  mode: z.enum(['PAY', 'RECEIVE']),
  amount: money,
  customRate: rate.optional().nullable(),
  fee: optionalMoney,
  ttlMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  beneficiary: beneficiary.optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

const base = { version };
export const tradeAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), ...base, beneficiary: beneficiary.optional().nullable() }),
  z.object({ action: z.literal('beneficiary'), ...base, beneficiary }),
  z.object({ action: z.literal('requote'), ...base }),
  z.object({ action: z.literal('record_funds'), ...base, railId: uuid, amount: money, bankReference: z.string().trim().min(4).max(80), payerName: z.string().trim().max(120).optional().nullable() }),
  z.object({ action: z.literal('approve'), ...base, acknowledged: z.array(z.string()).default([]) }),
  z.object({ action: z.literal('record_payout'), ...base, railId: uuid, reference: z.string().trim().min(4).max(80) }),
  z.object({ action: z.literal('hold'), ...base, reason: z.string().trim().min(5).max(300) }),
  z.object({ action: z.literal('release'), ...base }),
  z.object({ action: z.literal('cancel'), ...base, reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal('refund_due'), ...base, reason: z.string().trim().min(5).max(300) }),
  z.object({ action: z.literal('record_refund'), ...base, railId: uuid, amount: money, reference: z.string().trim().min(4).max(80) }),
  z.object({ action: z.literal('note'), note: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal('reissue_link'), ...base }),
]);

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  kycStatus: z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']).optional(),
  idType: z.string().trim().max(40).optional().nullable(),
  idReference: z.string().trim().max(60).optional().nullable(),
  perTradeLimitNgn: optionalMoney,
  notes: z.string().max(2000).optional().nullable(),
});

export const rateSchema = z.object({
  corridor,
  customerRate: rate,
  referenceRate: rate.optional().nullable().or(z.literal('').transform(() => null)),
  fee: optionalMoney,
  minPay: optionalMoney,
  maxPay: optionalMoney,
  active: z.boolean().default(true),
});

export const railSchema = z.object({
  label: z.string().trim().min(2).max(60),
  currency,
  kind: z.enum(['BANK', 'MOMO']),
  provider: z.string().trim().min(2).max(60),
  accountNumber: z.string().trim().min(6).max(20),
  accountName: z.string().trim().min(2).max(80),
  canCollect: z.boolean(),
  canPay: z.boolean(),
  dailySoftCap: optionalMoney,
  lowBalance: optionalMoney,
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  openingBalance: optionalMoney,
});

export const floatSchema = z.object({
  amount: money,
  direction: z.enum(['IN', 'OUT']),
  toRailId: uuid.optional().nullable(),
  memo: z.string().trim().min(3).max(200),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  timezone: z.enum(['Africa/Accra', 'Africa/Lagos']).optional(),
  supportPhone: z.string().trim().max(30).optional().nullable(),
  customerNote: z.string().trim().max(300).optional().nullable(),
  quoteTtlMinutes: z.number().int().min(1).max(1440).optional(),
  fundsWindowMinutes: z.number().int().min(5).max(10080).optional(),
  approvalThresholdNgn: optionalMoney,
  approvalThresholdGhs: optionalMoney,
});

export const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['ADMIN', 'DEALER', 'VIEWER']),
});

export const closeDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  railId: uuid,
  statementIn: money,
  statementOut: money,
  note: z.string().max(500).optional().nullable(),
});

export const inboxAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), text: z.string().trim().min(1).max(1600) }),
  z.object({ action: z.literal('take_over') }),
  z.object({ action: z.literal('hand_back') }),
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('link_customer'), customerId: uuid.nullable() }),
]);

export const channelSchema = z.object({
  id: uuid.optional(),
  kind: z.enum(['WHATSAPP', 'SMS']).optional(),
  number: z.string().trim().max(40).optional(),
  label: z.string().trim().max(60).optional(),
  assistantEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const simulateSchema = z.object({
  phone: z.string().trim().min(6).max(20),
  name: z.string().trim().max(60).optional().nullable(),
  text: z.string().max(1000).optional().nullable(),
  sampleReceipt: z.boolean().optional(),
  channelId: uuid.optional().nullable(),
});

export const saverSchema = z.object({
  smsEnabled: z.boolean().optional(),
  name: z.string().trim().min(2, 'Enter the saver’s name').max(80),
  phone: z.string().trim().max(30).optional().nullable(),
  daily: money,
  notes: z.string().trim().max(500).optional().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).optional(),
});

export const collectSchema = z.object({ amount: money, note: z.string().trim().max(200).optional().nullable(), requestId: uuid });

export const collectBulkSchema = z.object({ rows: z.array(z.object({ saverId: uuid, amount: money })).min(1).max(200), requestId: uuid });

export const closePagesSchema = z.object({
  pages: z
    .array(z.object({ pageId: uuid, kind: z.enum(['PAYOUT', 'ROLLOVER', 'WITHDRAWAL']), method: z.string().trim().max(40).optional().nullable(), reference: z.string().trim().max(80).optional().nullable() }))
    .min(1)
    .max(500),
});

export const withdrawSchema = z.object({ method: z.string().trim().max(40).optional().nullable(), reference: z.string().trim().max(80).optional().nullable() });

export const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  business: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(160).optional().nullable(),
  role: z.string().trim().max(80).optional().nullable(),
  monthlyTrades: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(1000).optional().nullable(),
});
