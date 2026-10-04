'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Play,
  RotateCcw,
  Zap,
  Building2,
  Phone,
  Paperclip,
  Send,
  MoreVertical,
  Check,
} from 'lucide-react';

interface ChatStep {
  step: number;
  customerMsg?: string;
  botMsg?: string;
  deskStatus: string;
  deskAction: string;
  gevProbability: string;
}

const CHAT_STEPS: ChatStep[] = [
  {
    step: 1,
    customerMsg: 'Good day chief. I want to send ₦2,000,000 to Kumasi MTN MoMo. How much Cedis today?',
    botMsg: 'Welcome! Rate is locked: 1 GHS = ₦105.06. ₦2,000,000 = GH₵ 19,036.74. Rate holds firm for 15 minutes.',
    deskStatus: 'Rate Locked (15m Countdown)',
    deskAction: 'Trade intent logged · Order AKS-84920 created',
    gevProbability: 'Awaiting customer deposit',
  },
  {
    step: 2,
    customerMsg: 'Deal. Send your collection account, transferring right away.',
    botMsg: 'Pay ₦2,000,000 into GTBank | Acc: 0123984752 | Aksen Liquidity Services. Enforce narration: AKS-84920.',
    deskStatus: 'Bank Account Dispatched',
    deskAction: 'Collection account rotated (Safe within daily cap)',
    gevProbability: 'Monitoring bank credit notification',
  },
  {
    step: 3,
    customerMsg: 'Done! Attached transfer slip from my GTBank app. Recipient is 0244-192-019 (Alhaji Musa).',
    botMsg: 'Payment receipt received! Verifying transfer details against invoice AKS-84920... Your payout is queued for operator settlement.',
    deskStatus: 'Deposit Verified · Slip Authentic',
    deskAction: 'Payment matched GTBank account · Recipient identity verified',
    gevProbability: 'Risk: Low (0.6%) · Payout Cleared',
  },
  {
    step: 4,
    botMsg: 'Payment Confirmed! Your transfer of GH₵ 19,036.74 has been disbursed to MTN MoMo: 0244-192-019 (MUSA IBRAHIM KANO). Trans ID: MTN-918204. Thank you for trading with Aksen!',
    deskStatus: 'Disbursed & Reconciled',
    deskAction: 'Operator executed payout via MoMo phone in 38s',
    gevProbability: 'Trade settled & balanced in ledger',
  },
];

export function PhoneSimulator() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // Autoplay progression loop
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setActiveStep((prev) => (prev < 4 ? prev + 1 : 1));
      }, 700);
    }, 4500);

    return () => clearInterval(timer);
  }, [isPlaying]);

  const currentData = CHAT_STEPS[activeStep - 1];

  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 border-b border-[#e3ece1] bg-white overflow-hidden scroll-mt-16">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b] shadow-2xs">
              <span>LIVING INTERACTIVE SIMULATION</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#10261d] mt-2">
              Your Customers Stay on WhatsApp.
              <br />
              <span className="text-[#175b3b]">You Run an Institutional Desk.</span>
            </h2>
            <p className="text-base text-[#47584e] max-w-xl mt-1 leading-relaxed font-normal">
              Traders don't want to download another app. Watch below how a normal customer WhatsApp chat syncs in real-time with the operator's settlement terminal.
            </p>
          </div>

          {/* Simulation Controls */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-1 p-1 bg-[#ebf2e9] rounded-full border border-[#e3ece1]">
              {[1, 2, 3, 4].map((step) => (
                <button
                  key={step}
                  onClick={() => {
                    setIsPlaying(false);
                    setActiveStep(step);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                    activeStep === step
                      ? 'bg-[#10261d] text-white shadow-xs'
                      : 'text-[#47584e] hover:text-[#10261d]'
                  }`}
                >
                  Step {step}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 rounded-full border border-[#e3ece1] bg-white px-3.5 py-2 text-xs font-bold text-[#10261d] hover:bg-[#ebf2e9] transition-all cursor-pointer shadow-2xs"
            >
              {isPlaying ? <RotateCcw size={13} className="text-[#175b3b]" /> : <Play size={13} />}
              <span>{isPlaying ? 'Auto-Playing' : 'Play Demo'}</span>
            </button>
          </div>
        </div>

        {/* The Live Split Stage: WhatsApp Mobile Phone vs. Operator Desk Terminal */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Living Smartphone Frame (WhatsApp UI) */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="relative w-full max-w-[390px] rounded-[50px] border-[10px] border-[#10261d] bg-[#0c1317] shadow-2xl p-3 ring-1 ring-black/20 overflow-hidden">
              {/* Dynamic Island */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#10261d] rounded-full z-30 flex items-center justify-end px-3">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-900/60" />
              </div>

              {/* Phone Screen Container */}
              <div className="relative w-full rounded-[38px] bg-[#efeae2] overflow-hidden flex flex-col h-[650px] text-xs">
                {/* WhatsApp Chat Top Header */}
                <div className="bg-[#075e54] text-white px-4 pt-9 pb-3 flex items-center justify-between shadow-md z-20">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-[#128c7e] flex items-center justify-center font-bold text-white shadow-xs border border-white/20">
                        A
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25d366] border-2 border-[#075e54]" />
                    </div>
                    <div>
                      <div className="font-bold text-[14px] flex items-center gap-1.5 text-white">
                        <span>Aksen OTC Bureau</span>
                        <CheckCircle2 size={13} className="text-[#c2f576] fill-[#c2f576]/30" />
                      </div>
                      <span className="text-[11px] text-[#e0f2ed] font-medium block">Verified Business &middot; online</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-white">
                    <Phone size={16} />
                    <MoreVertical size={16} />
                  </div>
                </div>

                {/* WhatsApp Chat Messages Stream */}
                <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-[radial-gradient(#cfd5d8_1px,transparent_1px)] [background-size:16px_16px]">
                  {/* Encryption Notice */}
                  <div className="text-center">
                    <span className="inline-block bg-[#ffeecd] text-[#54656f] text-[10.5px] font-medium px-3 py-1 rounded-lg shadow-2xs">
                      🔒 End-to-end encrypted session
                    </span>
                  </div>

                  {/* Step 1 Customer Message */}
                  {activeStep >= 1 && (
                    <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="bg-[#d9fdd3] text-[#111b21] p-3 rounded-2xl rounded-tr-xs max-w-[88%] shadow-xs space-y-1">
                        <p className="text-[13px] leading-relaxed font-normal">{CHAT_STEPS[0].customerMsg}</p>
                        <div className="flex items-center justify-end gap-1 text-[10.5px] text-[#667781] font-mono">
                          <span>14:46</span>
                          <span className="text-[#53bdeb] font-bold">✓✓</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 1 Bot Quote Card */}
                  {activeStep >= 1 && (
                    <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-white text-[#111b21] p-3.5 rounded-2xl rounded-tl-xs max-w-[92%] shadow-xs space-y-2 border-l-4 border-l-[#128c7e]">
                        <p className="text-[13px] font-medium leading-relaxed text-[#111b21]">
                          {CHAT_STEPS[0].botMsg}
                        </p>
                        {/* Live 15-Minute Lock Pill in Chat */}
                        <div className="rounded-xl bg-[#f0f2f5] p-2.5 flex items-center justify-between font-mono text-[11.5px]">
                          <span className="text-[#47584e]">Locked Rate:</span>
                          <strong className="text-[#075e54] text-xs">1 GHS = ₦105.06</strong>
                        </div>
                        <div className="flex items-center justify-between text-[10.5px] text-[#667781]">
                          <span className="text-[#128c7e] font-bold flex items-center gap-1">
                            <Clock size={11} /> Rate holds firm for 15m
                          </span>
                          <span>14:46</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2 Customer Message & Bank Card */}
                  {activeStep >= 2 && (
                    <>
                      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="bg-[#d9fdd3] text-[#111b21] p-3 rounded-2xl rounded-tr-xs max-w-[88%] shadow-xs space-y-1">
                          <p className="text-[13px] leading-relaxed">{CHAT_STEPS[1].customerMsg}</p>
                          <div className="flex items-center justify-end gap-1 text-[10.5px] text-[#667781] font-mono">
                            <span>14:48</span>
                            <span className="text-[#53bdeb] font-bold">✓✓</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-white text-[#111b21] p-3.5 rounded-2xl rounded-tl-xs max-w-[92%] shadow-xs space-y-2 border-l-4 border-l-[#128c7e]">
                          <div className="font-bold text-[12.5px] text-[#075e54] flex items-center gap-1.5">
                            <Building2 size={15} />
                            <span>Collection Bank Details</span>
                          </div>
                          <div className="rounded-xl bg-[#f0f2f5] p-2.5 space-y-1.5 text-[11.5px] font-mono text-[#111b21]">
                            <div className="flex justify-between">
                              <span className="text-[#54656f]">Bank:</span>
                              <strong>GTBank Nigeria</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#54656f]">Account:</span>
                              <strong className="text-[#075e54] text-xs">0123984752</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#54656f]">Required Ref:</span>
                              <strong className="bg-[#ffeecd] px-1.5 py-0.5 rounded text-[#111b21]">AKS-84920</strong>
                            </div>
                          </div>
                          <div className="text-right text-[10.5px] text-[#667781]">14:48</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Step 3 Slip Upload & GEV Sentinel Verification Badge */}
                  {activeStep >= 3 && (
                    <>
                      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="bg-[#d9fdd3] text-[#111b21] p-3 rounded-2xl rounded-tr-xs max-w-[88%] shadow-xs space-y-2">
                          <div className="rounded-xl bg-black/5 p-2.5 flex items-center gap-2.5 border border-black/10">
                            <div className="w-8 h-8 rounded-lg bg-[#075e54] text-white flex items-center justify-center font-bold text-[11px]">
                              PDF
                            </div>
                            <div className="text-[11px]">
                              <span className="font-bold block text-[#111b21]">GTB_Receipt_2M.pdf</span>
                              <span className="text-[#54656f]">₦2,000,000.00 &middot; Confirmed</span>
                            </div>
                          </div>
                          <p className="text-[13px] leading-relaxed">{CHAT_STEPS[2].customerMsg}</p>
                          <div className="flex items-center justify-end gap-1 text-[10.5px] text-[#667781] font-mono">
                            <span>14:50</span>
                            <span className="text-[#53bdeb] font-bold">✓✓</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-[#eaf8ea] text-[#111b21] p-3.5 rounded-2xl rounded-tl-xs max-w-[92%] shadow-xs space-y-1.5 border border-[#8ce382]">
                          <div className="flex items-center gap-1.5 text-[#075e54] font-bold text-[12px]">
                            <ShieldCheck size={16} className="text-[#128c7e]" />
                            <span>Payment Integrity: Slip Verified</span>
                          </div>
                          <p className="text-[12px] text-[#111b21] leading-relaxed">
                            Bank transfer session authentic. Remitter name matches counterparty. Safe to disburse.
                          </p>
                          <div className="text-right text-[10.5px] text-[#667781]">14:51</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Step 4 Settlement Complete */}
                  {activeStep >= 4 && (
                    <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="bg-white text-[#111b21] p-3.5 rounded-2xl rounded-tl-xs max-w-[92%] shadow-md space-y-2 border-l-4 border-l-[#25d366]">
                        <div className="flex items-center gap-1.5 text-[#075e54] font-bold text-[12.5px]">
                          <CheckCircle2 size={16} className="text-[#25d366]" />
                          <span>Payout Disbursed to MTN MoMo</span>
                        </div>
                        <div className="rounded-xl bg-[#f0f2f5] p-2.5 space-y-1 text-[11.5px] font-mono text-[#111b21]">
                          <div className="flex justify-between">
                            <span className="text-[#54656f]">Amount Paid:</span>
                            <strong className="text-[#075e54]">GH₵ 19,036.74</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#54656f]">MTN MoMo Ref:</span>
                            <strong>MTN-918204</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#54656f]">Beneficiary:</span>
                            <strong>MUSA IBRAHIM KANO</strong>
                          </div>
                        </div>
                        <div className="text-right text-[10.5px] text-[#667781]">14:52</div>
                      </div>
                    </div>
                  )}

                  {/* Living Typing Bubble Indicator */}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white text-[#111b21] px-3.5 py-2 rounded-2xl rounded-tl-xs shadow-xs flex items-center gap-1.5 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#128c7e]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#128c7e]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#128c7e]" />
                        <span className="ml-1 font-mono text-[#075e54] font-bold">Desk is typing...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* WhatsApp Bottom Chat Input */}
                <div className="bg-[#f0f2f5] p-2.5 flex items-center gap-2 border-t border-[#d1d7db] z-20">
                  <div className="flex-1 bg-white rounded-full px-4 py-2 text-[#54656f] text-xs flex items-center justify-between shadow-2xs font-medium">
                    <span>Message Aksen Desk...</span>
                    <Paperclip size={15} className="text-[#54656f]" />
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-xs">
                    <Send size={14} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Synchronized Operator Cockpit Telemetry */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#175b3b] font-bold">
                OPERATOR DESK WORKFLOW
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold text-[#10261d]">
                See what happens on the operator's screen
              </h3>
              <p className="text-sm text-[#47584e] leading-relaxed font-normal">
                As the customer chats on their smartphone in Kano or Lagos, your institutional desk updates in real-time with zero manual data entry.
              </p>
            </div>

            {/* Operator Telemetry Card */}
            <div className="rounded-3xl border border-[#e3ece1] bg-[#f9faf7] p-6 sm:p-7 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#10261d]">
                    TICKET REF: AKS-84920
                  </span>
                </div>
                <span className="text-xs font-mono font-bold bg-white border border-[#e3ece1] px-3 py-1 rounded-full text-[#175b3b]">
                  {currentData.deskStatus}
                </span>
              </div>

              {/* Progress Stepper Bars */}
              <div className="grid grid-cols-4 gap-2.5">
                {[1, 2, 3, 4].map((s) => (
                  <div key={s} className="space-y-1">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        activeStep >= s ? 'bg-[#175b3b]' : 'bg-[#e3ece1]'
                      }`}
                    />
                    <span className="text-[11px] font-mono text-[#53635a] font-semibold block">
                      Step 0{s}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live Action Inspector */}
              <div className="rounded-2xl border border-[#e3ece1] bg-white p-4.5 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#53635a] font-medium">Desk Action:</span>
                  <strong className="text-[#10261d] font-mono font-bold">{currentData.deskAction}</strong>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#e3ece1]">
                  <span className="text-[#53635a] font-medium">Risk Assessment:</span>
                  <strong className="text-[#175b3b] font-mono font-bold">{currentData.gevProbability}</strong>
                </div>
              </div>

              {/* Feature Highlights */}
              <div className="grid grid-cols-2 gap-3.5 text-xs">
                <div className="p-3.5 rounded-xl bg-white border border-[#e3ece1]">
                  <div className="font-bold text-[#10261d] flex items-center gap-1.5 mb-1">
                    <CheckCircle2 size={15} className="text-[#175b3b]" />
                    <span className="text-xs">Familiar Customer Chat</span>
                  </div>
                  <p className="text-[11.5px] text-[#53635a] leading-relaxed">
                    Counterparties trade directly through WhatsApp. No app friction or learning curve.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-[#e3ece1]">
                  <div className="font-bold text-[#10261d] flex items-center gap-1.5 mb-1">
                    <Zap size={15} className="text-[#175b3b]" />
                    <span className="text-xs">100% Payout Control</span>
                  </div>
                  <p className="text-[11.5px] text-[#53635a] leading-relaxed">
                    Intake and audit run automatically, while you execute payouts directly from your banking app.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => {
                    setActiveStep((prev) => (prev < 4 ? prev + 1 : 1));
                  }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[#10261d] py-3 text-xs font-bold text-white hover:bg-[#175b3b] transition-all cursor-pointer shadow-xs"
                >
                  <span>Step Forward Simulation &rarr;</span>
                </button>
                <Link
                  href="/desk"
                  className="flex items-center justify-center gap-1.5 rounded-full border border-[#175b3b] bg-[#ebf2e9] px-4 py-3 text-xs font-bold text-[#175b3b] hover:bg-[#d8e8d4] transition-all cursor-pointer text-center"
                >
                  <span>Launch Operator Desk</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
