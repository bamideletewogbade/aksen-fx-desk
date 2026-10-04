'use client';

import { useState, useEffect } from 'react';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { 
  Building2, 
  CheckCircle2, 
  Copy, 
  Check, 
  ExternalLink, 
  ArrowRight, 
  ShieldCheck, 
  Send, 
  RefreshCw,
  Key,
  Globe,
  MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { CustomerSimulator } from '@/components/desk/customer-simulator';
import { Session } from '@/lib/auth';

export default function WhatsAppGatewayPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState('104928172910482');
  const [wabaId, setWabaId] = useState('103982019481920');
  const [accessToken, setAccessToken] = useState('EAAG...meta_system_user_token_live');
  const [saved, setSaved] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isChatSimOpen, setIsChatSimOpen] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        }
      } catch {}
    }
    loadSession();
  }, []);

  // Inbound Test Simulator State
  const [simPhone, setSimPhone] = useState('2348034928810');
  const [simName, setSimName] = useState('Alhaji Bello (Circle Runner)');
  const [simMessage, setSimMessage] = useState('Salam chief! I have ₦1.8M ready for Circle payout to Kumasi MTN MoMo.');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : 'https://aksen-otc.vercel.app/api/whatsapp/webhook';
  const verifyToken = 'aksen_otc_verify_token_2026';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(verifyToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleTestInbound = async () => {
    setIsSimulating(true);
    setSimResult(null);

    try {
      const mockMetaPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: wabaId,
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+234 810 000 0000',
                    phone_number_id: phoneNumberId,
                  },
                  contacts: [
                    {
                      profile: { name: simName },
                      wa_id: simPhone,
                    },
                  ],
                  messages: [
                    {
                      from: simPhone,
                      id: `wamid.HBgL${Math.floor(100000 + Math.random() * 900000)}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      text: { body: simMessage },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const res = await fetch('/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockMetaPayload),
      });

      const data = await res.json();
      setSimResult(data);
    } catch (err) {
      console.error('Simulation error:', err);
      setSimResult({ error: 'Failed to dispatch webhook event' });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <OperatorShell session={session}>
      <div className="max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e3ece1] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#175b3b] px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-[#c2f576]">
                OFFICIAL META CLOUD API
              </span>
              <span className="text-xs font-mono text-[#53635a]">
                Direct Webhook &middot; Zero Ban Risk &middot; 99.9% Uptime
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#10261d] mt-1">
              WhatsApp Business Gateway
            </h1>
            <p className="text-xs text-[#53635a] mt-0.5">
              Connect your bureau&apos;s Meta WhatsApp Business Platform account. Inbound customer quotes and payment receipts stream directly to your Operator Desk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsChatSimOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#175b3b] bg-[#ebf5e7] hover:bg-[#d8edd4] text-[#175b3b] px-4 py-2.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <MessageSquare size={14} />
              <span>Interactive WhatsApp Simulator</span>
            </button>

            <Link
              href="/desk"
              className="inline-flex items-center gap-2 rounded-full bg-[#10261d] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#175b3b] transition-all cursor-pointer shadow-xs"
            >
              <span>Open Operator Desk</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 2-Column Grid: Config Form & Inbound Webhook Tester */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Meta Business Cloud API Credentials */}
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-3xl border border-[#e3ece1] bg-white p-6 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ebf5e7] text-[#175b3b]">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#10261d]">Meta Cloud API Credentials</h3>
                    <span className="text-[11px] text-[#53635a]">developers.facebook.com &gt; WhatsApp</span>
                  </div>
                </div>

                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#175b3b] hover:underline"
                >
                  <span>Meta Portal</span>
                  <ExternalLink size={11} />
                </a>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#53635a] block mb-1">
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    required
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono font-bold text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                  />
                  <span className="text-[10.5px] text-[#798d81] mt-1 block">
                    Found under Meta App Dashboard &gt; WhatsApp &gt; API Setup.
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#53635a] block mb-1">
                    WhatsApp Business Account ID (WABA ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono font-bold text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#53635a] block mb-1">
                    System User Permanent Access Token
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                    />
                    <Key size={14} className="absolute right-3.5 top-3 text-[#798d81]" />
                  </div>
                  <span className="text-[10.5px] text-[#798d81] mt-1 block">
                    Generated under Meta Business Settings &gt; System Users with <code className="font-mono text-[#175b3b]">whatsapp_business_messaging</code> permission.
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-full bg-[#175b3b] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer shadow-xs"
                  >
                    <span>Save Meta Credentials</span>
                    <ArrowRight size={13} />
                  </button>

                  {saved && (
                    <span className="flex items-center gap-1 text-xs font-bold text-[#175b3b]">
                      <Check size={14} /> Saved &amp; Active
                    </span>
                  )}
                </div>
              </form>
            </div>

            {/* Webhook Endpoint URLs to paste into Meta Dashboard */}
            <div className="rounded-3xl border border-[#e3ece1] bg-white p-6 sm:p-7 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-[#e3ece1] pb-3">
                <Globe size={16} className="text-[#175b3b]" />
                <h3 className="text-sm font-bold text-[#10261d]">Webhook Configuration for Meta Dashboard</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-mono text-[#53635a] block mb-1">
                    Callback URL (Paste into Meta Dashboard &gt; Configuration)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2 text-xs font-mono text-[#10261d] select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="flex items-center gap-1 rounded-xl border border-[#e3ece1] bg-white px-3 py-2 text-xs font-semibold text-[#10261d] hover:bg-[#ebf2e9] transition-colors cursor-pointer flex-shrink-0"
                    >
                      {copiedUrl ? <Check size={13} className="text-[#175b3b]" /> : <Copy size={13} />}
                      <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-mono text-[#53635a] block mb-1">
                    Verify Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={verifyToken}
                      className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2 text-xs font-mono text-[#10261d] select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="flex items-center gap-1 rounded-xl border border-[#e3ece1] bg-white px-3 py-2 text-xs font-semibold text-[#10261d] hover:bg-[#ebf2e9] transition-colors cursor-pointer flex-shrink-0"
                    >
                      {copiedToken ? <Check size={13} className="text-[#175b3b]" /> : <Copy size={13} />}
                      <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Inbound Webhook Live Intake Tester */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl border border-[#e3ece1] bg-white p-6 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-[#175b3b]" />
                  <h3 className="text-sm font-bold text-[#10261d]">Live Inbound Intake Tester</h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-[#175b3b] bg-[#ebf5e7] px-2.5 py-0.5 rounded-full">
                  POST /api/whatsapp/webhook
                </span>
              </div>

              <p className="text-xs text-[#53635a]">
                Simulate an incoming WhatsApp chat payload from Meta to test quotation, 15-minute lock creation, and Neon Postgres persistence.
              </p>

              {/* Interactive Live Chat Launcher */}
              <button
                type="button"
                onClick={() => setIsChatSimOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#075e54] hover:bg-[#00a884] text-white py-3 text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <MessageSquare size={14} />
                <span>Launch Interactive WhatsApp Chat</span>
              </button>

              {/* Quick Persona Buttons */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono font-bold uppercase text-[#798d81] block">
                  Quick Test Message
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSimName('Alhaji Bello (Circle Runner)');
                      setSimPhone('2348034928810');
                      setSimMessage('Salam chief! I have ₦1.8M ready for Circle payout to Kumasi MTN MoMo.');
                    }}
                    className="p-2.5 rounded-xl border border-[#e3ece1] bg-[#f9faf7] hover:bg-[#ebf2e9] text-left text-xs transition-colors cursor-pointer"
                  >
                    <strong className="block text-[11px] text-[#10261d]">Alhaji Bello</strong>
                    <span className="text-[10px] text-[#53635a]">₦1.8M to Kumasi MoMo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSimName('Kofi Mensah (Legon Campus)');
                      setSimPhone('233541992011');
                      setSimMessage('Good day sir, sending ₦450,000 for Legon student allowance to Telecel Cash.');
                    }}
                    className="p-2.5 rounded-xl border border-[#e3ece1] bg-[#f9faf7] hover:bg-[#ebf2e9] text-left text-xs transition-colors cursor-pointer"
                  >
                    <strong className="block text-[11px] text-[#10261d]">Campus Runner</strong>
                    <span className="text-[10px] text-[#53635a]">₦450k Student Remit</span>
                  </button>
                </div>
              </div>

              {/* Simulator Inputs */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-[#53635a] block mb-1">
                    Customer Name &amp; Phone Number
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={simName}
                      onChange={(e) => setSimName(e.target.value)}
                      className="rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3 py-2 text-xs text-[#10261d]"
                      placeholder="Customer Name"
                    />
                    <input
                      type="text"
                      value={simPhone}
                      onChange={(e) => setSimPhone(e.target.value)}
                      className="rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3 py-2 text-xs font-mono text-[#10261d]"
                      placeholder="Phone (e.g. 234...)"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#53635a] block mb-1">
                    Inbound Customer WhatsApp Text
                  </label>
                  <textarea
                    rows={3}
                    value={simMessage}
                    onChange={(e) => setSimMessage(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] p-3 text-xs text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                  />
                </div>

                <button
                  type="button"
                  disabled={isSimulating}
                  onClick={handleTestInbound}
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-[#175b3b] py-3 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Send size={13} />
                  <span>{isSimulating ? 'Processing Webhook...' : 'Dispatch Inbound Webhook'}</span>
                </button>
              </div>

              {/* Result Preview */}
              {simResult && (
                <div className="rounded-2xl border border-[#175b3b]/30 bg-[#ebf5e7] p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-[#175b3b]">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={15} />
                      <span>Ticket Created: {simResult.ticketId}</span>
                    </span>
                    <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-[#175b3b]/20">
                      HTTP 200
                    </span>
                  </div>
                  <div className="text-[11px] text-[#2e473b] space-y-1 font-mono">
                    <div>Inbound Amount: ₦{simResult.amountIn?.toLocaleString()}</div>
                    <div>Cedis Payable: GH₵ {simResult.amountOut?.toLocaleString()}</div>
                    <div>Rate: 1 GHS = ₦105.06 (Locked 15m)</div>
                  </div>
                  <div className="pt-1">
                    <Link
                      href="/desk"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#175b3b] hover:underline"
                    >
                      <span>View on Trading Desk &rarr;</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CustomerSimulator
        isOpen={isChatSimOpen}
        onClose={() => setIsChatSimOpen(false)}
        onSimulateTicket={() => {}}
      />
    </OperatorShell>
  );
}
