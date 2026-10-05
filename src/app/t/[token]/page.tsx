import type { Metadata } from 'next';
import { getDb } from '@/server/db';
import { getPortalView, type PortalView } from '@/server/trades';
import { DomainError } from '@/server/errors';
import { CustomerTrade } from './customer-trade';

export const metadata: Metadata = {
  title: 'Your trade',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function CustomerTradePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: PortalView | null = null;
  let problem: string | null = null;
  try {
    view = await getPortalView(await getDb(), token);
  } catch (e) {
    problem = e instanceof DomainError ? e.message : 'We could not load this trade right now. Try again in a minute.';
  }
  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper p-6">
        <div className="max-w-sm rounded-3xl border border-line bg-white p-8 text-center">
          <div className="text-lg font-bold text-ink">Link not available</div>
          <p className="mt-2 text-sm text-muted">{problem}</p>
        </div>
      </main>
    );
  }
  return <CustomerTrade token={token} initial={view} />;
}
