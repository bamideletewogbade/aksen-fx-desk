import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { AccountsView } from './accounts-view';

export const metadata = { title: 'Accounts · Aksen OTC' };

export default async function AccountsPage() {
  const session = await requireSession('/accounts');
  return (
    <AppShell session={session}>
      <AccountsView />
    </AppShell>
  );
}
