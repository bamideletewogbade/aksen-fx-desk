import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { WhatsAppConsole } from './whatsapp-console';

export const metadata = { title: 'WhatsApp & SMS · Aksen OTC' };

export default async function WhatsAppPage() {
  const session = await requireSession('/whatsapp');
  return (
    <AppShell session={session}>
      <WhatsAppConsole />
    </AppShell>
  );
}
