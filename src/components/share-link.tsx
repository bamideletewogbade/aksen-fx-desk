'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, Smartphone } from 'lucide-react';
import { formatMinor, type Currency } from '@/lib/money';
import { clock } from '@/lib/time';
import { CopyButton } from './ui';

/**
 * Everything an operator needs to send the customer their trade link through
 * whatever channel they already use. Nothing is sent automatically.
 */
export function ShareLink({
  path,
  deskName,
  customerName,
  phone,
  payMinor,
  payCurrency,
  receiveMinor,
  receiveCurrency,
  rate,
  expiresAt,
}: {
  path: string;
  deskName: string;
  customerName: string;
  phone: string | null;
  payMinor: number;
  payCurrency: Currency;
  receiveMinor: number;
  receiveCurrency: Currency;
  rate: string;
  expiresAt: string;
}) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  const first = customerName.split(' ')[0];
  const message = `Hi ${first}, here is your quote from ${deskName}.\nYou send: ${formatMinor(payMinor, payCurrency)}\nYou receive: ${formatMinor(receiveMinor, receiveCurrency)}\nRate: 1 GHS = ₦${rate}\nValid until ${clock(expiresAt)}.\n\nOpen this link to accept and get payment details:\n${url}`;
  const digits = phone?.replace(/[^\d]/g, '') ?? '';
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-paper p-3">
        <div className="mb-1 text-[0.6875rem] font-mono font-semibold uppercase tracking-wider text-subtle">Customer link</div>
        <div className="break-all font-mono text-xs text-ink">{url || path}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={message} label="Copy message" size="md" variant="primary" />
        <CopyButton text={url} label="Copy link only" size="md" />
        {digits && (
          <a className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-[#eef4ec]" href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            <MessageCircle size={15} /> Open in WhatsApp
          </a>
        )}
        {digits && (
          <a className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-[#eef4ec]" href={`sms:+${digits}?body=${encodeURIComponent(message)}`}>
            <Smartphone size={15} /> SMS
          </a>
        )}
        <a className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand hover:underline" href={path} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Preview as customer
        </a>
      </div>
      <p className="text-xs text-subtle">Anyone with this link can see the quote and payment details for this trade only. You can reissue it from the trade page if it was sent to the wrong person.</p>
    </div>
  );
}
