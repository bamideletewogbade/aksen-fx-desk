import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { MonthEndView } from './month-end-view';

export const metadata = { title: 'Susu month-end payouts · Aksen OTC' };

export default async function SusuMonthEndPage() {
  const session = await requireSession('/susu/close');
  return (
    <AppShell session={session}>
      <MonthEndView />
    </AppShell>
  );
}
