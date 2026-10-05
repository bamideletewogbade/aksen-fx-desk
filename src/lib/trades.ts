import type { Corridor, Currency } from './money';

/**
 * Trade lifecycle shared by the server and every screen.
 *
 *   QUOTED ──accept──▶ AWAITING_FUNDS ──funds confirmed──▶ FUNDS_CONFIRMED ──approve──▶ APPROVED ──payout recorded──▶ COMPLETED
 *     │                    │    ▲                               │                         │
 *     ▼                    ▼    └──────── release ──── ON_HOLD ◀┴─────────────────────────┘
 *  EXPIRED / CANCELLED   EXPIRED / CANCELLED                     │
 *                                                                ▼
 *                                                  REFUND_DUE ──refund recorded──▶ REFUNDED
 *
 * Payment evidence from the customer never moves a trade. Only an operator
 * recording a bank or MoMo credit against a collection account does.
 */
export type TradeStatus =
  | 'QUOTED'
  | 'AWAITING_FUNDS'
  | 'FUNDS_CONFIRMED'
  | 'APPROVED'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'REFUND_DUE'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'EXPIRED';

export type Tone = 'neutral' | 'waiting' | 'action' | 'good' | 'risk' | 'done';

export const STATUS_META: Record<TradeStatus, { label: string; customerLabel: string; tone: Tone; hint: string }> = {
  QUOTED: { label: 'Quote sent', customerLabel: 'Quote ready', tone: 'neutral', hint: 'Waiting for the customer to accept.' },
  AWAITING_FUNDS: { label: 'Awaiting funds', customerLabel: 'Waiting for your payment', tone: 'waiting', hint: 'Check the collection account for the credit.' },
  FUNDS_CONFIRMED: { label: 'Funds confirmed', customerLabel: 'Payment received', tone: 'action', hint: 'Ready for payout approval.' },
  APPROVED: { label: 'Approved to pay', customerLabel: 'Payout in progress', tone: 'action', hint: 'Send the payout and record its reference.' },
  COMPLETED: { label: 'Completed', customerLabel: 'Paid out', tone: 'done', hint: 'Payout recorded.' },
  ON_HOLD: { label: 'On hold', customerLabel: 'Under review', tone: 'risk', hint: 'Paused by the desk.' },
  REFUND_DUE: { label: 'Refund due', customerLabel: 'Refund in progress', tone: 'risk', hint: 'Return the funds and record the refund.' },
  REFUNDED: { label: 'Refunded', customerLabel: 'Refunded', tone: 'done', hint: 'Funds returned to the customer.' },
  CANCELLED: { label: 'Cancelled', customerLabel: 'Cancelled', tone: 'done', hint: 'Closed before any money moved.' },
  EXPIRED: { label: 'Expired', customerLabel: 'Quote expired', tone: 'done', hint: 'The quote or payment window ran out.' },
};

export const OPEN_STATUSES: TradeStatus[] = ['QUOTED', 'AWAITING_FUNDS', 'FUNDS_CONFIRMED', 'APPROVED', 'ON_HOLD', 'REFUND_DUE'];

export type BeneficiaryKind = 'BANK' | 'MOMO';
export type Relationship = 'SELF' | 'FAMILY' | 'BUSINESS' | 'OTHER';

export interface Beneficiary {
  kind: BeneficiaryKind;
  provider: string;
  accountNumber: string;
  accountName: string;
  relationship: Relationship;
}

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  SELF: 'Customer’s own account',
  FAMILY: 'Family member',
  BUSINESS: 'Business / supplier',
  OTHER: 'Someone else',
};

export const GH_MOMO_PROVIDERS = ['MTN MoMo', 'Telecel Cash', 'AirtelTigo Money'];
export const NG_BANKS = [
  'Access Bank', 'Fidelity Bank', 'First Bank', 'FCMB', 'GTBank', 'Kuda', 'Moniepoint', 'OPay', 'PalmPay',
  'Polaris Bank', 'Providus Bank', 'Stanbic IBTC', 'Sterling Bank', 'UBA', 'Union Bank', 'Wema Bank', 'Zenith Bank',
];
export const GH_BANKS = ['Absa Ghana', 'Access Bank Ghana', 'CalBank', 'Ecobank Ghana', 'Fidelity Bank Ghana', 'GCB Bank', 'Stanbic Bank Ghana', 'Zenith Bank Ghana'];

export interface RailRef {
  id: string;
  label: string;
  currency: Currency;
  kind: 'BANK' | 'MOMO';
  provider: string;
  accountNumber: string;
  accountName: string;
}

export interface TradeSummary {
  id: string;
  ref: string;
  status: TradeStatus;
  version: number;
  corridor: Corridor;
  payCurrency: Currency;
  receiveCurrency: Currency;
  payMinor: number;
  receiveMinor: number;
  feeMinor: number;
  rate: string;
  quoteExpiresAt: string;
  fundsDueAt: string | null;
  customer: { id: string; ref: string; name: string; phone: string | null; kycStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED' };
  beneficiary: Beneficiary | null;
  fundsReceivedMinor: number;
  refundedMinor: number;
  evidenceCount: number;
  holdReason: string | null;
  /** Raised in a rehearsal (test) chat: excluded from Insights. */
  isTest?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SignalLevel = 'info' | 'warn' | 'critical';
export interface Signal {
  code: string;
  level: SignalLevel;
  title: string;
  detail: string;
}

export interface TimelineEvent {
  seq: number;
  action: string;
  actorType: 'USER' | 'CUSTOMER' | 'SYSTEM';
  actorLabel: string;
  data: Record<string, unknown>;
  at: string;
  hash: string;
}

export interface TradeDetail extends TradeSummary {
  referenceRate: string | null;
  quoteMode: 'PAY' | 'RECEIVE';
  acceptedAt: string | null;
  acceptedBy: string | null;
  collectionRail: RailRef | null;
  fundsConfirmedAt: string | null;
  fundsConfirmedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  paidOutAt: string | null;
  paidOutBy: string | null;
  completedAt: string | null;
  closedReason: string | null;
  statusBeforeHold: TradeStatus | null;
  note: string | null;
  createdBy: string | null;
  receipts: { id: string; amountMinor: number; currency: Currency; bankReference: string; payerName: string | null; rail: string; recordedBy: string; at: string }[];
  payouts: { id: string; kind: 'PAYOUT' | 'REFUND'; amountMinor: number; currency: Currency; reference: string; rail: string; recordedBy: string; at: string }[];
  evidence: { id: string; submittedBy: 'CUSTOMER' | 'OPERATOR'; note: string | null; fileName: string | null; mime: string | null; sizeBytes: number | null; sha256: string | null; at: string }[];
  events: TimelineEvent[];
  signals: Signal[];
  needsSecondPerson: boolean;
  portalPath: string;
  /** Set when the trade was raised from a WhatsApp/SMS conversation. */
  conversationId: string | null;
}

/** Human sentences for audit actions, used by operator timeline and customer tracker. */
export function describeEvent(e: Pick<TimelineEvent, 'action' | 'data'>): string {
  const d = e.data as Record<string, string | number | undefined>;
  switch (e.action) {
    case 'trade.quoted': return 'Quote created';
    case 'trade.requoted': return `Quote refreshed at ${d.rate}`;
    case 'trade.accepted': return d.by === 'CUSTOMER' ? 'Customer accepted the quote' : 'Accepted on the customer’s behalf';
    case 'trade.beneficiary_set': return 'Payout details saved';
    case 'trade.evidence_added': return d.submittedBy === 'CUSTOMER' ? 'Customer sent proof of payment' : 'Operator attached evidence';
    case 'trade.funds_recorded': return `Credit recorded (${d.amount})`;
    case 'trade.funds_confirmed': return 'Funds confirmed in full';
    case 'trade.approved': return 'Payout approved';
    case 'trade.paid_out': return `Payout sent (ref ${d.reference})`;
    case 'trade.completed': return 'Trade completed';
    case 'trade.held': return `Put on hold: ${d.reason}`;
    case 'trade.released': return 'Hold released';
    case 'trade.cancelled': return `Cancelled: ${d.reason}`;
    case 'trade.expired': return d.stage === 'FUNDS' ? 'Payment window expired' : 'Quote expired';
    case 'trade.refund_due': return `Marked for refund: ${d.reason}`;
    case 'trade.refunded': return `Refund sent (ref ${d.reference})`;
    case 'trade.link_reissued': return 'Customer link reissued';
    case 'trade.note': return `Note: ${d.note}`;
    default: return e.action.replace(/^[a-z]+\./, '').replace(/_/g, ' ');
  }
}
