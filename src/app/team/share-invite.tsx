'use client';

import { useEffect, useState } from 'react';
import { CopyButton, Notice } from '@/components/ui';

export function ShareInvite({ path, email }: { path: string; email: string }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${path}`;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Send this link to {email} privately. It works once and expires in 7 days.</p>
      <div className="break-all rounded-xl border border-line bg-paper p-3 font-mono text-xs">{url}</div>
      <CopyButton text={url} label="Copy invite link" size="md" variant="primary" />
      {local && <Notice tone="warn">This address only works on this computer. Create and share a fresh invite from your deployed desk when inviting a remote teammate.</Notice>}
      <Notice tone="info">Aksen does not email invites yet, so nothing has been sent. Share the link yourself.</Notice>
    </div>
  );
}
