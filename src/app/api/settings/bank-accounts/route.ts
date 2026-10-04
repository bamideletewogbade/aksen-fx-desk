import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { BankAccountHealth } from '@/types/desk';

const MOCK_BANKS: BankAccountHealth[] = [
  {
    id: 'bank-gtb',
    bankName: 'GTBank Nigeria',
    accountNumber: '0123984752',
    accountName: 'Aksen Liquidity Services Ltd',
    dailyLimit: 25000000,
    dailyUsed: 6500000,
    status: 'ACTIVE_ROUTING',
  },
  {
    id: 'bank-opay',
    bankName: 'OPay Digital Bank',
    accountNumber: '8031940112',
    accountName: 'Aksen Liquidity Desk',
    dailyLimit: 15000000,
    dailyUsed: 3500000,
    status: 'ACTIVE_ROUTING',
  },
  {
    id: 'bank-zenith',
    bankName: 'Zenith Bank',
    accountNumber: '2081940129',
    accountName: 'Aksen Bureau Operations',
    dailyLimit: 25000000,
    dailyUsed: 22000000,
    status: 'NEAR_CAP',
  },
  {
    id: 'bank-palmpay',
    bankName: 'PalmPay Business',
    accountNumber: '9920194812',
    accountName: 'Aksen Settlement Services',
    dailyLimit: 10000000,
    dailyUsed: 0,
    status: 'COOLING_DOWN',
  },
];

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ accounts: MOCK_BANKS });
    }

    const rows = await sql`
      SELECT id, bank_name, account_number, account_name, daily_limit, daily_used, status
      FROM otc_bank_accounts
      ORDER BY updated_at DESC;
    `;

    const accounts: BankAccountHealth[] = rows.map((r: any) => ({
      id: r.id,
      bankName: r.bank_name,
      accountNumber: r.account_number,
      accountName: r.account_name,
      dailyLimit: parseFloat(r.daily_limit || '0'),
      dailyUsed: parseFloat(r.daily_used || '0'),
      status: r.status,
    }));

    return NextResponse.json({ accounts: accounts.length > 0 ? accounts : MOCK_BANKS });
  } catch (error: any) {
    console.error('Error fetching bank accounts:', error);
    return NextResponse.json({ accounts: MOCK_BANKS });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = body.id || `bank-${Date.now()}`;
    const bankName = body.bankName;
    const accountNumber = body.accountNumber;
    const accountName = body.accountName;
    const dailyLimit = parseFloat(body.dailyLimit) || 25000000;
    const status = body.status || 'ACTIVE_ROUTING';

    if (process.env.DATABASE_URL) {
      await sql`
        INSERT INTO otc_bank_accounts (
          id, bank_name, account_number, account_name, daily_limit, daily_used, status, updated_at
        ) VALUES (
          ${id}, ${bankName}, ${accountNumber}, ${accountName}, ${dailyLimit}, 0, ${status}, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          bank_name = EXCLUDED.bank_name,
          account_number = EXCLUDED.account_number,
          account_name = EXCLUDED.account_name,
          daily_limit = EXCLUDED.daily_limit,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;
    }

    return NextResponse.json({
      success: true,
      account: {
        id,
        bankName,
        accountNumber,
        accountName,
        dailyLimit,
        dailyUsed: 0,
        status,
      },
    });
  } catch (error: any) {
    console.error('Error creating bank account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, bankName, accountNumber, accountName, dailyLimit, dailyUsed, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    if (process.env.DATABASE_URL) {
      await sql`
        UPDATE otc_bank_accounts
        SET
          bank_name = COALESCE(${bankName}, bank_name),
          account_number = COALESCE(${accountNumber}, account_number),
          account_name = COALESCE(${accountName}, account_name),
          daily_limit = COALESCE(${dailyLimit}, daily_limit),
          daily_used = COALESCE(${dailyUsed}, daily_used),
          status = COALESCE(${status}, status),
          updated_at = NOW()
        WHERE id = ${id};
      `;
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error updating bank account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    if (process.env.DATABASE_URL) {
      await sql`
        DELETE FROM otc_bank_accounts
        WHERE id = ${id};
      `;
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error deleting bank account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
