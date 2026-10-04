import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { INITIAL_TICKETS } from '@/lib/mock-data';
import { TradeTicket } from '@/types/desk';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ source: 'mock', tickets: INITIAL_TICKETS });
    }

    const rows = await sql`
      SELECT 
        id, 
        created_at, 
        expires_at, 
        customer_name, 
        whatsapp_phone, 
        direction, 
        amount_in, 
        amount_out, 
        rate,
        collection_bank_name, 
        collection_account_number, 
        collection_narration,
        momo_network, 
        momo_phone, 
        momo_name, 
        status, 
        remitter_name,
        gev_probability_fraud, 
        gev_verdict, 
        gev_flags, 
        whatsapp_transcript
      FROM otc_trade_tickets 
      ORDER BY created_at DESC;
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ source: 'mock', tickets: INITIAL_TICKETS });
    }

    const tickets: TradeTicket[] = rows.map((r: any) => ({
      id: r.id,
      createdAt: r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '14:38',
      expiresAt: '15 mins',
      customerName: r.customer_name || 'Anonymous Counterparty',
      whatsappPhone: r.whatsapp_phone || '+234 800 000 0000',
      direction: r.direction || 'NGN_TO_GHS',
      amountIn: parseFloat(r.amount_in),
      amountOut: parseFloat(r.amount_out),
      rate: parseFloat(r.rate),
      collectionBank: {
        name: r.collection_bank_name || 'GTBank Nigeria',
        accountNumber: r.collection_account_number || '0123984752',
        accountName: 'Aksen Liquidity Services Ltd',
        narration: r.collection_narration || r.id,
      },
      momoRecipient: {
        network: (r.momo_network as any) || 'MTN MoMo',
        phoneNumber: r.momo_phone || '0240000000',
        registeredName: r.momo_name || 'VERIFIED TRADER',
        resolvedStatus: 'RESOLVED_MATCH',
      },
      status: r.status as any,
      remitterName: r.remitter_name || r.customer_name,
      gevSystem1: {
        pixelNoiseVariance: 0.04,
        typographyDeviation: 0.2,
        identityScore: 99.4,
        nibssAuthenticity: 99.8,
        probabilityFraud: parseFloat(r.gev_probability_fraud || '0.01'),
        verdict: (r.gev_verdict as any) || 'PASS_FAST_PATH',
        flags: Array.isArray(r.gev_flags) ? r.gev_flags : ['Subpixel baseline authentic'],
      },
      whatsappTranscript: Array.isArray(r.whatsapp_transcript) ? r.whatsapp_transcript : [],
    }));

    return NextResponse.json({ source: 'neon_postgres', count: tickets.length, tickets });
  } catch (error: any) {
    console.error('Error fetching tickets from Neon:', error);
    return NextResponse.json({ source: 'fallback_mock', error: error.message, tickets: INITIAL_TICKETS });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, ticketId, newStatus, ticket } = body;

    if (action === 'UPDATE_STATUS' && ticketId && newStatus) {
      if (process.env.DATABASE_URL) {
        await sql`
          UPDATE otc_trade_tickets 
          SET status = ${newStatus} 
          WHERE id = ${ticketId};
        `;
      }
      return NextResponse.json({ success: true, ticketId, status: newStatus });
    }

    if (action === 'CREATE_TICKET' && ticket) {
      if (process.env.DATABASE_URL) {
        await sql`
          INSERT INTO otc_trade_tickets (
            id, customer_name, whatsapp_phone, direction, amount_in, amount_out, rate,
            collection_bank_name, collection_account_number, collection_narration,
            momo_network, momo_phone, momo_name, status, remitter_name,
            gev_probability_fraud, gev_verdict, gev_flags, whatsapp_transcript
          )
          VALUES (
            ${ticket.id}, ${ticket.customerName}, ${ticket.whatsappPhone}, ${ticket.direction},
            ${ticket.amountIn}, ${ticket.amountOut}, ${ticket.rate},
            ${ticket.collectionBank.name}, ${ticket.collectionBank.accountNumber}, ${ticket.id},
            ${ticket.momoRecipient.network}, ${ticket.momoRecipient.phoneNumber}, ${ticket.momoRecipient.registeredName},
            ${ticket.status}, ${ticket.remitterName},
            ${ticket.gevSystem1?.probabilityFraud || 0.01}, ${ticket.gevSystem1?.verdict || 'PASS_FAST_PATH'},
            ${JSON.stringify(ticket.gevSystem1?.flags || [])}::jsonb,
            ${JSON.stringify(ticket.whatsappTranscript || [])}::jsonb
          )
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
        `;
      }
      return NextResponse.json({ success: true, ticket });
    }

    if (action === 'CONCIERGE_INQUIRY' || body.channel === 'WEB_CONCIERGE') {
      const ticketId = `AKS-${Math.floor(10000 + Math.random() * 90000)}`;
      const customerName = body.customerName || body.name || 'Web Counterparty';
      const whatsappPhone = body.phone || body.whatsappPhone || '+234 915 583 3108';
      const amountIn = parseFloat(String(body.amount || body.note || '1500000').replace(/[^0-9.]/g, '')) || 1500000;
      const rate = 105.06;
      const amountOut = parseFloat((amountIn / rate).toFixed(2));
      const direction = body.corridor === 'GHS -> NGN' ? 'GHS_TO_NGN' : 'NGN_TO_GHS';

      if (process.env.DATABASE_URL) {
        await sql`
          INSERT INTO otc_trade_tickets (
            id, customer_name, whatsapp_phone, direction, amount_in, amount_out, rate,
            collection_bank_name, collection_account_number, collection_narration,
            momo_network, momo_phone, momo_name, status, remitter_name,
            gev_probability_fraud, gev_verdict, gev_flags, whatsapp_transcript
          )
          VALUES (
            ${ticketId}, ${customerName}, ${whatsappPhone}, ${direction},
            ${amountIn}, ${amountOut}, ${rate},
            'GTBank Nigeria', '0123984752', ${ticketId},
            ${body.settlementMethod || 'MTN MoMo'}, ${whatsappPhone}, ${customerName},
            'AWAITING_PAYMENT', ${customerName},
            0.01, 'PASS_FAST_PATH',
            ${JSON.stringify(['Web Concierge Verified Inbound'])}::jsonb,
            ${JSON.stringify(body.transcript || [{ sender: 'customer', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: body.note || 'Inbound inquiry' }])}::jsonb
          )
          ON CONFLICT (id) DO NOTHING;
        `;
      }
      return NextResponse.json({ success: true, ticketId });
    }

    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in POST /api/tickets:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
