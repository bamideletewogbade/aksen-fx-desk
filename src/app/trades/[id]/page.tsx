import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { TradeRoom } from './trade-room';

export const metadata = { title: 'Trade · Aksen OTC' };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/trades/${id}`);
  return (
    <AppShell session={session}>
      <TradeRoom id={id} />
    </AppShell>
  );
}
