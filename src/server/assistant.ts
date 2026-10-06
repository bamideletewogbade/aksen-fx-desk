import { computeQuote, CORRIDORS, parseRate, type Corridor, type Currency } from '@/lib/money';
import { GH_BANKS, NG_BANKS, type Beneficiary, type TradeStatus } from '@/lib/trades';

/**
 * The desk's chat assistant: decides what to say next in a WhatsApp/SMS
 * conversation. Pure functions only (no database, no network) so every reply
 * can be tested.
 *
 * Ground rules:
 * - Write like a person on a desk's WhatsApp: short messages, one question at
 *   a time, the customer's name, no menus, no walls of text.
 * - Every figure comes from the desk's rate board via computeQuote. Nothing is
 *   invented, and nothing a customer says or sends ever marks money as received.
 * - When unsure twice in a row, when the customer asks for a person, sends a
 *   voice note, or sounds upset, hand over to a human and go quiet.
 */

// ---------------------------------------------------------------- types

export type Step =
  | 'IDLE'
  | 'ASK_CURRENCY'
  | 'CONFIRM_QUOTE'
  | 'ASK_NAME'
  | 'ASK_PAYOUT'
  | 'CONFIRM_LAST_PAYOUT'
  | 'CONFIRM_PAYOUT'
  | 'AWAITING_PAYMENT';

export interface Draft {
  corridor: Corridor;
  mode: 'PAY' | 'RECEIVE';
  amountMinor: number;
}

export interface PayoutDraft {
  kind?: 'BANK' | 'MOMO';
  provider?: string;
  accountNumber?: string;
  accountName?: string;
}

export interface BotState {
  step: Step;
  draft?: Draft | null;
  pending?: { amountMinor: number; wantsReceive: boolean } | null;
  /** A counter-offer we made ("the smallest we can do is ₦50,000") that a bare "yes" accepts. */
  offer?: Draft | null;
  corridorHint?: Corridor | null;
  payout?: PayoutDraft | null;
  misses?: number;
  /** New customer: we still want their full name, asked after payment instructions so it never blocks the trade. */
  askName?: boolean;
}

export interface RateFact {
  corridor: Corridor;
  rate: string;
  feeMinor: number;
  minPayMinor: number;
  maxPayMinor: number | null;
}

export interface TradeFact {
  ref: string;
  status: TradeStatus;
  corridor: Corridor;
  payCurrency: Currency;
  receiveCurrency: Currency;
  payMinor: number;
  receiveMinor: number;
  feeMinor: number;
  rate: string;
  quoteExpiresAt: string;
  fundsDueAt: string | null;
  fundsReceivedMinor: number;
  refundedMinor: number;
  beneficiary: Beneficiary | null;
  instructions: { provider: string; accountNumber: string; accountName: string } | null;
  customerEvidence: number;
  payoutReference: string | null;
}

export interface Facts {
  deskName: string;
  timezone: string;
  now: Date;
  profileName: string | null;
  /** Name on the desk's customer record, when this number is a known customer. */
  customerName: string | null;
  rates: RateFact[];
  quoteTtlMinutes: number;
  fundsWindowMinutes: number;
  trade: TradeFact | null;
  /** Payout details from this customer's last completed trade. */
  lastPayout: Beneficiary | null;
  /** True when we already wrote to this customer in the last few hours. */
  recentlyTalked: boolean;
  /** The customer's own number in E.164 (for "send it to this number"). */
  phone?: string | null;
}

export type Media = 'none' | 'image' | 'document' | 'audio' | 'video' | 'other';

export type Effect =
  | { type: 'QUOTE'; draft: Draft; customerName: string }
  | { type: 'ACCEPT'; beneficiary: Beneficiary }
  | { type: 'EVIDENCE'; note: string | null }
  | { type: 'CANCEL' }
  /** Silently drops the open quote because the customer changed the amount; the replies carry the new preview. */
  | { type: 'DROP_QUOTE' }
  /** Records the full name a new customer gave us. */
  | { type: 'NAME'; name: string };

export interface Decision {
  replies: string[];
  state: BotState;
  effect?: Effect;
  /** Reason shown to operators; the conversation switches to a person. */
  handoff?: string;
}

export const FRESH: BotState = { step: 'IDLE', draft: null, pending: null, corridorHint: null, payout: null, misses: 0 };

// ---------------------------------------------------------------- formatting

/** ₦2,000,000 · ₦2,000,000.50 · GH₵ 18,832.39 (no ".00" on whole amounts, like people write). */
export function cash(minor: number, currency: Currency): string {
  const major = minor / 100;
  const body = major.toLocaleString('en-US', { minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return currency === 'NGN' ? `₦${body}` : `GH₵ ${body}`;
}

function clock(iso: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(new Date(iso));
}

function greeting(now: Date, timezone: string): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now)) % 24;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** First name that looks like a name ("Ama" from "Ama Owusu", nothing from "God's Grace 🙏"). */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]?.replace(/[^A-Za-z'-]/g, '').replace(/'s$/i, '') ?? '';
  if (first.length < 2 || /^(god|jesus|blessed|grace|mummy|daddy|mama|papa|the|mr|mrs|miss|dr|alhaji|chief|pastor|prophet|official)$/i.test(first)) return null;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function spacedNumber(n: string) {
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

export function payoutLine(b: Pick<Beneficiary, 'provider' | 'accountNumber' | 'accountName'>): string {
  return `${b.accountName}\n${b.provider} ${spacedNumber(b.accountNumber)}`;
}

function rateLine(r: RateFact): string {
  const rate = Number(r.rate).toFixed(2);
  return r.corridor === 'NGN_GHS' ? `• Naira → Cedis: ₦${rate} = GH₵1` : `• Cedis → Naira: GH₵1 = ₦${rate}`;
}

// ---------------------------------------------------------------- understanding

export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (t: string, re: RegExp) => re.test(t);

export const isYes = (t: string) =>
  /^(y|ya|yah|yea|yeah|yes+|yep|yup|ok|okay|okey|oky|k|kk|sure|alright|aight|fine|confirm(ed)?|correct|right|go ahead|go on|proceed|lock( it)?|do it|please do|pls do|oya|sharp|na so|that'?s (right|correct|it|fine|good)|exactly|perfect|cool|let'?s (go|do (it|this|that)|proceed|lock( it)?)|deal|i agree|agreed|accept(ed)?|book it|send it|good to go|sounds good|why not|of course|definitely|absolutely)\b/.test(t) ||
  /^(👍|✅|👌|🙏|💯)/u.test(t);

/** "ok", "alright", "thanks", a thumbs-up: acknowledgements that should never count as "not understood". */
const isAck = (t: string) => t.split(' ').length <= 4 && (isYes(t) || /^(thanks|thank you|thx|noted|got it|i see|great|nice|alright then|okay then|hmm+|ehen|👌|🙏|👍)\b/u.test(t));

export const isNo = (t: string) => /^(no|nope|nah|not now|not yet|don'?t|wrong|incorrect|not correct|not right|wait)\b/.test(t);

const HUMAN = /\b(agent|human|real person|a person|someone|somebody|operator|staff|manager|customer (care|service)|call me|speak (to|with)|talk (to|with)|representative)\b/;
const COMPLAINT = /\b(scam+(er|mers)?|fraud|thie(f|ves)|police|lawyer|report you|cheat(ed|ing)?|stole|stolen|wicked|useless|nonsense|rubbish)\b/;
const STATUS = /\b(status|update|any news|where is my|where'?s my|has it (been )?(sent|paid|arrived)|have you (sent|paid|received)|did you (get|receive|send)|when will|how long|still waiting|not (yet )?received|haven'?t received|not arrived)\b/;
const RATE_Q = /\b(rate|rates|price|exchange|how much (is|are|for|do you))\b/;
const GREETING = /^(hi+|hello+|hey+|helo|hallo|good (morning|afternoon|evening|day)|morning|afternoon|evening|gm|salam|salaam|assalam\w*|yo|bro|sis|boss|chairman|chale|charley|how far|how are you|hy)\b/;
const THANKS = /\b(thanks|thank you|thank u|thx|tnx|tanx|god bless|appreciate|medaase|e se|nagode)\b/;
const CANCEL = /\b(cancel|start over|restart|never ?mind|forget (it|about it)|stop this|i'?m not interested|not interested)\b/;
const PAID = /\b(paid|i'?ve sent|i have sent|sent it|sent the money|transferred|transfer (is )?done|made (the )?(payment|transfer)|payment (is )?(done|made)|done)\b/;
const SMALL_TALK = /^(how are you|how far|how you dey|how'?s (it going|your day|business)|how (are )?things|you good|are you (a )?(bot|robot|human|real)|who (are you|is this)|what('?s| is) your name)\b/;
const HOW_LONG = /\b(how long|how fast|how quick|when will (i|they|my|it)|how soon)\b/;
const MY_NUMBER = /\b(this|my|same) (number|line|momo|phone|wallet)\b|\bto me\b|\bmyself\b/;
const RESEND = /\b(account (number|details|no)|send (me )?(the )?(account|details|acct) (again)?|where (do|should|can) i (pay|send)|bank details|which account)\b/;

const NGN_WORD = /(₦|\bngn\b|\bnaira\b|\bnaija\b)/;
const GHS_WORD = /(gh₵|gh¢|\bghs\b|\bghc\b|\bcedis?\b|\bcedi\b)/;

/** A direction stated in words ("naira to cedis", "send to Ghana", "buy naira"). */
export function parseDirection(t: string): Corridor | null {
  if (/(naira|ngn|₦).{0,25}\b(to|into|for)\b.{0,25}(cedi|ghs|gh₵|ghana|momo)/.test(t)) return 'NGN_GHS';
  if (/(cedi|ghs|gh₵|ghc).{0,25}\b(to|into|for)\b.{0,25}(naira|ngn|₦|nigeria)/.test(t)) return 'GHS_NGN';
  if (/\b(buy|need) cedis?\b|\bsell naira\b/.test(t)) return 'NGN_GHS';
  if (/\b(buy|need) naira\b|\bsell cedis?\b/.test(t)) return 'GHS_NGN';
  if (/\b(to|into|in) ghana\b|\bghana momo\b|\bto (a |my )?momo\b/.test(t)) return 'NGN_GHS';
  if (/\b(to|into|in) (nigeria|naija|lagos|abuja|kano|port harcourt)\b/.test(t)) return 'GHS_NGN';
  return null;
}

export interface ParsedAmount {
  minor: number;
  currency: Currency | null;
  wantsReceive: boolean;
}

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, mill: 1e6, million: 1e6, mn: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** "2m", "₦1.5m", "N2,000,000", "500k naira", "5000 cedis", "GHS 5k". Ignores phone and account numbers. */
export function parseAmount(raw: string): ParsedAmount | null {
  const t = norm(raw)
    .replace(/(\+?233|\+?234)\s?\d[\d\s-]{7,12}\d/g, ' ')
    .replace(/\b0\d{9}\b/g, ' ')
    .replace(/\b\d{10,}\b/g, ' ');
  const re = /(₦|ngn ?|n(?=\d)|gh₵ ?|gh¢ ?|ghs ?|ghc ?|¢)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k|thousand|million|mill|mil|mn|m|billion|bn|b)?\b\s?(naira|ngn|cedis|cedi|ghs|ghc|gh₵)?/g;
  let best: (ParsedAmount & { at: number; end: number }) | null = null;
  for (const m of t.matchAll(re)) {
    const whole = Number(m[2].replace(/,/g, ''));
    const frac = m[3] ? Number(m[3].padEnd(2, '0')) / 100 : 0;
    const major = (whole + frac) * (m[4] ? UNIT[m[4]] : 1);
    if (!Number.isFinite(major) || major < 10) continue;
    const tag = (m[1] ?? m[5] ?? '').trim();
    const currency: Currency | null = /^(₦|ngn|n|naira)$/.test(tag) ? 'NGN' : /^(gh₵|gh¢|ghs|ghc|¢|cedis?)$/.test(tag) ? 'GHS' : null;
    const candidate = { minor: Math.round(major * 100), currency, wantsReceive: false, at: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (!best || candidate.minor > best.minor) best = candidate;
  }
  if (!best) return null;
  if (!best.currency) {
    const ngn = NGN_WORD.test(t);
    const ghs = GHS_WORD.test(t);
    if (ngn !== ghs) best.currency = ngn ? 'NGN' : 'GHS';
  }
  // "receive / I need 5000 cedis", "so 5000 cedis lands", "send 5000 cedis to my mum" name the amount
  // that should ARRIVE. "How much will I get for 2m" does not: the verb has to sit right before the amount.
  const before = t.slice(Math.max(0, best.at - 30), best.at);
  const after = t.slice(best.end, best.end + 40);
  best.wantsReceive =
    /\b(receive|recieve|get|gets|need|collect)\s+(about |around |exactly |like )?$/.test(before) ||
    /^\s*(should |to |will |must )?(arrive|land|lands|reach|hit)\b/.test(after) ||
    (/\bsend\s+$/.test(before) && best.currency !== null && /^\s*\bto (my|his|her|their|him|them|mum|mom|mother|dad|father|brother|sister|wife|husband|son|daughter|family|supplier|someone)\b/.test(after));
  return { minor: best.minor, currency: best.currency, wantsReceive: best.wantsReceive };
}

/** Turns an amount (+ any stated direction) into a quote request, or says what is missing. */
export function resolveDraft(a: ParsedAmount, direction: Corridor | null, hint: Corridor | null): Draft | { needCurrency: true } {
  const dir = direction ?? hint;
  let currency = a.currency;
  if (!currency && dir) currency = a.wantsReceive ? CORRIDORS[dir].receive : CORRIDORS[dir].pay;
  if (!currency) {
    if (a.minor >= 50_000_00) currency = 'NGN';
    else return { needCurrency: true };
  }
  if (dir && (CORRIDORS[dir].pay === currency || CORRIDORS[dir].receive === currency)) {
    return { corridor: dir, mode: CORRIDORS[dir].pay === currency ? 'PAY' : 'RECEIVE', amountMinor: a.minor };
  }
  if (a.wantsReceive) return { corridor: currency === 'GHS' ? 'NGN_GHS' : 'GHS_NGN', mode: 'RECEIVE', amountMinor: a.minor };
  return { corridor: currency === 'NGN' ? 'NGN_GHS' : 'GHS_NGN', mode: 'PAY', amountMinor: a.minor };
}

// Payout details ------------------------------------------------------------

const GH_NETWORKS: [RegExp, string][] = [
  [/\bmtn\b/, 'MTN MoMo'],
  [/\b(telecel|vodafone|voda|vodacash)\b/, 'Telecel Cash'],
  [/\b(airteltigo|airtel ?tigo|airtel|tigo|at money)\b/, 'AirtelTigo Money'],
];
const NG_BANK_ALIASES: [RegExp, string][] = [
  [/\baccess\b/, 'Access Bank'], [/\bfidelity\b/, 'Fidelity Bank'], [/\bfirst ?bank\b|\bfbn\b/, 'First Bank'], [/\bfcmb\b/, 'FCMB'],
  [/\bgt ?b(ank)?\b|\bguaranty\b|\bgtco\b/, 'GTBank'], [/\bkuda\b/, 'Kuda'], [/\bmoniepoint\b/, 'Moniepoint'], [/\bopay\b/, 'OPay'],
  [/\bpalm ?pay\b/, 'PalmPay'], [/\bpolaris\b/, 'Polaris Bank'], [/\bprovidus\b/, 'Providus Bank'], [/\bstanbic\b/, 'Stanbic IBTC'],
  [/\bsterling\b/, 'Sterling Bank'], [/\buba\b|\bunited bank\b/, 'UBA'], [/\bunion\b/, 'Union Bank'], [/\bwema\b|\balat\b/, 'Wema Bank'],
  [/\bzenith\b/, 'Zenith Bank'],
];
const GH_BANK_ALIASES: [RegExp, string][] = [
  [/\babsa\b|\bbarclays\b/, 'Absa Ghana'], [/\baccess\b/, 'Access Bank Ghana'], [/\bcal ?bank\b/, 'CalBank'], [/\becobank\b/, 'Ecobank Ghana'],
  [/\bfidelity\b/, 'Fidelity Bank Ghana'], [/\bgcb\b/, 'GCB Bank'], [/\bstanbic\b/, 'Stanbic Bank Ghana'], [/\bzenith\b/, 'Zenith Bank Ghana'],
];

/** Network from a Ghana mobile prefix, so "0244123456 Ama" needs no follow-up question. */
export function networkFromNumber(n: string): string | null {
  const p = n.slice(0, 3);
  if (['024', '054', '055', '059', '025', '053'].includes(p)) return 'MTN MoMo';
  if (['020', '050'].includes(p)) return 'Telecel Cash';
  if (['026', '056', '027', '057'].includes(p)) return 'AirtelTigo Money';
  return null;
}

const FILLER = new Set(
  'momo mobile money cash number num no acct acc account name names is its it the to for send pay please pls kindly bank ghana nigeria nigerian ghanaian and my his her their in on at of with via wallet details receiver recipient beneficiary use this that here network registered under called sorry wait ok okay hello hi thanks sir madam boss bro sis yes'.split(' '),
);

export function parsePayout(text: string, currency: Currency, prev: PayoutDraft = {}): PayoutDraft {
  const t = norm(text);
  const out: PayoutDraft = { ...prev };
  let providerWords: RegExp | null = null;

  if (currency === 'GHS') {
    for (const [re, name] of GH_NETWORKS) if (re.test(t)) { out.provider = name; out.kind = 'MOMO'; providerWords = re; break; }
    if (!providerWords) for (const [re, name] of GH_BANK_ALIASES) if (re.test(t)) { out.provider = name; out.kind = 'BANK'; providerWords = re; break; }
  } else {
    for (const [re, name] of NG_BANK_ALIASES) if (re.test(t)) { out.provider = name; out.kind = 'BANK'; providerWords = re; break; }
  }

  const digitRun = t.match(/(\+?\d[\d\s-]{6,18}\d)/);
  if (digitRun) {
    let d = digitRun[1].replace(/\D/g, '');
    if (currency === 'GHS' && d.startsWith('233') && d.length === 12) d = `0${d.slice(3)}`;
    out.accountNumber = d;
    if (currency === 'GHS' && /^0[235]\d{8}$/.test(d) && out.kind !== 'BANK') {
      out.kind = 'MOMO';
      if (!out.provider) out.provider = networkFromNumber(d) ?? undefined;
    }
  }
  if (currency === 'NGN') out.kind = 'BANK';

  let rest = t.replace(/(\+?\d[\d\s-]{6,18}\d)/g, ' ');
  if (providerWords) rest = rest.replace(providerWords, ' ');
  for (const [re] of [...GH_NETWORKS, ...NG_BANK_ALIASES, ...GH_BANK_ALIASES]) rest = rest.replace(re, ' ');
  const words = rest
    .replace(/[^a-z' -]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !FILLER.has(w));
  const name = words.join(' ').trim();
  if (name.replace(/[^a-z]/g, '').length >= 3 && !isYes(name) && !isNo(name)) out.accountName = titleCase(name);
  return out;
}

/** What still needs asking before the payout details are complete, or null. */
function payoutGap(p: PayoutDraft, currency: Currency): string | null {
  if (!p.accountNumber) return currency === 'GHS' ? 'What’s the MoMo number?' : 'What’s the 10-digit account number?';
  if (currency === 'GHS' && p.kind === 'MOMO' && !/^0[235]\d{8}$/.test(p.accountNumber)) return 'That number doesn’t look right. Ghana MoMo numbers have 10 digits, like 0244123456. Can you check it?';
  if (currency === 'NGN' && !/^\d{10}$/.test(p.accountNumber)) return 'Nigerian account numbers have 10 digits. Can you check it and send it again?';
  if (!p.provider) return currency === 'GHS' ? 'Which network is that: MTN, Telecel or AirtelTigo?' : 'Which bank is that account with?';
  if (!p.accountName) return `And the name on the ${p.kind === 'MOMO' ? 'MoMo' : 'account'}?`;
  return null;
}

function looksLikeName(t: string): string | null {
  const cleaned = t.replace(/^(my name is|i am|i'm|it'?s|name:?|this is)\s+/i, '').replace(/[^A-Za-z' .-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3 || cleaned.split(' ').length > 6) return null;
  if (isYes(norm(cleaned)) || isNo(norm(cleaned))) return null;
  return titleCase(cleaned);
}

function relationshipFor(customerName: string | null, accountName: string): Beneficiary['relationship'] {
  if (!customerName) return 'OTHER';
  const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 3));
  const a = tokens(customerName);
  for (const x of tokens(accountName)) if (a.has(x)) return 'SELF';
  return 'OTHER';
}

function payoutFitsCurrency(b: Beneficiary, currency: Currency): boolean {
  if (currency === 'GHS') return b.kind === 'MOMO' || GH_BANKS.includes(b.provider);
  return b.kind === 'BANK' && NG_BANKS.includes(b.provider);
}

// ---------------------------------------------------------------- copy

function ratesText(f: Facts): string | null {
  const active = f.rates.filter((r) => r.corridor === 'NGN_GHS' || r.corridor === 'GHS_NGN');
  if (!active.length) return null;
  return `Today’s rates:\n${active.map(rateLine).join('\n')}`;
}

function hello(f: Facts): string {
  const known = firstName(f.customerName);
  if (known) return `${greeting(f.now, f.timezone)} ${known} 👋 Welcome back to ${f.deskName}.`;
  const name = firstName(f.profileName);
  return `${greeting(f.now, f.timezone)}${name ? ` ${name}` : ''} 👋 You’re chatting with ${f.deskName}.`;
}

function previewText(d: Draft, r: RateFact): string {
  const { pay, receive } = CORRIDORS[d.corridor];
  const q = computeQuote({ corridor: d.corridor, mode: d.mode, amountMinor: d.amountMinor, rate: parseRate(r.rate), feeMinor: r.feeMinor });
  const rate = `₦${Number(r.rate).toFixed(2)} = GH₵1`;
  const fee = q.feeMinor > 0 ? `\n(That includes our ${cash(q.feeMinor, pay)} fee.)` : '';
  const line =
    d.mode === 'PAY'
      ? `${cash(q.payMinor, pay)} comes to *${cash(q.receiveMinor, receive)}* at ${rate}.`
      : `For *${cash(q.receiveMinor, receive)}* to arrive, you’d send *${cash(q.payMinor, pay)}* (rate ${rate}).`;
  return `${line}${fee}`;
}

function payoutQuestion(currency: Currency): string {
  return currency === 'GHS'
    ? 'Where should we send the cedis? Send the MoMo number and the name on it, e.g. _MTN 0244123456 Ama Owusu_. A bank account works too.'
    : 'Which Nigerian account should receive the naira? Send the bank, account number and account name, e.g. _GTBank 0123456789 Ama Owusu_.';
}

export function paymentInstructions(t: TradeFact, f: Pick<Facts, 'timezone'>): string[] {
  if (!t.instructions) return [`Your trade ${t.ref} is confirmed. The team will send you the payment details here shortly.`];
  return [
    `Perfect. Please send *exactly ${cash(t.payMinor, t.payCurrency)}* to this account:`,
    `${t.instructions.provider}\n${t.instructions.accountNumber}\n${t.instructions.accountName}`,
    `Use *${t.ref}* as the narration/remark.${t.fundsDueAt ? ` Please pay by ${clock(t.fundsDueAt, f.timezone)}.` : ''}\nOnce you’ve paid, send the receipt screenshot here 📎`,
  ];
}

export function statusText(t: TradeFact, f: Pick<Facts, 'timezone'>): string {
  const pay = cash(t.payMinor, t.payCurrency);
  const receive = cash(t.receiveMinor, t.receiveCurrency);
  switch (t.status) {
    case 'QUOTED':
      return `${t.ref}: your rate is held until ${clock(t.quoteExpiresAt, f.timezone)}. I just need the payout details to continue.`;
    case 'AWAITING_FUNDS':
      return t.customerEvidence > 0
        ? `We have your receipt for ${t.ref} and we’re checking our account. I’ll message you the moment the money lands.`
        : `We’re waiting for your ${pay} for ${t.ref}${t.fundsDueAt ? ` (please pay by ${clock(t.fundsDueAt, f.timezone)})` : ''}. Send the receipt here once you’ve paid.`;
    case 'FUNDS_CONFIRMED':
    case 'APPROVED':
      return `Your payment for ${t.ref} has arrived ✅ Your ${receive} payout is being processed now.`;
    case 'ON_HOLD':
      return `${t.ref} is with the team for a quick check. Someone will message you here shortly.`;
    case 'COMPLETED':
      return `${t.ref} has been paid out${t.payoutReference ? ` (ref ${t.payoutReference})` : ''}. Anything else I can help with?`;
    case 'REFUND_DUE':
      return `Your refund for ${t.ref} is being processed. The team will confirm here once it’s sent.`;
    case 'REFUNDED':
      return `Your refund for ${t.ref} has been sent.`;
    case 'CANCELLED':
      return `${t.ref} was cancelled. Tell me an amount whenever you want to start a new one.`;
    case 'EXPIRED':
      return `${t.ref} expired before it was completed. Tell me an amount and I’ll give you a fresh rate.`;
  }
}

/** Customer-facing message for a change the desk made in the trade room, or null for none. */
export function tradeUpdateText(
  action: string,
  t: TradeFact,
  f: Pick<Facts, 'timezone' | 'deskName'>,
  extra: { receivedMinor?: number; shortfallMinor?: number; refundMinor?: number; reference?: string } = {},
): string[] {
  const pay = cash(t.payMinor, t.payCurrency);
  const receive = cash(t.receiveMinor, t.receiveCurrency);
  const to = t.beneficiary ? ` to ${t.beneficiary.accountName}` : '';
  switch (action) {
    case 'accept':
      return paymentInstructions(t, f);
    case 'requote':
      return [`Fresh rate for ${t.ref}: ${pay} → *${receive}*. Held until ${clock(t.quoteExpiresAt, f.timezone)}.`];
    case 'record_funds':
      if (extra.shortfallMinor && extra.shortfallMinor > 0) {
        return [`We’ve received ${cash(extra.receivedMinor ?? t.fundsReceivedMinor, t.payCurrency)} so far for ${t.ref}. ${cash(extra.shortfallMinor, t.payCurrency)} is still outstanding. Please send the balance with the same narration (${t.ref}).`];
      }
      if (t.status === 'FUNDS_CONFIRMED') return [`Your ${pay} has arrived ✅ We’re sending ${receive}${to} now.`];
      return [];
    case 'record_payout':
      return [
        `Done ✅ ${receive} has been sent${t.beneficiary ? ` to:\n${payoutLine(t.beneficiary)}` : '.'}${t.payoutReference ? `\nRef: ${t.payoutReference}` : ''}`,
        `Thank you for trading with ${f.deskName} 🙏`,
      ];
    case 'hold':
      return [`Quick heads-up: ${t.ref} is with our team for a routine check before payout. Someone will message you here shortly.`];
    case 'release':
      return [t.status === 'AWAITING_FUNDS' ? `All clear on ${t.ref}. We’re ready for your payment.` : `All clear on ${t.ref}. We’re continuing with your payout.`];
    case 'cancel':
      return [`${t.ref} has been cancelled. Message us anytime to start a new trade.`];
    case 'refund_due':
      return [`We’ll be returning your ${cash(t.fundsReceivedMinor - t.refundedMinor, t.payCurrency)} for ${t.ref}. The team will confirm here once it’s sent.`];
    case 'record_refund':
      return [`Your refund of ${cash(extra.refundMinor ?? 0, t.payCurrency)} for ${t.ref} has been sent${extra.reference ? `. Ref: ${extra.reference}` : ''}.`];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- decide

const TRADE_STEPS: Step[] = ['ASK_PAYOUT', 'CONFIRM_LAST_PAYOUT', 'CONFIRM_PAYOUT', 'AWAITING_PAYMENT'];

function handoff(state: BotState, reason: string, reply: string): Decision {
  return { replies: [reply], state: { ...state, misses: 0 }, handoff: reason };
}

/** Handoff reason when the assistant couldn't follow the customer (see src/server/ai/assist.ts). */
export const NOT_UNDERSTOOD = 'The assistant didn’t understand twice in a row';

/** Second miss in a row goes to a person; the first gets a gentle re-ask. */
function miss(state: BotState, f: Facts, reask: string): Decision {
  const misses = (state.misses ?? 0) + 1;
  if (misses >= 2) {
    return handoff(state, NOT_UNDERSTOOD, `Let me get someone from the ${f.deskName} team to help. They’ll reply right here shortly.`);
  }
  return { replies: [reask], state: { ...state, misses } };
}

function rateFor(f: Facts, corridor: Corridor) {
  return f.rates.find((r) => r.corridor === corridor) ?? null;
}

/** Quote preview for a draft, with limit checks. */
function preview(state: BotState, f: Facts, d: Draft, lead: string[] = []): Decision {
  const r = rateFor(f, d.corridor);
  const { pay, label } = CORRIDORS[d.corridor];
  if (!r) {
    return handoff(state, `No active ${label} rate on the board`, `We’re not quoting ${label.toLowerCase()} right now. Let me get someone from the team for you.`);
  }
  let q;
  try {
    q = computeQuote({ corridor: d.corridor, mode: d.mode, amountMinor: d.amountMinor, rate: parseRate(r.rate), feeMinor: r.feeMinor });
  } catch {
    return { replies: [...lead, 'That amount is too small for us to convert. Could you send a bigger amount?'], state: { ...state, misses: 0 } };
  }
  if (q.payMinor < r.minPayMinor) {
    return {
      replies: [...lead, `The smallest we can do on ${label} is ${cash(r.minPayMinor, pay)}. Would you like to do that or more?`],
      state: { ...state, step: 'IDLE', corridorHint: d.corridor, offer: { corridor: d.corridor, mode: 'PAY', amountMinor: r.minPayMinor }, misses: 0 },
    };
  }
  if (r.maxPayMinor !== null && q.payMinor > r.maxPayMinor) {
    return handoff({ ...state, draft: d }, `Asked for more than the board maximum (${cash(q.payMinor, pay)})`, `${cash(q.payMinor, pay)} is above what I can quote here, so I’m passing you to someone on the team. They’ll reply shortly.`);
  }
  return {
    replies: [...lead, previewText(d, r), `Shall I lock this rate for you? It holds for ${f.quoteTtlMinutes} minutes.`],
    state: { ...state, step: 'CONFIRM_QUOTE', draft: d, pending: null, offer: null, corridorHint: d.corridor, misses: 0 },
  };
}

/** WhatsApp profile name as a stand-in until the customer tells us their full name. */
function provisionalName(f: Facts): string {
  const p = f.profileName?.replace(/[^\p{L}' .-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return p && p.replace(/[^\p{L}]/gu, '').length >= 2 ? titleCase(p) : 'WhatsApp customer';
}

/**
 * Locks the rate straight away. A new customer's full name is asked for after
 * the payment details (when it helps match their transfer), never before.
 */
function lock(state: BotState, f: Facts): Decision {
  return {
    replies: [],
    state: { ...state, misses: 0, askName: !f.customerName },
    effect: { type: 'QUOTE', draft: state.draft!, customerName: f.customerName ?? provisionalName(f) },
  };
}

/** "Send it to this number": the customer's own WhatsApp number as a Ghana MoMo wallet. */
function ownMomo(f: Facts): PayoutDraft | null {
  const d = (f.phone ?? '').replace(/\D/g, '');
  const local = d.startsWith('233') && d.length === 12 ? `0${d.slice(3)}` : null;
  if (!local || !/^0[235]\d{8}$/.test(local)) return null;
  return { kind: 'MOMO', accountNumber: local, provider: networkFromNumber(local) ?? undefined, accountName: f.customerName ?? undefined };
}

/** Payout pieces a customer already put in their first message ("2m to MTN 0244123456"). Names are not guessed. */
function payoutHint(text: string, f: Facts, currency: Currency): PayoutDraft | null {
  if (currency === 'GHS' && has(norm(text), MY_NUMBER)) return ownMomo(f);
  const p = parsePayout(text, currency);
  return p.accountNumber ? { kind: p.kind, provider: p.provider, accountNumber: p.accountNumber } : null;
}

function confirmPayoutText(t: Pick<TradeFact, 'receiveMinor' | 'receiveCurrency'>, p: PayoutDraft, lead = 'Just to confirm, we’ll send'): string {
  return `${lead} *${cash(t.receiveMinor, t.receiveCurrency)}* to:\n${payoutLine(p as Required<PayoutDraft>)}\n\nIs that correct?`;
}

function greet(state: BotState, f: Facts, ask = 'How much would you like to change today?'): Decision {
  const rates = ratesText(f);
  if (!rates) return handoff(state, 'No active rates on the board', `${hello(f)}\nOur rates aren’t up yet. Let me get someone from the team to help you.`);
  return { replies: [hello(f), `${rates}\n\n${ask}`], state: { ...FRESH } };
}

export function decide(input: { text: string; media: Media; state: BotState | null | undefined; facts: Facts }): Decision {
  const f = input.facts;
  let state: BotState = { ...FRESH, ...(input.state ?? {}) };
  const t = norm(input.text ?? '');
  const trade = f.trade;
  const lead: string[] = [];

  // 0. Keep the conversation in step with the trade the desk may have moved.
  if (TRADE_STEPS.includes(state.step) && (!trade || ['EXPIRED', 'CANCELLED', 'COMPLETED', 'REFUNDED'].includes(trade.status))) {
    if (trade?.status === 'EXPIRED') lead.push(`That rate for ${trade.ref} has expired, so I’ve closed it. Rates move, so I’ll give you a fresh one.`);
    state = { ...FRESH };
  }

  // 1. Media.
  if (input.media === 'audio' || input.media === 'video') {
    return handoff(state, 'Customer sent a voice note or video', `I can’t play ${input.media === 'audio' ? 'voice notes' : 'videos'}, so I’ve passed this to someone on the team. They’ll reply here shortly. You can also type it out for me.`);
  }
  if (input.media === 'image' || input.media === 'document') {
    if (trade && ['AWAITING_FUNDS', 'ON_HOLD'].includes(trade.status)) {
      return { replies: [], state: { ...state, step: 'AWAITING_PAYMENT', misses: 0 }, effect: { type: 'EVIDENCE', note: input.text?.trim() || null } };
    }
    return handoff(state, 'Customer sent a file with no trade waiting for payment', 'Thanks, I’ve passed this to the team. Someone will look at it and reply here shortly.');
  }
  if (input.media === 'other' && !t) return { replies: [], state };
  if (!t) return { replies: [], state };

  // 2. Things a customer can say at any point.
  if (has(t, COMPLAINT)) return handoff(state, 'Customer may be upset or raising a complaint', `I’m sorry about this. I’m bringing in someone from the ${f.deskName} team right now. They’ll reply here.`);
  if (has(t, HUMAN)) return handoff(state, 'Customer asked for a person', `Sure. I’m getting someone from the ${f.deskName} team for you. They’ll reply right here shortly.`);

  if (has(t, CANCEL)) {
    if (trade && ['QUOTED', 'AWAITING_FUNDS'].includes(trade.status) && trade.fundsReceivedMinor === 0 && TRADE_STEPS.includes(state.step)) {
      return { replies: [], state: { ...FRESH }, effect: { type: 'CANCEL' } };
    }
    return { replies: [state.step === 'IDLE' ? 'No problem. Message me whenever you’re ready.' : 'No problem, I’ve dropped that. Tell me an amount whenever you’re ready.'], state: { ...FRESH } };
  }

  if (has(t, STATUS) && !parseAmount(t)) {
    if (!trade && has(t, HOW_LONG)) {
      return { replies: [...lead, 'As soon as your payment lands in our account we send the payout, usually within minutes. How much would you like to change?'], state: { ...state, misses: 0 } };
    }
    if (!trade) {
      return handoff(state, 'Customer is asking about a payment, but no trade is linked to this chat', 'Let me check that for you. I’m passing this to someone on the team who can see all payments. They’ll reply here shortly.');
    }
    const d: Decision = { replies: [...lead, statusText(trade, f)], state: { ...state, misses: 0 } };
    if (trade.status === 'ON_HOLD') d.handoff = 'Customer asking about a trade on hold';
    return d;
  }

  if (has(t, THANKS) && t.split(' ').length <= 6 && !parseAmount(t)) {
    return { replies: [state.step === 'IDLE' ? 'You’re welcome 🙏 Message me anytime you want to change money.' : 'You’re welcome 🙏'], state };
  }

  // "Yes" to a counter-offer we just made takes it, e.g. the corridor minimum.
  if (state.step === 'IDLE' && state.offer && isYes(t) && !parseAmount(t)) return preview({ ...state, offer: null }, f, state.offer, lead);
  if (state.step === 'IDLE' && state.offer && isNo(t)) {
    return { replies: ['No problem. Tell me another amount whenever you’re ready.'], state: { ...state, offer: null, misses: 0 } };
  }

  // A bare "ok" / "👍" when nothing is pending needs no answer, just as a person wouldn't send one.
  if (isAck(t) && !lead.length && ((state.step === 'IDLE' && f.recentlyTalked) || (state.step === 'AWAITING_PAYMENT' && !state.askName))) return { replies: [], state };

  if (has(t, SMALL_TALK) && !parseAmount(t)) {
    const bot = /\b(bot|robot|human|real|who|name)\b/.test(t);
    const reply = bot
      ? `I’m ${f.deskName}’s assistant. I can give you a rate and set up your trade, and someone from the team is always one message away (just say *agent*).`
      : 'I’m doing well, thank you for asking 🙏';
    const next = state.step === 'IDLE' ? 'How much would you like to change today?' : null;
    return { replies: [...lead, next ? `${reply} ${next}` : reply], state: { ...state, misses: 0 } };
  }

  // 3. Where we are in the conversation.
  switch (state.step) {
    case 'IDLE':
    case 'ASK_CURRENCY': {
      if (state.step === 'ASK_CURRENCY' && state.pending) {
        const cur: Currency | null = NGN_WORD.test(t) || /^n$/.test(t) ? 'NGN' : GHS_WORD.test(t) || /^(c|gh)$/.test(t) ? 'GHS' : null;
        if (cur) {
          const d = resolveDraft({ minor: state.pending.amountMinor, currency: cur, wantsReceive: state.pending.wantsReceive }, parseDirection(t), state.corridorHint ?? null);
          if (!('needCurrency' in d)) return preview(state, f, d, lead);
        }
      }
      const amount = parseAmount(t);
      const direction = parseDirection(t);
      if (amount) {
        const d = resolveDraft(amount, direction, state.corridorHint ?? null);
        if ('needCurrency' in d) {
          const n = (amount.minor / 100).toLocaleString('en-US');
          return { replies: [...lead, `Is that ${n} naira or cedis?`], state: { ...state, step: 'ASK_CURRENCY', pending: { amountMinor: amount.minor, wantsReceive: amount.wantsReceive }, misses: 0 } };
        }
        const intro = !f.recentlyTalked && has(t, GREETING) ? [hello(f)] : [];
        return preview({ ...state, payout: payoutHint(input.text, f, CORRIDORS[d.corridor].receive) }, f, d, [...lead, ...intro]);
      }
      if (direction) {
        const { pay, receive } = CORRIDORS[direction];
        const word = (c: Currency) => (c === 'NGN' ? 'naira' : 'cedis');
        const intro = !f.recentlyTalked ? [hello(f)] : [];
        const r = rateFor(f, direction);
        return {
          replies: [...lead, ...intro, `Sure${r ? `, today’s rate is ${rateLine(r).slice(2)}` : ''}. How much ${word(pay)} are you changing? (Or tell me how many ${word(receive)} should arrive.)`],
          state: { ...state, step: 'IDLE', corridorHint: direction, misses: 0 },
        };
      }
      if (has(t, RATE_Q)) {
        const rates = ratesText(f);
        if (!rates) return handoff(state, 'No active rates on the board', 'Our rates aren’t up yet. Let me get someone from the team to help you.');
        const intro = !f.recentlyTalked ? [hello(f)] : [];
        return { replies: [...lead, ...intro, `${rates}\n\nHow much would you like to change?`], state: { ...state, misses: 0 } };
      }
      if (has(t, GREETING) || !f.recentlyTalked) {
        const g = greet(state, f);
        return { ...g, replies: [...lead, ...g.replies] };
      }
      if (lead.length) return { replies: [...lead, 'How much would you like to change?'], state };
      return miss(state, f, 'Tell me how much you’d like to change, e.g. _₦2m to cedis_ or _GH₵ 5,000 to naira_.');
    }

    case 'CONFIRM_QUOTE': {
      const amount = parseAmount(t);
      if (amount && !isYes(t)) {
        const d = resolveDraft(amount, parseDirection(t), state.draft?.corridor ?? null);
        if (!('needCurrency' in d)) return preview(state, f, d);
      }
      if (isYes(t)) return lock(state, f);
      if (isNo(t)) return { replies: ['No problem. Just tell me another amount whenever you’re ready.'], state: { ...FRESH, corridorHint: state.draft?.corridor ?? null } };
      const r = state.draft ? rateFor(f, state.draft.corridor) : null;
      return miss(state, f, state.draft && r ? `${previewText(state.draft, r)}\nShall I lock it? Reply *yes* or *no*.` : 'Shall I lock the rate? Reply *yes* or *no*.');
    }

    case 'ASK_NAME': {
      if (isNo(t)) return { replies: ['No problem. Tell me an amount whenever you’re ready.'], state: { ...FRESH } };
      const name = looksLikeName(input.text);
      if (name && state.draft) return { replies: [], state: { ...state, misses: 0 }, effect: { type: 'QUOTE', draft: state.draft, customerName: name } };
      return miss(state, f, 'Sorry, I just need your full name, e.g. _Ama Owusu_.');
    }

    case 'CONFIRM_LAST_PAYOUT': {
      if (isYes(t) && f.lastPayout && trade) {
        return { replies: [], state: { ...state, misses: 0 }, effect: { type: 'ACCEPT', beneficiary: { ...f.lastPayout, relationship: relationshipFor(f.customerName, f.lastPayout.accountName) } } };
      }
      if (isNo(t)) return { replies: [trade ? payoutQuestion(trade.receiveCurrency) : 'Okay, send the new details.'], state: { ...state, step: 'ASK_PAYOUT', payout: null, misses: 0 } };
      // Anything else: treat it as new details.
      state = { ...state, step: 'ASK_PAYOUT', payout: null };
    }
    // falls through
    case 'ASK_PAYOUT': {
      if (!trade) return { replies: ['Tell me how much you’d like to change.'], state: { ...FRESH } };
      // "Actually make it 3m": re-quote instead of reading the amount as a name.
      const amount = t.replace(/\D/g, '').length < 8 ? parseAmount(t) : null;
      if (amount && trade.status === 'QUOTED') {
        const d = resolveDraft(amount, parseDirection(t), trade.corridor);
        if (!('needCurrency' in d)) {
          const next = preview({ ...state, payout: null }, f, d, ['No problem, let’s redo it with the new amount.']);
          return { ...next, effect: { type: 'DROP_QUOTE' } };
        }
      }
      const gapNow = payoutGap(state.payout ?? {}, trade.receiveCurrency) ?? payoutQuestion(trade.receiveCurrency);
      if (isAck(t)) return { replies: [gapNow], state };
      let p = parsePayout(input.text, trade.receiveCurrency, state.payout ?? {});
      if (trade.receiveCurrency === 'GHS' && has(t, MY_NUMBER)) {
        const own = ownMomo(f);
        if (own) p = { ...p, ...own, accountName: p.accountName ?? own.accountName };
      }
      if (JSON.stringify(p) === JSON.stringify(state.payout ?? {})) return miss({ ...state, payout: p }, f, gapNow);
      const gap = payoutGap(p, trade.receiveCurrency);
      if (gap) return { replies: [gap], state: { ...state, step: 'ASK_PAYOUT', payout: p, misses: 0 } };
      return { replies: [confirmPayoutText(trade, p)], state: { ...state, step: 'CONFIRM_PAYOUT', payout: p, misses: 0 } };
    }

    case 'CONFIRM_PAYOUT': {
      if (!trade || !state.payout) return { replies: ['Tell me how much you’d like to change.'], state: { ...FRESH } };
      if (isYes(t)) {
        const p = state.payout as Required<PayoutDraft>;
        return {
          replies: [],
          state: { ...state, misses: 0 },
          effect: { type: 'ACCEPT', beneficiary: { kind: p.kind, provider: p.provider, accountNumber: p.accountNumber, accountName: p.accountName, relationship: relationshipFor(f.customerName, p.accountName) } },
        };
      }
      if (isNo(t)) return { replies: ['Okay, send me the correct details.'], state: { ...state, step: 'ASK_PAYOUT', payout: null, misses: 0 } };
      // A correction sent instead of yes/no ("the name is Kofi Mensah").
      const p = parsePayout(input.text, trade.receiveCurrency, state.payout);
      if (JSON.stringify(p) !== JSON.stringify(state.payout) && !payoutGap(p, trade.receiveCurrency)) {
        return {
          replies: [`Got it. So we’ll send *${cash(trade.receiveMinor, trade.receiveCurrency)}* to:\n${payoutLine(p as Required<PayoutDraft>)}\n\nIs that correct?`],
          state: { ...state, payout: p, misses: 0 },
        };
      }
      return miss(state, f, 'Are those payout details correct? Reply *yes* or *no*.');
    }

    case 'AWAITING_PAYMENT': {
      if (!trade) return { replies: ['Tell me how much you’d like to change.'], state: { ...FRESH } };
      if (has(t, RESEND) && trade.status === 'AWAITING_FUNDS') return { replies: paymentInstructions(trade, f), state: { ...state, misses: 0 } };
      if (state.askName && !has(t, PAID) && !isAck(t)) {
        const name = looksLikeName(input.text);
        if (name) return { replies: [], state: { ...state, askName: false, misses: 0 }, effect: { type: 'NAME', name } };
      }
      if (isAck(t)) return { replies: [], state };
      if (parseAmount(t) && trade.status === 'AWAITING_FUNDS') {
        return { replies: [`You still have *${trade.ref}* open for ${cash(trade.payMinor, trade.payCurrency)}. Reply *cancel* to drop it, then tell me the new amount.`], state: { ...state, misses: 0 } };
      }
      if (has(t, PAID)) {
        return {
          replies: [trade.customerEvidence > 0 ? 'Thank you 🙏 We have your receipt and we’re checking our account now.' : 'Thank you 🙏 Please send the receipt screenshot here so we can match your payment quickly.'],
          state: { ...state, misses: 0 },
        };
      }
      if (trade.status !== 'AWAITING_FUNDS') return { replies: [statusText(trade, f)], state: { ...state, misses: 0 } };
      return miss(state, f, `Once you’ve paid ${cash(trade.payMinor, trade.payCurrency)} with narration ${trade.ref}, send the receipt here. Need a person? Just say *agent*.`);
    }
  }
}

// ---------------------------------------------------------------- after an effect succeeds

/** Messages after a quote was created from the chat. */
export function afterQuote(t: TradeFact, f: Facts, state: BotState): Decision {
  const lockLine = `Done, rate locked ✅\nRef: *${t.ref}*\n${cash(t.payMinor, t.payCurrency)} → ${cash(t.receiveMinor, t.receiveCurrency)}\nHeld until ${clock(t.quoteExpiresAt, f.timezone)}.`;
  // Payout details already given in the first message: go straight to what is missing, or to confirmation.
  if (state.payout?.accountNumber) {
    const gap = payoutGap(state.payout, t.receiveCurrency);
    return gap
      ? { replies: [lockLine, gap], state: { ...state, step: 'ASK_PAYOUT', misses: 0 } }
      : { replies: [lockLine, confirmPayoutText(t, state.payout, 'We’ll send')], state: { ...state, step: 'CONFIRM_PAYOUT', misses: 0 } };
  }
  if (f.lastPayout && payoutFitsCurrency(f.lastPayout, t.receiveCurrency)) {
    return {
      replies: [lockLine, `Should we send it to the same account as last time?\n${payoutLine(f.lastPayout)}\n\nReply *yes*, or send new details.`],
      state: { ...state, step: 'CONFIRM_LAST_PAYOUT', payout: null, misses: 0 },
    };
  }
  return { replies: [lockLine, payoutQuestion(t.receiveCurrency)], state: { ...state, step: 'ASK_PAYOUT', payout: null, misses: 0 } };
}

export function afterAccept(t: TradeFact, f: Facts, state: BotState): Decision {
  const replies = paymentInstructions(t, f);
  if (state.askName) replies.push('One more thing: what’s your full name, as on the account you’re paying from? It helps us match your transfer quickly.');
  return { replies, state: { ...state, step: 'AWAITING_PAYMENT', payout: null, draft: null, misses: 0 } };
}

export function afterName(name: string): string[] {
  return [`Thank you, ${firstName(name) ?? name} 🙏 Send the receipt here once you’ve paid.`];
}

export function afterEvidence(t: TradeFact): string[] {
  return [`Received, thank you 🙏 We’re checking our account for your ${cash(t.payMinor, t.payCurrency)} now. I’ll message you the moment it lands.`];
}

export function afterCancel(ref: string): string[] {
  return [`Okay, I’ve cancelled ${ref}. If you already sent any money, tell me right away so the team can sort it out.`];
}

/**
 * When the trade engine refuses an effect. Customer-correctable problems get
 * a re-ask; anything else goes to a person.
 */
export function afterEffectError(effect: Effect, err: { code: string; message: string }, state: BotState, f: Facts): Decision {
  if (effect.type === 'ACCEPT' && err.code === 'INVALID') {
    return { replies: [`${err.message} Please send the details again.`], state: { ...state, step: 'ASK_PAYOUT', payout: null } };
  }
  if (effect.type === 'QUOTE' && err.code === 'INVALID') {
    return { replies: [`${err.message} What amount would you like instead?`], state: { ...FRESH, corridorHint: effect.draft.corridor } };
  }
  if (err.code === 'EXPIRED') {
    return { replies: ['That rate has just expired. Tell me the amount again and I’ll give you a fresh one.'], state: { ...FRESH } };
  }
  return handoff(state, `The assistant hit a problem: ${err.message}`, `Something on our side needs a person to look at it. I’ve passed this to the ${f.deskName} team and they’ll reply here shortly.`);
}
