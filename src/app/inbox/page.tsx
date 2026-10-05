import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { InboxView } from './inbox-view';

export const metadata = { title: 'Inbox · Aksen OTC' };

export default async function InboxPage() {
  const session = await requireSession('/inbox');
  return (
    <AppShell session={session}>
      <Suspense>
        <InboxView />
      </Suspense>
    </AppShell>
  );
}
