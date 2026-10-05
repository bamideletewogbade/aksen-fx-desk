import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { TradesList } from './trades-list';

export const metadata = { title: 'Trades · Aksen OTC' };

export default async function TradesPage() {
  const session = await requireSession('/trades');
  return (
    <AppShell session={session}>
      <Suspense>
        <TradesList />
      </Suspense>
    </AppShell>
  );
}
