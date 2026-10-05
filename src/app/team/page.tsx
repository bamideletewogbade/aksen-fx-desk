import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { TeamView } from './team-view';

export const metadata = { title: 'Team · Aksen OTC' };

export default async function TeamPage() {
  const session = await requireSession('/team');
  return (
    <AppShell session={session}>
      <TeamView />
    </AppShell>
  );
}
