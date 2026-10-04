import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export interface MomoWallet {
  id: string;
  network: string;
  phoneNumber: string;
  merchantName: string;
  balance: number;
  dailyDisbursed: number;
  dailyLimit: number;
  status: 'ACTIVE_DISBURSING' | 'STANDBY' | 'LOW_FLOAT';
}

const MOCK_MOMO: MomoWallet[] = [
  {
    id: 'momo-mtn-accra',
    network: 'MTN MoMo',
    phoneNumber: '0245719646',
    merchantName: 'Aksen Liquidity Services Ghana',
    balance: 84500,
    dailyDisbursed: 32100,
    dailyLimit: 150000,
    status: 'ACTIVE_DISBURSING',
  },
  {
    id: 'momo-mtn-kumasi',
    network: 'MTN MoMo',
    phoneNumber: '0541992011',
    merchantName: 'Aksen Kumasi Clearing Hub',
    balance: 42300,
    dailyDisbursed: 19000,
    dailyLimit: 100000,
    status: 'ACTIVE_DISBURSING',
  },
  {
    id: 'momo-telecel-1',
    network: 'Telecel Cash',
    phoneNumber: '0208119283',
    merchantName: 'Aksen Rapid Settlement',
    balance: 28000,
    dailyDisbursed: 8400,
    dailyLimit: 80000,
    status: 'ACTIVE_DISBURSING',
  },
  {
    id: 'momo-zeepay-hub',
    network: 'Zeepay',
    phoneNumber: '0249001122',
    merchantName: 'Aksen Cross-Border Float',
    balance: 15000,
    dailyDisbursed: 0,
    dailyLimit: 50000,
    status: 'STANDBY',
  },
];

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ wallets: MOCK_MOMO });
    }

    const rows = await sql`
      SELECT id, network, phone_number, merchant_name, balance, daily_disbursed, daily_limit, status
      FROM otc_momo_wallets
      ORDER BY updated_at DESC;
    `;

    const wallets: MomoWallet[] = rows.map((r: any) => ({
      id: r.id,
      network: r.network,
      phoneNumber: r.phone_number,
      merchantName: r.merchant_name,
      balance: parseFloat(r.balance || '0'),
      dailyDisbursed: parseFloat(r.daily_disbursed || '0'),
      dailyLimit: parseFloat(r.daily_limit || '0'),
      status: r.status,
    }));

    return NextResponse.json({ wallets: wallets.length > 0 ? wallets : MOCK_MOMO });
  } catch (error: any) {
    console.error('Error fetching MoMo wallets:', error);
    return NextResponse.json({ wallets: MOCK_MOMO });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = body.id || `momo-${Date.now()}`;
    const network = body.network || 'MTN MoMo';
    const phoneNumber = body.phoneNumber;
    const merchantName = body.merchantName;
    const balance = parseFloat(body.balance) || 0;
    const dailyLimit = parseFloat(body.dailyLimit) || 100000;
    const status = body.status || 'ACTIVE_DISBURSING';

    if (process.env.DATABASE_URL) {
      await sql`
        INSERT INTO otc_momo_wallets (
          id, network, phone_number, merchant_name, balance, daily_disbursed, daily_limit, status, updated_at
        ) VALUES (
          ${id}, ${network}, ${phoneNumber}, ${merchantName}, ${balance}, 0, ${dailyLimit}, ${status}, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          network = EXCLUDED.network,
          phone_number = EXCLUDED.phone_number,
          merchant_name = EXCLUDED.merchant_name,
          balance = EXCLUDED.balance,
          daily_limit = EXCLUDED.daily_limit,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;
    }

    return NextResponse.json({
      success: true,
      wallet: {
        id,
        network,
        phoneNumber,
        merchantName,
        balance,
        dailyDisbursed: 0,
        dailyLimit,
        status,
      },
    });
  } catch (error: any) {
    console.error('Error creating MoMo wallet:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, network, phoneNumber, merchantName, balance, dailyDisbursed, dailyLimit, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing wallet ID' }, { status: 400 });
    }

    if (process.env.DATABASE_URL) {
      await sql`
        UPDATE otc_momo_wallets
        SET
          network = COALESCE(${network}, network),
          phone_number = COALESCE(${phoneNumber}, phone_number),
          merchant_name = COALESCE(${merchantName}, merchant_name),
          balance = COALESCE(${balance}, balance),
          daily_disbursed = COALESCE(${dailyDisbursed}, daily_disbursed),
          daily_limit = COALESCE(${dailyLimit}, daily_limit),
          status = COALESCE(${status}, status),
          updated_at = NOW()
        WHERE id = ${id};
      `;
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error updating MoMo wallet:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing wallet ID' }, { status: 400 });
    }

    if (process.env.DATABASE_URL) {
      await sql`
        DELETE FROM otc_momo_wallets
        WHERE id = ${id};
      `;
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error deleting MoMo wallet:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
