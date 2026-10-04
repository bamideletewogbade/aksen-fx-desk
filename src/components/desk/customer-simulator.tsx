'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  X, Send, Paperclip, RotateCcw, Check, CheckCheck, 
  ShieldCheck, ArrowRight, Lock, Sparkles, MessageSquare,
  Phone, Video, MoreVertical, Image as ImageIcon
} from 'lucide-react';
import { TradeTicket } from '@/types/desk';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot';
  time: string;
  text: string;
  image?: string;
}

interface CustomerSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulateTicket: (newTicket: TradeTicket) => void;
}

const INITIAL_TRADE_STATE = {
  stage: 'INIT' as const,
  corridor: 'NGN_TO_GHS' as const,
  amountIn: 1500000,
  amountOut: 14277.56,
  rate: 105.06,
  ticketId: null as string | null,
  customerName: 'Alhaji Bello',
  customerPhone: '+234 803 492 8810',
  momoRecipient: {
    network: 'MTN MoMo' as const,
    phoneNumber: '0245719646',
    registeredName: 'BELLO IBRAHIM KANO',
  },
  collectionBank: {
    name: 'GTBank Nigeria',
    accountNumber: '0123984752',
    accountName: 'Aksen Liquidity Services Ltd',
  },
};

export function CustomerSimulator({ isOpen, onClose, onSimulateTicket }: CustomerSimulatorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [tradeState, setTradeState] = useState(INITIAL_TRADE_STATE);
  const [latestTicket, setLatestTicket] = useState<TradeTicket | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  if (!isOpen) return null;

  const handleReset = () => {
    setMessages([]);
    setInputText('');
    setTradeState(INITIAL_TRADE_STATE);
    setLatestTicket(null);
    setIsTyping(false);
  };

  const sendMessage = async (textToSend: string, imageAttachment?: string, actionType?: 'SIMULATE_PAYMENT') => {
    const text = textToSend.trim();
    if (!text && !imageAttachment && !actionType) return;

    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'customer',
      time: timeNow,
      text: text || (imageAttachment ? '[Uploaded Bank Transfer Slip]' : 'Transferred ₦1,500,000 NGN'),
      image: imageAttachment,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/whatsapp/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            sender: m.sender,
            time: m.time,
            text: m.text,
            image: m.image,
          })),
          currentState: tradeState,
          action: actionType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.reply) {
        const botReplyMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: data.reply,
        };
        setMessages((prev) => [...prev, botReplyMsg]);

        if (data.updatedTradeState) {
          setTradeState(data.updatedTradeState);
        }

        if (data.createdTicket) {
          setLatestTicket(data.createdTicket);
          onSimulateTicket(data.createdTicket);
        }
      }
    } catch (e) {
      console.error('Chat error:', e);
      // Fallback response if offline
      const fallbackReply: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `✅ *Aksen OTC Live Desk:* Today's desk rate is *1 GHS = 105.06 NGN*. Are you changing Naira to Ghana Cedis or Cedis to Naira?`,
      };
      setMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
    }
  };

  const handleSimulateReceiptUpload = () => {
    sendMessage(
      `[Attached Genuine GTBank Transfer Slip] Narration: ${tradeState.ticketId || 'AKS-73912'}`,
      '/images/genuine_gtbank_slip.png',
      'SIMULATE_PAYMENT'
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#efeae2] shadow-2xl border border-[#d1d7db] flex flex-col h-[90vh] max-h-[780px] overflow-hidden text-left">
        {/* WhatsApp Mobile Top Header */}
        <div className="bg-[#075e54] text-white px-3 sm:px-4 py-2.5 flex items-center justify-between shadow-sm flex-shrink-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Contact Avatar with Verified Badge */}
            <div className="relative flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-[#128c7e] text-[#c2f576] flex items-center justify-center font-bold text-sm shadow-xs border border-white/20">
                A
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[#25d366] border-2 border-[#075e54] flex items-center justify-center text-[8px] text-white font-bold">
                ✓
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white block truncate leading-tight">
                  Aksen OTC Desk &middot; Official
                </span>
              </div>
              <span className="text-[11px] text-[#c2f576] block leading-tight font-medium">
                {isTyping ? 'typing...' : 'online &bull; WhatsApp Business'}
              </span>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-all cursor-pointer"
              title="Reset to blank state"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer"
              title="Close simulator"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Live Status Banner */}
        <div className="bg-[#e7f7e3] border-b border-[#cde8c7] px-3 py-1.5 flex items-center justify-between text-[11px] text-[#1c4728] font-mono flex-shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <Sparkles size={12} className="text-[#175b3b] flex-shrink-0" />
            <span className="truncate">Live AI Agent Intake &middot; 1 GHS = 105.06 NGN</span>
          </div>
          {latestTicket && (
            <span className="bg-[#175b3b] text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
              {latestTicket.id} QUEUED
            </span>
          )}
        </div>

        {/* WhatsApp Chat Message Area */}
        <div 
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3"
          style={{
            backgroundImage: `radial-gradient(#d3c9be 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
            backgroundColor: '#efeae2',
          }}
        >
          {/* Encryption Notice */}
          <div className="flex justify-center my-1">
            <div className="bg-[#ffeecd] border border-[#f5dfb8] rounded-xl px-3 py-1.5 max-w-xs text-center shadow-2xs">
              <span className="text-[10px] text-[#5c4a1e] leading-snug flex items-center justify-center gap-1 font-sans">
                <Lock size={10} className="text-[#a17e29] flex-shrink-0" />
                <span>Messages are end-to-end encrypted with Aksen Sentinel &amp; GEV System 1.</span>
              </span>
            </div>
          </div>

          {/* Blank State Welcome Card if no messages yet */}
          {messages.length === 0 && (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-[#075e54]/10 text-[#075e54] flex items-center justify-center mx-auto shadow-xs">
                <MessageSquare size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#10261d]">Blank State Ready</h4>
                <p className="text-xs text-[#53635a] max-w-xs mx-auto">
                  Type a natural language message below or click a suggestion chip to speak with the AI agent.
                </p>
              </div>
            </div>
          )}

          {/* Chat Bubbles */}
          {messages.map((m) => {
            const isCustomer = m.sender === 'customer';
            return (
              <div
                key={m.id}
                className={`flex ${isCustomer ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}
              >
                <div
                  className={`relative max-w-[82%] sm:max-w-[76%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs space-y-1.5 ${
                    isCustomer
                      ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-xs'
                      : 'bg-white text-[#111b21] rounded-tl-xs'
                  }`}
                >
                  {/* Image attachment if any */}
                  {m.image && (
                    <div className="rounded-xl overflow-hidden border border-black/10 bg-black/5 p-2 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-[#175b3b] text-white flex items-center justify-center flex-shrink-0 font-bold text-xs">
                        NIP
                      </div>
                      <div className="text-[11px] leading-tight truncate">
                        <strong className="block text-[#10261d]">gtbank_transfer_slip.png</strong>
                        <span className="text-[10px] text-[#53635a]">NIBSS Genuine Deposit Proof</span>
                      </div>
                    </div>
                  )}

                  {/* Message Body with Bold / Formatting preservation */}
                  <div className="whitespace-pre-wrap leading-relaxed font-sans text-xs">
                    {m.text}
                  </div>

                  {/* Message Timestamp & Checkmarks */}
                  <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] select-none pt-0.5">
                    <span>{m.time}</span>
                    {isCustomer && (
                      <CheckCheck size={14} className="text-[#53bdeb]" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-xs px-3 py-2 text-xs shadow-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#128c7e] animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#128c7e] animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#128c7e] animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion Chips Strip */}
        <div className="px-3 py-2 bg-[#f0f2f5] border-t border-[#d1d7db] flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
          <button
            type="button"
            onClick={() => sendMessage('Hi, I want to change money')}
            disabled={isTyping}
            className="px-2.5 py-1 rounded-full bg-white border border-[#d1d7db] text-[11px] text-[#111b21] hover:bg-neutral-100 font-medium whitespace-nowrap cursor-pointer transition-all shadow-2xs"
          >
            👋 Hi, I want to change money
          </button>

          <button
            type="button"
            onClick={() => sendMessage('I want to send 1,500,000 Naira to Ghana MoMo')}
            disabled={isTyping}
            className="px-2.5 py-1 rounded-full bg-white border border-[#d1d7db] text-[11px] text-[#111b21] hover:bg-neutral-100 font-medium whitespace-nowrap cursor-pointer transition-all shadow-2xs"
          >
            ₦ Swap ₦1.5M to Ghana MoMo
          </button>

          <button
            type="button"
            onClick={() => sendMessage('MTN MoMo 0245719646 Kofi Mensah')}
            disabled={isTyping}
            className="px-2.5 py-1 rounded-full bg-white border border-[#d1d7db] text-[11px] text-[#111b21] hover:bg-neutral-100 font-medium whitespace-nowrap cursor-pointer transition-all shadow-2xs"
          >
            📱 MTN 0245719646 Kofi Mensah
          </button>

          <button
            type="button"
            onClick={handleSimulateReceiptUpload}
            disabled={isTyping}
            className="px-2.5 py-1 rounded-full bg-[#e7f7e3] border border-[#a8df9e] text-[11px] text-[#175b3b] hover:bg-[#d5f0ce] font-bold whitespace-nowrap cursor-pointer transition-all shadow-2xs flex items-center gap-1"
          >
            <Paperclip size={11} />
            <span>Simulate Bank Slip</span>
          </button>
        </div>

        {/* Bottom Input Form */}
        <form
          onSubmit={handleSendForm}
          className="bg-[#f0f2f5] px-3 py-2.5 flex items-center gap-2 border-t border-[#d1d7db] flex-shrink-0"
        >
          {/* Paperclip Button */}
          <button
            type="button"
            onClick={handleSimulateReceiptUpload}
            title="Simulate attaching bank slip"
            className="p-2 text-[#54656f] hover:text-[#111b21] hover:bg-white rounded-full transition-all cursor-pointer flex-shrink-0"
          >
            <Paperclip size={18} />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message (e.g. 'hi i want to change money')..."
            className="flex-1 bg-white rounded-2xl px-4 py-2.5 text-xs text-[#111b21] placeholder-[#667781] border border-white focus:outline-none focus:ring-1 focus:ring-[#075e54] shadow-2xs"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="h-9 w-9 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white flex items-center justify-center disabled:opacity-40 transition-all cursor-pointer shadow-xs flex-shrink-0"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
