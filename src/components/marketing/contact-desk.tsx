'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, MapPin, Clock, Send, 
  CheckCircle2, ArrowRight, X,
  RotateCcw, Sparkles, Phone, ShieldCheck, UserCheck, ChevronRight
} from 'lucide-react';

interface ContactDeskProps {
  isModal?: boolean;
  onClose?: () => void;
}

// Configurable target WhatsApp phone number (international format without '+' or spaces)
export const DEFAULT_DESK_WHATSAPP_NUMBER = 
  process.env.NEXT_PUBLIC_WHATSAPP_DESK_NUMBER || '2349155833108';

export const DISPLAY_DESK_WHATSAPP_NUMBER = '+234 915 583 3108';

type InquiryType = 'quote' | 'bureau_setup' | 'syndicate' | 'general';

interface ExtractedTradeState {
  inquiryType: InquiryType;
  amount?: string;
  corridor?: 'NGN -> GHS' | 'GHS -> NGN' | 'UNKNOWN';
  settlementMethod?: string;
  counterpartyName?: string;
  whatsappPhone?: string;
  isComplete: boolean;
}

interface Message {
  id: string;
  sender: 'desk' | 'user';
  text: string;
  time?: string;
}

const QUICK_SUGGESTIONS = [
  '💱 Swap ₦2,500,000 to Accra MTN MoMo',
  '💱 High-Volume Quote for ₦10M+ Consignment',
  '🏢 Setup Bureau Desk Operating Software',
  '🤝 Float Capital Syndicate (₦20M - ₦50M)',
  '🇬🇭 Swap GH₵ 25,000 to Lagos Bank Deposit',
];

export function ContactDesk({ isModal, onClose }: ContactDeskProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm-1',
      sender: 'desk',
      text: 'Good day! Welcome to the Aksen OTC Trading Desk. How can our clearing officers assist you today? Feel free to type your trade request in natural language.',
      time: 'Just now',
    },
  ]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isDeskTyping, setIsDeskTyping] = useState<boolean>(false);
  const [isDispatched, setIsDispatched] = useState<boolean>(false);
  const [tradeState, setTradeState] = useState<ExtractedTradeState>({
    inquiryType: 'quote',
    corridor: 'NGN -> GHS',
    settlementMethod: 'MTN MoMo',
    isComplete: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat stream to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isDeskTyping]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Send message through Conversational Concierge API
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text || isDeskTyping) return;

    setInputVal('');

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsDeskTyping(true);

    try {
      const response = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
          currentState: tradeState,
        }),
      });

      if (!response.ok) {
        throw new Error('Concierge service responded with error');
      }

      const data = await response.json();

      if (data.extracted) {
        setTradeState((prev) => ({
          ...prev,
          ...data.extracted,
        }));
      }

      const deskMsg: Message = {
        id: `desk-${Date.now()}`,
        sender: 'desk',
        text: data.reply || 'Understood. Let our clearing officer assist you on WhatsApp.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, deskMsg]);
    } catch (err) {
      // Deterministic client-side fallback in case of total network disconnect
      console.warn('Falling back to local concierge intelligence:', err);
      const deskMsg: Message = {
        id: `desk-${Date.now()}`,
        sender: 'desk',
        text: `Understood! I have logged your request. Please share your WhatsApp number or tap the green button below to connect with our trading officer at ${DISPLAY_DESK_WHATSAPP_NUMBER}.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, deskMsg]);
    } finally {
      setIsDeskTyping(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  // Reset conversation
  const handleReset = () => {
    setMessages([
      {
        id: 'm-1',
        sender: 'desk',
        text: 'Good day! Welcome to the Aksen OTC Trading Desk. How can our clearing officers assist you today? Feel free to type your trade request in natural language.',
        time: 'Just now',
      },
    ]);
    setInputVal('');
    setIsDeskTyping(false);
    setIsDispatched(false);
    setTradeState({
      inquiryType: 'quote',
      corridor: 'NGN -> GHS',
      settlementMethod: 'MTN MoMo',
      isComplete: false,
    });
  };

  // Construct WhatsApp bundle text
  const inquiryTypeLabel = 
    tradeState.inquiryType === 'quote' ? 'Rate Quote (NGN ⇄ GHS)' :
    tradeState.inquiryType === 'bureau_setup' ? 'Bureau Desk Setup (Operating Software)' :
    tradeState.inquiryType === 'syndicate' ? 'Liquidity Syndicate (Float Capital)' :
    'General OTC Trade Inquiry';

  const bundledWhatsAppText = `*AKSEN OTC DESK INQUIRY*
━━━━━━━━━━━━━━━━━━━━
*Request Type:* ${inquiryTypeLabel}
*Volume / Scope:* ${tradeState.amount || 'Indicative Inquiry'}
*Corridor:* ${tradeState.corridor || 'NGN -> GHS'} (${tradeState.settlementMethod || 'MTN MoMo'})
*Counterparty:* ${tradeState.counterpartyName || 'Institutional Trader'}
*WhatsApp Contact:* ${tradeState.whatsappPhone || 'Direct App Connect'}
*Target Clearing Desk:* ${DISPLAY_DESK_WHATSAPP_NUMBER}
*Rate Guarantee:* 15-Min Guaranteed Lock &bull; Zero Commission
━━━━━━━━━━━━━━━━━━━━
_Initiated via Aksen OTC Conversational Concierge. Please confirm quote / settlement instructions._`;

  const waLink = `https://wa.me/${DEFAULT_DESK_WHATSAPP_NUMBER}?text=${encodeURIComponent(bundledWhatsAppText)}`;

  // Dispatch to WhatsApp
  const handleDispatchToWhatsApp = async () => {
    // 1. Asynchronously log ticket to Neon Postgres for operator visibility
    try {
      fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONCIERGE_INQUIRY',
          channel: 'WEB_CONCIERGE',
          customerName: tradeState.counterpartyName || 'Web Counterparty',
          phone: tradeState.whatsappPhone || DISPLAY_DESK_WHATSAPP_NUMBER,
          amount: tradeState.amount || '1500000',
          corridor: tradeState.corridor || 'NGN -> GHS',
          settlementMethod: tradeState.settlementMethod || 'MTN MoMo',
          note: `${inquiryTypeLabel}: ${tradeState.amount || 'Standard Trade'}`,
          transcript: messages.map((m) => ({
            sender: m.sender === 'user' ? 'customer' : 'bot',
            time: m.time || '14:38',
            text: m.text,
          })),
        }),
      }).catch(() => {});
    } catch (e) {
      // Non-blocking
    }

    // 2. Open WhatsApp link to user's phone number
    window.open(waLink, '_blank', 'noopener,noreferrer');
    setIsDispatched(true);
  };

  const hasSomeExtractedData = Boolean(
    tradeState.amount || tradeState.counterpartyName || tradeState.whatsappPhone || messages.length > 2
  );

  const content = (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="space-y-2 text-left">
        <div className="inline-flex items-center rounded-full border border-[#e3ece1] bg-white px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b] shadow-2xs">
          <span>DIRECT OTC DESK ACCESS</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#10261d]">
          Contact the West Africa Trading Desk
        </h2>
        <p className="text-xs sm:text-sm text-[#53635a] max-w-xl leading-relaxed">
          Need a custom high-volume quote, operator onboarding, or direct syndicate partnership? Speak with our conversational concierge or connect directly with our liquidity officers in Lagos and Accra.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Direct WhatsApp & Physical Locations (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 text-left">
          {/* WhatsApp Direct Action Banner */}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-4 p-5 rounded-3xl border border-[#175b3b]/30 bg-gradient-to-br from-[#10261d] to-[#153327] text-white hover:border-[#c2f576] transition-all group shadow-md"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#175b3b] text-[#c2f576] group-hover:scale-105 transition-transform">
              <MessageSquare size={22} />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <strong className="text-sm font-bold text-white">Live WhatsApp Desk</strong>
                <span className="rounded-full bg-[#175b3b] px-2 py-0.5 text-[0.5625rem] font-mono font-bold text-[#c2f576]">
                  INSTANT
                </span>
              </div>
              <p className="text-xs text-[#cbd8c8] leading-relaxed">
                Connect directly with a human trading officer. Active for NGN ⇄ GHS rate quotes 24/7.
              </p>
              <div className="pt-1 text-xs font-mono font-bold text-[#c2f576] flex items-center gap-1.5">
                <span>{DISPLAY_DESK_WHATSAPP_NUMBER}</span>
                <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </a>

          {/* Real-time Parsed Trade Preview Ticket (If user has typed anything) */}
          {hasSomeExtractedData && (
            <div className="rounded-3xl border border-[#175b3b]/20 bg-[#f1f8ee] p-5 space-y-3 shadow-2xs animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-[#175b3b]/20 pb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#10261d]">
                  <Sparkles size={14} className="text-[#175b3b]" />
                  <span>LIVE TICKET IN PROGRESS</span>
                </div>
                <span className="rounded-full bg-[#175b3b] text-[#c2f576] px-2 py-0.5 text-[0.5625rem] font-mono font-bold">
                  {tradeState.isComplete ? 'READY' : 'EXTRACTING'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-white/80 p-2.5 rounded-xl border border-[#e3ece1]">
                  <span className="text-[0.625rem] text-[#798d81] block">VOLUME</span>
                  <strong className="text-[#10261d] text-[0.6875rem] truncate block">
                    {tradeState.amount || 'Pending input'}
                  </strong>
                </div>

                <div className="bg-white/80 p-2.5 rounded-xl border border-[#e3ece1]">
                  <span className="text-[0.625rem] text-[#798d81] block">CORRIDOR</span>
                  <strong className="text-[#10261d] text-[0.6875rem] truncate block">
                    {tradeState.corridor} ({tradeState.settlementMethod})
                  </strong>
                </div>

                <div className="bg-white/80 p-2.5 rounded-xl border border-[#e3ece1]">
                  <span className="text-[0.625rem] text-[#798d81] block">COUNTERPARTY</span>
                  <strong className="text-[#10261d] text-[0.6875rem] truncate block">
                    {tradeState.counterpartyName || 'In discussion'}
                  </strong>
                </div>

                <div className="bg-white/80 p-2.5 rounded-xl border border-[#e3ece1]">
                  <span className="text-[0.625rem] text-[#798d81] block">WHATSAPP</span>
                  <strong className="text-[#10261d] text-[0.6875rem] truncate block">
                    {tradeState.whatsappPhone || 'Awaiting phone'}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDispatchToWhatsApp}
                className="w-full mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[#25d366] hover:bg-[#20ba5a] text-[#075e54] hover:text-white py-3 px-4 font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                <MessageSquare size={15} className="fill-current" />
                <span>Dispatch Ticket to WhatsApp Desk</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Physical Desks */}
          <div className="rounded-3xl border border-[#e3ece1] bg-white p-5 space-y-4 shadow-2xs">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#798d81]">
              Physical Settlement Desks
            </h4>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-[#175b3b] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-[#10261d] block">Lagos Clearing Desk</strong>
                  <span className="text-[#53635a]">Allen Avenue, Ikeja &bull; Balogun Financial Market, Lagos Island</span>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-[#e3ece1]">
                <MapPin size={16} className="text-[#175b3b] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-[#10261d] block">Accra Clearing Desk</strong>
                  <span className="text-[#53635a]">Cowlane / Circle Commercial Corridor, Accra Central</span>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-[#e3ece1]">
                <Clock size={16} className="text-[#175b3b] flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold text-[#10261d] block">Operating Windows</strong>
                  <span className="text-[#53635a]">24/7 Rate Quoting &bull; Instant MoMo &amp; Bank Settlement</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Conversational Natural Language Intake (7 Cols) */}
        <div className="lg:col-span-7 rounded-3xl border border-[#e3ece1] bg-white shadow-sm overflow-hidden flex flex-col min-h-[33.75rem]">
          {/* Concierge Chat Header */}
          <div className="p-4 sm:px-6 border-b border-[#e3ece1] bg-[#f9faf7] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-[#10261d] text-[#c2f576] flex items-center justify-center font-bold font-mono text-xs shadow-xs">
                  A
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25d366] border-2 border-white" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#10261d] flex items-center gap-1.5">
                  <span>Aksen Desk Concierge</span>
                  <span className="rounded-full bg-[#ebf5e7] px-2 py-0.5 text-[0.5938rem] font-mono text-[#175b3b] font-bold">
                    NATURAL LANGUAGE
                  </span>
                </h3>
                <span className="text-[0.6563rem] text-[#53635a] block">
                  Desk Target: {DISPLAY_DESK_WHATSAPP_NUMBER} &middot; 24/7 Liquidity
                </span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1 rounded-full border border-[#e3ece1] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-[#53635a] hover:text-[#10261d] hover:bg-[#ebf2e9] transition-all cursor-pointer"
              title="Reset Conversation"
            >
              <RotateCcw size={11} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>

          {/* Conversation Messages Stream */}
          <div className="flex-1 p-4 sm:p-6 space-y-3.5 overflow-y-auto max-h-[22.5rem] bg-[radial-gradient(#e7ece5_1px,transparent_1px)] [background-size:16px_16px]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3 sm:p-3.5 text-xs sm:text-[0.8125rem] leading-relaxed shadow-2xs ${
                    m.sender === 'user'
                      ? 'bg-[#175b3b] text-white rounded-tr-xs'
                      : 'bg-white text-[#10261d] border border-[#e3ece1] rounded-tl-xs'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.time && (
                    <span
                      className={`block text-[0.5938rem] font-mono mt-1 text-right ${
                        m.sender === 'user' ? 'text-[#c2f576]/80' : 'text-[#798d81]'
                      }`}
                    >
                      {m.time}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {isDeskTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#e3ece1] px-3.5 py-2 rounded-2xl rounded-tl-xs shadow-2xs flex items-center gap-1.5 text-xs text-[#53635a]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#175b3b] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#175b3b] animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#175b3b] animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[0.625rem] font-mono text-[#798d81] ml-1">Desk officer reviewing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Strip */}
          <div className="px-4 py-2 border-t border-[#e3ece1] bg-[#fbfdfa] overflow-x-auto flex items-center gap-1.5 no-scrollbar">
            <span className="text-[0.625rem] font-mono text-[#798d81] font-bold uppercase whitespace-nowrap mr-1">
              Suggestions:
            </span>
            {QUICK_SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                disabled={isDeskTyping}
                onClick={() => handleSendMessage(sug)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full border border-[#e3ece1] bg-white hover:bg-[#ebf5e7] hover:border-[#175b3b] text-[0.6875rem] font-medium text-[#10261d] transition-all cursor-pointer disabled:opacity-50"
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Omnipresent Natural Language Chat Input Zone */}
          <div className="p-4 sm:p-5 border-t border-[#e3ece1] bg-white space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Type your message (e.g. 'I want to exchange ₦3M for Kumasi MoMo today')..."
                disabled={isDeskTyping}
                className="flex-1 rounded-2xl border border-[#e3ece1] bg-[#f9faf7] px-4 py-3 text-xs sm:text-sm text-[#10261d] placeholder-[#798d81] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isDeskTyping}
                className="flex items-center justify-center h-11 w-11 rounded-2xl bg-[#175b3b] text-white hover:bg-[#0f4329] disabled:opacity-40 transition-all cursor-pointer shadow-xs flex-shrink-0"
                title="Send Message"
              >
                <Send size={16} />
              </button>
            </form>

            {/* Direct WhatsApp Action Footnote */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-[0.6875rem] text-[#53635a]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#25d366]" />
                <span>
                  Target WhatsApp: <strong className="text-[#10261d]">{DISPLAY_DESK_WHATSAPP_NUMBER}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleDispatchToWhatsApp}
                className="text-[#175b3b] font-bold hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <span>Bundle &amp; Open WhatsApp Now</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {isDispatched && (
              <div className="rounded-xl bg-[#eaf8ea] border border-[#8ce382] p-2.5 text-center text-xs text-[#175b3b] font-medium animate-in fade-in">
                ✓ WhatsApp opened with your bundled trade request! Clearing officer will respond within 2 minutes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl rounded-3xl bg-[#f9faf7] p-6 sm:p-8 shadow-2xl border border-[#e3ece1] max-h-[90vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 rounded-full p-2 text-[#53635a] hover:bg-neutral-200 hover:text-[#10261d] transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
          {content}
        </div>
      </div>
    );
  }

  return (
    <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8 border-b border-[#e3ece1] bg-[#f9faf7] scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        {content}
      </div>
    </section>
  );
}
