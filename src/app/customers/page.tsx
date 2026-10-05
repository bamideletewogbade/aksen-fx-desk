import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { CustomersView } from './customers-view';

export const metadata = { title: 'Customers · Aksen OTC' };

export default async function CustomersPage() {
  const session = await requireSession('/customers');
  return (
    <AppShell session={session}>
      <Suspense>
        <CustomersView />
      </Suspense>
    </AppShell>
  );
}
