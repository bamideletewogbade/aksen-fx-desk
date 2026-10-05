import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { DeskView } from './desk-view';

export const metadata = { title: 'Desk · Aksen OTC' };

export default async function DeskPage() {
  const session = await requireSession('/desk');
  return (
    <AppShell session={session}>
      <DeskView />
    </AppShell>
  );
}
