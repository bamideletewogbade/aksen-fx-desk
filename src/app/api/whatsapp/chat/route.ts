import { NextResponse } from 'next/server';
import { chatComplete, ChatMessage } from '@/lib/openrouter';
import { TradeTicket } from '@/types/desk';

interface ChatTurn {
  sender: 'customer' | 'bot';
  time: string;
  text: string;
  image?: string;
}

interface TradeState {
  stage: 'INIT' | 'GREETING' | 'QUOTE_OFFERED' | 'LOCKED_AWAITING_PAYMENT' | 'PAYMENT_SUBMITTED' | 'DISBURSED';
  corridor: 'NGN_TO_GHS' | 'GHS_TO_NGN';
  amountIn: number;
  amountOut: number;
  rate: number;
  ticketId: string | null;
  customerName: string;
  customerPhone: string;
  momoRecipient: {
    network: 'MTN MoMo' | 'Telecel Cash';
    phoneNumber: string;
    registeredName: string;
  };
  collectionBank: {
    name: string;
    accountNumber: string;
    accountName: string;
  };
}

const DEFAULT_RATE = 105.06;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages = [], currentState, tradeState, message, action } = body as {
      messages?: ChatTurn[];
      currentState?: Partial<TradeState>;
      tradeState?: Partial<TradeState>;
      message?: string;
      action?: 'RESET' | 'SIMULATE_PAYMENT';
    };

    const inputState = currentState || tradeState;

    const state: TradeState = {
      stage: inputState?.stage || 'INIT',
      corridor: inputState?.corridor || 'NGN_TO_GHS',
      amountIn: inputState?.amountIn || 1500000,
      amountOut: inputState?.amountOut || parseFloat((1500000 / DEFAULT_RATE).toFixed(2)),
      rate: inputState?.rate || DEFAULT_RATE,
      ticketId: inputState?.ticketId || null,
      customerName: inputState?.customerName || 'Alhaji Bello',
      customerPhone: inputState?.customerPhone || '+234 803 492 8810',
      momoRecipient: inputState?.momoRecipient || {
        network: 'MTN MoMo',
        phoneNumber: '0245719646',
        registeredName: 'BELLO IBRAHIM KANO',
      },
      collectionBank: inputState?.collectionBank || {
        name: 'GTBank Nigeria',
        accountNumber: '0123984752',
        accountName: 'Aksen Liquidity Services Ltd',
      },
    };

    const latestCustomerMsg = [...messages].reverse().find((m) => m.sender === 'customer');
    const userText = (message || latestCustomerMsg?.text || '').trim();
    const userLower = userText.toLowerCase();

    let reply = '';
    let createdTicket: TradeTicket | null = null;

    // Helper to extract trade volume cleanly from natural language
    const extractAmount = (text: string): number | null => {
      const sanitized = text.replace(/\b0\d{9}\b/g, '').replace(/\b\+?\d{10,13}\b/g, '');
      const match = sanitized.match(/(\d+(?:[.,]\d+)?)\s*(m|million|k|thousand|b|billion)?/i);
      if (!match) return null;
      let raw = parseFloat(match[1].replace(/,/g, ''));
      if (isNaN(raw)) return null;
      const unit = (match[2] || '').toLowerCase();
      if (unit.startsWith('m')) raw *= 1000000;
      else if (unit.startsWith('k')) raw *= 1000;
      else if (unit.startsWith('b')) raw *= 1000000000;
      return raw >= 5000 ? raw : null;
    };

    // Stage 1: Payment Slip Submitted or Confirmed
    if (
      action === 'SIMULATE_PAYMENT' ||
      latestCustomerMsg?.image ||
      userLower.includes('uploaded genuine') ||
      userLower.includes('here is my slip') ||
      userLower.includes('i have paid') ||
      userLower.includes('sent the money') ||
      userLower.includes('slip') ||
      userLower.includes('receipt') ||
      userLower.includes('transferred')
    ) {
      const ticketId = state.ticketId || `AKS-${Math.floor(10000 + Math.random() * 90000)}`;
      state.ticketId = ticketId;
      state.stage = 'PAYMENT_SUBMITTED';

      // Simulator only. A receipt or message is never treated as payment: the desk
      // confirms funds against its own statement in the trade room.
      reply = `🧾 *Thanks, your receipt for ${ticketId} was received.*
The desk will check its account for ₦${state.amountIn.toLocaleString()} with reference *${ticketId}*.
Your *GH₵ ${state.amountOut.toLocaleString()}* payout to *${state.momoRecipient.network} ${state.momoRecipient.phoneNumber}* is sent once the money shows in their account. You will get the payout reference here.`;

      // Build complete trade ticket
      createdTicket = {
        id: ticketId,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        expiresAt: '15 mins',
        customerName: state.customerName,
        whatsappPhone: state.customerPhone,
        direction: state.corridor,
        amountIn: state.amountIn,
        amountOut: state.amountOut,
        rate: state.rate,
        collectionBank: {
          name: state.collectionBank.name,
          accountNumber: state.collectionBank.accountNumber,
          accountName: state.collectionBank.accountName,
          narration: ticketId,
        },
        momoRecipient: {
          network: state.momoRecipient.network,
          phoneNumber: state.momoRecipient.phoneNumber,
          registeredName: state.momoRecipient.registeredName,
          resolvedStatus: 'RESOLVED_MATCH',
        },
        status: 'AWAITING_PAYMENT',
        remitterName: state.customerName,
        gevSystem1: {
          pixelNoiseVariance: 0,
          typographyDeviation: 0,
          identityScore: 0,
          nibssAuthenticity: 0,
          probabilityFraud: 0,
          verdict: 'ANOMALY_ESCALATE',
          flags: ['Simulator: receipt received, funds not confirmed'],
        },
        whatsappTranscript: [
          ...messages.map((m) => ({
            sender: m.sender as 'customer' | 'bot' | 'operator',
            time: m.time,
            text: m.text,
          })),
          {
            sender: 'bot',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: reply,
          },
        ],
      };

      // Simulator: nothing is written to the database.
      return NextResponse.json({
        reply,
        updatedTradeState: state,
        createdTicket,
      });
    }

    // Stage 2: User provides beneficiary details (MoMo phone number or name)
    else if (
      userLower.includes('024') ||
      userLower.includes('054') ||
      userLower.includes('020') ||
      userLower.includes('050') ||
      userLower.includes('027') ||
      userLower.includes('057') ||
      userText.match(/0\d{9}/) ||
      (state.stage === 'QUOTE_OFFERED' && (userLower.includes('mtn') || userLower.includes('telecel') || userLower.includes('momo') || userLower.includes('kofi') || userText.length > 5))
    ) {
      const ticketId = state.ticketId || `AKS-${Math.floor(10000 + Math.random() * 90000)}`;
      state.ticketId = ticketId;
      state.stage = 'LOCKED_AWAITING_PAYMENT';

      // Parse phone if provided
      const phoneMatch = userText.match(/0\d{9}/) || userText.match(/\+?\d{10,13}/);
      if (phoneMatch) {
        state.momoRecipient.phoneNumber = phoneMatch[0];
      }
      if (userLower.includes('telecel')) {
        state.momoRecipient.network = 'Telecel Cash';
      }

      // Try extracting name if provided (e.g. "Kofi Mensah")
      const nameMatch = userText.match(/(?:mtn|telecel|momo|\d{10})\s+([A-Za-z\s]+)/i);
      if (nameMatch && nameMatch[1].trim().length > 2) {
        state.momoRecipient.registeredName = nameMatch[1].trim().toUpperCase();
      }

      reply = `🔒 *Trade Ticket ${ticketId} Locked for 15:00 Mins!*

• Corridor: *NGN ➔ GHS*
• Amount In: *₦${state.amountIn.toLocaleString()} NGN*
• Beneficiary Gets: *GH₵ ${state.amountOut.toLocaleString()} GHS*
• Recipient: *${state.momoRecipient.network} (${state.momoRecipient.phoneNumber} - ${state.momoRecipient.registeredName})*

Please transfer *₦${state.amountIn.toLocaleString()}* to our collection account:
🏦 *${state.collectionBank.name}*
Account: *${state.collectionBank.accountNumber}*
Account Name: *${state.collectionBank.accountName}*
Narration: *${ticketId}*

⚠️ *Mandatory:* Use *${ticketId}* as your bank transfer remark so the desk can match your payment. Send your receipt here once transferred.`;

      // Register ticket in Neon Postgres as AWAITING_PAYMENT
      createdTicket = {
        id: ticketId,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        expiresAt: '15 mins',
        customerName: state.customerName,
        whatsappPhone: state.customerPhone,
        direction: state.corridor,
        amountIn: state.amountIn,
        amountOut: state.amountOut,
        rate: state.rate,
        collectionBank: {
          name: state.collectionBank.name,
          accountNumber: state.collectionBank.accountNumber,
          accountName: state.collectionBank.accountName,
          narration: ticketId,
        },
        momoRecipient: {
          network: state.momoRecipient.network,
          phoneNumber: state.momoRecipient.phoneNumber,
          registeredName: state.momoRecipient.registeredName,
          resolvedStatus: 'RESOLVED_MATCH',
        },
        status: 'AWAITING_PAYMENT',
        remitterName: state.customerName,
        gevSystem1: {
          pixelNoiseVariance: 0.05,
          typographyDeviation: 0.1,
          identityScore: 99.0,
          nibssAuthenticity: 99.5,
          probabilityFraud: 0.01,
          verdict: 'PASS_FAST_PATH',
          flags: ['Locked Ticket Generated', 'Collection Bank Assigned'],
        },
        whatsappTranscript: [
          ...messages.map((m) => ({
            sender: m.sender as 'customer' | 'bot' | 'operator',
            time: m.time,
          text: m.text,
        })),
        {
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: reply,
        },
      ],
    };

  }

  // Stage 3: User provides amount or specifies volume
  else if (
    extractAmount(userText) !== null ||
    (state.stage === 'GREETING' && userText.match(/\d+/)) ||
    userLower.includes('swap') ||
    userLower.includes('change')
  ) {
    const parsedAmount = extractAmount(userText) || state.amountIn;
    state.amountIn = parsedAmount;
    state.amountOut = parseFloat((parsedAmount / state.rate).toFixed(2));
    state.stage = 'QUOTE_OFFERED';

    reply = `✅ *Indicative quote (simulator):*
• You Send: *₦${state.amountIn.toLocaleString()} NGN*
• Corridor: *${state.corridor === 'NGN_TO_GHS' ? 'Nigeria Bank ➔ Ghana MoMo' : 'Ghana MoMo ➔ Nigeria Bank'}*
• Rate: *1 GHS = ${state.rate} NGN*
• Recipient Receives: *GH₵ ${state.amountOut.toLocaleString()} GHS*

Please send the recipient's *Ghana Mobile Money Number and Name* (e.g. *MTN 0245719646 Kofi Mensah*) so we can assign your collection bank account.`;
  }

  // Stage 4: Greeting / Initial contact / Blank state
  else if (
    userLower.includes('hi') ||
    userLower.includes('hello') ||
    userLower.includes('salam') ||
    userLower.includes('change money') ||
    userLower.includes('rate') ||
    state.stage === 'INIT'
  ) {
    state.stage = 'GREETING';
    reply = `👋 *Welcome to Aksen OTC Bureau Desk!*
Official West Africa Currency Corridor (Lagos Allen ⇄ Accra Circle).

Today's Rate: *1 GHS = ${state.rate} NGN* (simulated rate).

Are you swapping *Naira to Ghana Cedis (NGN ➔ GHS)* or *Cedis to Naira (GHS ➔ NGN)*, and how much volume would you like to move today?`;
  }

  // Default conversational fallback
  else {
    reply = `Understood! We are clearing trades at *1 GHS = ${state.rate} NGN*.
How much volume would you like to swap, or would you like to provide the recipient's Ghana MoMo details?`;
  }

    return NextResponse.json({
      reply,
      updatedTradeState: state,
      createdTicket,
    });
  } catch (error: any) {
    console.error('WhatsApp chat simulation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
