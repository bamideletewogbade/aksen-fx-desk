import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { SaverView } from './saver-view';

export const metadata = { title: 'Saver · Aksen OTC' };

export default async function SaverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/susu/${id}`);
  return (
    <AppShell session={session}>
      <SaverView id={id} />
    </AppShell>
  );
}
