import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { RatesView } from './rates-view';

export const metadata = { title: 'Rates · Aksen OTC' };

export default async function RatesPage() {
  const session = await requireSession('/rates');
  return (
    <AppShell session={session}>
      <RatesView />
    </AppShell>
  );
}
