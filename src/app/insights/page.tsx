import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { InsightsView } from './insights-view';

export const metadata = { title: 'Insights · Aksen OTC' };

export default async function InsightsPage() {
  const session = await requireSession('/insights');
  return (
    <AppShell session={session}>
      <InsightsView />
    </AppShell>
  );
}
