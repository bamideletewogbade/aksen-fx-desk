'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CheckCircle2, CircleAlert, ExternalLink, FlaskConical, Link2, MessageSquare, Plus, Smartphone } from 'lucide-react';
import { api, ApiError, useLoad } from '@/lib/api';
import { canApprove, canTrade } from '@/lib/auth';
import { useSession } from '@/components/app-shell';
import { Button, Card, CopyButton, Empty, Field, Input, Notice, PageHeader, Pill, Segmented, Select, Skeleton, Textarea, toast } from '@/components/ui';
import type { ChannelView } from '@/server/inbox';

type TwilioStatus = { configured: boolean; accountSid: string | null; publicBaseUrl: string | null; whatsappFrom: string | null; smsFrom: string | null };
type Data = { channels: ChannelView[]; twilio: TwilioStatus };

const SANDBOX = '+14155238886';

function Row({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex items-center gap-2 text-muted">
        {ok ? <CheckCircle2 size={15} className="text-brand" /> : <CircleAlert size={15} className="text-amber" />} {label}
      </span>
      <span className={ok ? 'font-mono text-xs text-ink' : 'text-xs font-semibold text-amber'}>{value ?? (ok ? 'Set' : 'Not set')}</span>
    </li>
  );
}

function AddChannel({ twilio, onSaved }: { twilio: TwilioStatus; onSaved: (d: Data) => void }) {
  const [kind, setKind] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');
  const [number, setNumber] = useState(twilio.whatsappFrom?.replace('whatsapp:', '') ?? SANDBOX);
  const [label, setLabel] = useState('WhatsApp Sandbox');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNumber(kind === 'WHATSAPP' ? twilio.whatsappFrom?.replace('whatsapp:', '') ?? SANDBOX : twilio.smsFrom ?? '');
    setLabel(kind === 'WHATSAPP' ? 'WhatsApp Sandbox' : 'SMS line');
  }, [kind, twilio.whatsappFrom, twilio.smsFrom]);
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api<Data>('/api/channels', { method: 'POST', json: { kind, number, label } }));
      toast('Number connected');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not connect the number.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line p-4">
      <Segmented value={kind} onChange={setKind} size="sm" options={[{ value: 'WHATSAPP', label: 'WhatsApp' }, { value: 'SMS', label: 'SMS' }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Twilio number" htmlFor="ch-number" hint={kind === 'WHATSAPP' ? 'Trial accounts use the Sandbox number +1 415 523 8886.' : 'Your Twilio phone number.'}>
          <Input id="ch-number" mono value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Name in the inbox" htmlFor="ch-label"><Input id="ch-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      </div>
      <Button size="sm" busy={busy} onClick={save} icon={<Plus size={14} />}>Connect number</Button>
    </div>
  );
}

function TestChat({ channels, demo }: { channels: ChannelView[]; demo: boolean }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels.find((c) => c.active)?.id ?? '');
  const [phone, setPhone] = useState('+233 24 555 0101');
  const [name, setName] = useState('Ama');
  const [text, setText] = useState('Hi, good afternoon. What’s your rate today?');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ conversationId?: string }>('/api/inbox/simulate', { method: 'POST', json: { phone, name, text, channelId } });
      if (r.conversationId) router.push(`/inbox?c=${r.conversationId}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not start the test chat.', 'risk');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><FlaskConical size={16} /> Rehearse without a phone</h2>
      <p className="text-sm text-muted">Plays a customer message through the real assistant and trade engine. The chat is marked <em>Test</em>; replies are recorded but never sent. Continue it from the inbox, including sending a sample receipt.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Number" htmlFor="t-ch">
          <Select id="t-ch" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {demo && !channels.length && <option value="">Rehearsal channel (no provider)</option>}
            {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Customer phone" htmlFor="t-phone"><Input id="t-phone" mono value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="WhatsApp name" htmlFor="t-name"><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="First message" htmlFor="t-text"><Textarea id="t-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <Button busy={busy} onClick={start} disabled={!demo && !channelId} icon={<MessageSquare size={15} />}>Start test chat</Button>
    </Card>
  );
}

export function WhatsAppConsole() {
  const session = useSession();
  const { data, setData, error } = useLoad<Data>('/api/channels');
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const toggle = async (c: ChannelView, patch: Partial<Pick<ChannelView, 'assistantEnabled' | 'active'>>) => {
    try {
      setData(await api<Data>('/api/channels', { method: 'POST', json: { id: c.id, ...patch } }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update.', 'risk');
    }
  };

  if (error) return <Notice tone="risk">{error.message}</Notice>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-48" /></div>;
  const base = data.twilio.publicBaseUrl ?? origin;
  const inbound = `${base}/api/twilio/inbound`;
  const status = `${base}/api/twilio/status`;
  const local = !data.twilio.publicBaseUrl || /localhost|127\.0\.0\.1/.test(base);
  const hasWhatsApp = data.channels.some((c) => c.kind === 'WHATSAPP' && c.active);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Channels"
        title="WhatsApp & SMS"
        subtitle="Connect the numbers customers message. Each conversation lands in the Inbox, where the assistant handles routine quotes and hands anything else to your team."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Link2 size={16} /> Twilio connection</h2>
          <ul className="divide-y divide-line">
            <Row ok={data.twilio.configured} label="Account credentials" value={data.twilio.accountSid} />
            <Row ok={Boolean(data.twilio.publicBaseUrl) && !local} label="Public address Twilio calls (PUBLIC_BASE_URL)" value={data.twilio.publicBaseUrl} />
          </ul>
          {!data.twilio.configured && <Notice tone="warn">Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to the server environment. Until then nothing is sent, and the inbox marks replies “not sent”.</Notice>}
          {local && <Notice tone="warn" title="Twilio can’t reach localhost">Run a tunnel (for example <span className="font-mono">cloudflared tunnel --url http://localhost:3010</span>) or deploy, then set PUBLIC_BASE_URL to that https address and restart.</Notice>}
          <Field label="“When a message comes in” URL (method POST)">
            <div className="flex gap-2"><Input readOnly mono value={inbound} aria-label="Inbound webhook URL" /><CopyButton text={inbound} /></div>
          </Field>
          <Field label="Status callback URL" hint="Set automatically on every message we send; paste it in the Sandbox settings too.">
            <div className="flex gap-2"><Input readOnly mono value={status} aria-label="Status callback URL" /><CopyButton text={status} /></div>
          </Field>
          <a href="https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">Open Twilio Sandbox settings <ExternalLink size={12} /></a>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><MessageSquare size={16} /> Numbers on this desk</h2>
          {data.channels.length === 0 ? (
            <Empty title="No numbers yet">Connect the WhatsApp Sandbox to start testing with a real phone.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.channels.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {c.kind === 'WHATSAPP' ? <MessageSquare size={14} /> : <Smartphone size={14} />} {c.label}
                      {!c.active && <Pill tone="done">Off</Pill>}
                    </div>
                    <div className="font-mono text-xs text-muted">{c.address} · {c.conversations} chat{c.conversations === 1 ? '' : 's'}</div>
                  </div>
                  {canApprove(session) && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant={c.assistantEnabled ? 'secondary' : 'ghost'} icon={<Bot size={13} />} onClick={() => toggle(c, { assistantEnabled: !c.assistantEnabled })}>
                        Assistant {c.assistantEnabled ? 'on' : 'off'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(c, { active: !c.active })}>{c.active ? 'Disconnect' : 'Reconnect'}</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canApprove(session) && <AddChannel twilio={data.twilio} onSaved={setData} />}
        </Card>
      </div>

      {hasWhatsApp && (
        <Notice tone="info" title="Testing on a Twilio trial">
          Customers must first join your Sandbox: they send your join code (shown in Twilio under <em>Messaging → Try it out → Send a WhatsApp message</em>, e.g. <span className="font-mono">join two-words</span>) to <span className="font-mono">+1 415 523 8886</span> on WhatsApp. After that, whatever they send reaches this desk. Sandbox sessions lapse after 3 days without messages, and replies are only allowed within 24 hours of the customer’s last message.
        </Notice>
      )}

      {canTrade(session) && (session.isDemo || data.channels.some((c) => c.active)) && <TestChat channels={data.channels.filter((c) => c.active)} demo={session.isDemo} />}
    </div>
  );
}
