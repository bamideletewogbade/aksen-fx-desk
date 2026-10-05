import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { ReconcileView } from './reconcile-view';

export const metadata = { title: 'Day close · Aksen OTC' };

export default async function ReconcilePage() {
  const session = await requireSession('/reconcile');
  return (
    <AppShell session={session}>
      <ReconcileView />
    </AppShell>
  );
}
