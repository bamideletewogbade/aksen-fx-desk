import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/server/page';
import { QuoteBuilder } from './quote-builder';

export const metadata = { title: 'Quote · Aksen OTC' };

/**
 * Manual quotes. Customers who message on WhatsApp get quotes from the
 * assistant; a person only builds one here for a chat they have taken over
 * (?conversation=) or for a customer who calls or walks in (?customer=).
 */
export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customer?: string; conversation?: string }> }) {
  const session = await requireSession('/trades/new');
  const { customer, conversation } = await searchParams;
  return (
    <AppShell session={session}>
      <QuoteBuilder initialCustomerId={customer} conversationId={conversation} />
    </AppShell>
  );
}
