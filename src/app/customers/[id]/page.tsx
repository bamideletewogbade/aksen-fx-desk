import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { CustomerView } from './customer-view';

export const metadata = { title: 'Customer · Aksen OTC' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/customers/${id}`);
  return (
    <AppShell session={session}>
      <CustomerView id={id} />
    </AppShell>
  );
}
