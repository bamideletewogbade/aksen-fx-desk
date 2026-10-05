import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { SettingsView } from './settings-view';

export const metadata = { title: 'Settings · Aksen OTC' };

export default async function SettingsPage() {
  const session = await requireSession('/settings');
  return (
    <AppShell session={session}>
      <SettingsView />
    </AppShell>
  );
}
