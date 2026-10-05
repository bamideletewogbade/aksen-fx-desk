'use client';

import { useEffect, useState } from 'react';
import { CopyButton, Notice } from '@/components/ui';

export function ShareInvite({ path, email }: { path: string; email: string }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Send this link to {email} privately. It works once and expires in 7 days.</p>
      <div className="break-all rounded-xl border border-line bg-paper p-3 font-mono text-xs">{url}</div>
      <CopyButton text={url} label="Copy invite link" size="md" variant="primary" />
      <Notice tone="info">Aksen does not email invites yet, so nothing has been sent. Share the link yourself.</Notice>
    </div>
  );
}
