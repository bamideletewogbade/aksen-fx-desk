export type Corridor = 'NGN_TO_GHS' | 'GHS_TO_NGN';

export type TicketStatus =
  | 'AWAITING_PAYMENT'      // Customer locked rate, waiting for bank deposit
  | 'GEV_VERIFYING'         // Slip uploaded, System 1 + System 2 analyzing
  | 'SAFE_TO_DISBURSE'      // System 1 Bayesian clear, high confidence, ready for 1-click payout
  | 'FLAGGED_RISK'          // System 1 / System 2 caught an anomaly (triangular, font, etc.)
  | 'DISBURSED';            // Paid out via MTN MoMo / Telecel

export interface GevSystem1Result {
  pixelNoiseVariance: number;      // 0 to 1 (lower is better, > 0.40 is anomaly)
  typographyDeviation: number;     // Standard deviations from bank standard font
  identityScore: number;           // 0 to 100% 3-way match
  nibssAuthenticity: number;       // 0 to 100%
  probabilityFraud: number;        // Deterministic Bayesian prior P(Fraud)
  verdict: 'PASS_FAST_PATH' | 'ANOMALY_ESCALATE' | 'BLOCK';
  flags: string[];
}

export interface GevSystem2Result {
  triggered: boolean;
  model: string;
  synthesis: string;
  recommendedAction: string;
}

export interface TradeTicket {
  id: string;                      // e.g. AKS-73912
  createdAt: string;               // e.g. "14:42"
  expiresAt: string;               // 15-min countdown target
  customerName: string;
  whatsappPhone: string;
  direction: Corridor;
  amountIn: number;                // e.g. 1500000 NGN
  amountOut: number;               // e.g. 14277.56 GHS
  rate: number;                    // 105.06
  collectionBank: {
    name: string;
    accountNumber: string;
    accountName: string;
    narration: string;
  };
  momoRecipient: {
    network: 'MTN MoMo' | 'Telecel Cash';
    phoneNumber: string;
    registeredName: string;
    resolvedStatus: 'RESOLVED_MATCH' | 'NAME_MISMATCH' | 'PENDING';
  };
  status: TicketStatus;
  receiptImage?: string;
  remitterName?: string;
  gevSystem1: GevSystem1Result;
  gevSystem2?: GevSystem2Result;
  whatsappTranscript: Array<{
    sender: 'customer' | 'bot' | 'operator';
    time: string;
    text: string;
  }>;
}

export interface BankAccountHealth {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  dailyLimit: number;
  dailyUsed: number;
  status: 'ACTIVE_ROUTING' | 'COOLING_DOWN' | 'NEAR_CAP' | 'SUSPENDED';
}

export interface FloatPool {
  currency: 'NGN' | 'GHS';
  symbol: string;
  totalBalance: number;
  availableBalance: number;
  reservedBalance: number;
  depletionAlertThreshold: number;
  topAccounts: string[];
}
