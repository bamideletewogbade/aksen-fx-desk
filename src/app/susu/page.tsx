import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { SusuView } from './susu-view';

export const metadata = { title: 'Susu · Aksen OTC' };

export default async function SusuPage() {
  const session = await requireSession('/susu');
  return (
    <AppShell session={session}>
      <Suspense>
        <SusuView />
      </Suspense>
    </AppShell>
  );
}
