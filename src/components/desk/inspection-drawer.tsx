'use client';

import { useState } from 'react';
import { X, ShieldCheck, AlertTriangle, CheckCircle2, ArrowRight, MessageSquare, Clock, Landmark, Phone, ExternalLink, Lock, Copy, Check } from 'lucide-react';
import { TradeTicket } from '@/types/desk';

interface InspectionDrawerProps {
  ticket: TradeTicket | null;
  onClose: () => void;
  onDisburse?: (ticketId: string) => void;
  onBlockRisk?: (ticketId: string) => void;
}

export function InspectionDrawer({
  ticket,
  onClose,
  onDisburse,
  onBlockRisk,
}: InspectionDrawerProps) {
  const [isCopied, setIsCopied] = useState(false);

  if (!ticket) return null;

  const handleCopyPayoutInfo = () => {
    if (!ticket) return;
    const info = `${ticket.momoRecipient.network} · ${ticket.momoRecipient.phoneNumber} · ${ticket.momoRecipient.registeredName} · GH₵ ${ticket.amountOut.toLocaleString()}`;
    navigator.clipboard.writeText(info);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const isSafe = ticket.status === 'SAFE_TO_DISBURSE';
  const isFlagged = ticket.status === 'FLAGGED_RISK';
  const isDisbursed = ticket.status === 'DISBURSED';
  const isAwaiting = ticket.status === 'AWAITING_PAYMENT';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-[#e3ece1] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#e3ece1] px-6 py-4 bg-[#f9faf7]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-[#10261d]">{ticket.id}</span>
            <span className="text-xs text-[#53635a]">&middot; Created {ticket.createdAt}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isSafe
                  ? 'bg-[#ebf2e9] text-[#175b3b]'
                  : isFlagged
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : isDisbursed
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {isSafe
                ? 'Safe to Disburse'
                : isFlagged
                ? 'Flagged: High Risk'
                : isDisbursed
                ? 'Disbursed & Settled'
                : 'Awaiting Bank Credit'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#53635a] hover:bg-[#e3ece1] hover:text-[#10261d] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Trade Summary Card */}
          <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-5">
            <div className="flex items-center justify-between text-xs text-[#53635a] mb-2 font-mono uppercase">
              <span>Customer: {ticket.customerName}</span>
              <span>{ticket.whatsappPhone}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-y border-[#e3ece1]/80">
              <div>
                <span className="text-[11px] text-[#53635a] block">Inbound Bank Credit</span>
                <span className="text-xl font-bold font-mono text-[#10261d]">
                  ₦{ticket.amountIn.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#53635a] block">
                  Via {ticket.collectionBank.name} ({ticket.collectionBank.accountNumber})
                </span>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-[#53635a] block">Outbound MoMo Payout</span>
                <span className="text-xl font-bold font-mono text-[#175b3b]">
                  GH₵ {ticket.amountOut.toLocaleString()}
                </span>
                <span className="text-[11px] font-medium text-[#10261d] block">
                  {ticket.momoRecipient.network} &middot; {ticket.momoRecipient.phoneNumber}
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-[#53635a]">
              <span>Locked Rate: 1 GHS = {ticket.rate} NGN</span>
              <span>Ref: {ticket.collectionBank.narration}</span>
            </div>
          </div>

          {/* GEV Sentinel Forensics Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#10261d] flex items-center gap-1.5">
                <ShieldCheck size={14} className={isSafe ? 'text-[#175b3b]' : 'text-red-600'} />
                <span>GEV Forensic Verification</span>
              </h3>
              <span className="text-[11px] font-mono text-[#53635a]">
                Bayesian Prior: P(Fraud) = {(ticket.gevSystem1.probabilityFraud * 100).toFixed(1)}%
              </span>
            </div>

            {/* System 1 Status Banner */}
            {isSafe && (
              <div className="rounded-xl border border-[#c2f576] bg-[#f2fce2] p-4 text-[#10261d] space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#175b3b]" />
                  <span className="font-bold text-xs text-[#175b3b]">System 1 Fast-Path: All 5 Gates Passed</span>
                </div>
                <p className="text-xs text-[#53635a] leading-relaxed">
                  Remitter identity matches WhatsApp contact and recipient MoMo wallet. Subpixel raster analysis shows no font manipulation. NIBSS session is authentic.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
                  <div className="bg-white/80 rounded-lg p-2 border border-[#e3ece1]">
                    <span className="text-[#53635a] block">3-Way KYC Match:</span>
                    <strong className="text-[#175b3b]">100% Verified</strong>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2 border border-[#e3ece1]">
                    <span className="text-[#53635a] block">Pixel Baseline:</span>
                    <strong className="text-[#175b3b]">Pass (&Delta; 0.2&sigma;)</strong>
                  </div>
                </div>
              </div>
            )}

            {isFlagged && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 space-y-3">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle size={17} />
                  <span className="font-bold text-xs uppercase tracking-wide">
                    System 1 Alert: High-Risk Anomaly Detected
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-red-900 bg-white/70 p-3 rounded-lg border border-red-200">
                  <div className="font-semibold text-red-800">System 1 Mathematical Deviations:</div>
                  {ticket.gevSystem1.flags.map((flag, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                      <span className="text-red-500 font-bold">&bull;</span>
                      <span>{flag}</span>
                    </div>
                  ))}
                </div>

                {/* System 2 LLM Deliberative Reasoning */}
                {ticket.gevSystem2 && (
                  <div className="bg-white rounded-lg p-3 border border-red-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-mono text-red-700 font-bold">
                      <span>{ticket.gevSystem2.model}</span>
                      <span>Context Synthesis</span>
                    </div>
                    <p className="text-gray-700 leading-relaxed text-[11.5px]">
                      {ticket.gevSystem2.synthesis}
                    </p>
                    <div className="pt-1 text-[11px] font-semibold text-red-800">
                      Recommendation: {ticket.gevSystem2.recommendedAction}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3-Way Identity Verification Card */}
          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#53635a]">
              3-Way Counterparty Correlation
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#f9faf7]">
                <span className="text-[#53635a]">Remitter (Bank Slip):</span>
                <span className="font-mono font-semibold text-[#10261d]">
                  {ticket.remitterName || 'Pending receipt'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#f9faf7]">
                <span className="text-[#53635a]">WhatsApp Contact:</span>
                <span className="font-mono font-semibold text-[#10261d]">
                  {ticket.customerName} ({ticket.whatsappPhone})
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#f9faf7]">
                <span className="text-[#53635a]">MoMo Registered Name:</span>
                <span className="font-mono font-semibold text-[#10261d]">
                  {ticket.momoRecipient.registeredName} ({ticket.momoRecipient.network})
                </span>
              </div>
            </div>
          </div>

          {/* WhatsApp Conversation Transcript */}
          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#53635a] flex items-center gap-1.5">
                <MessageSquare size={13} />
                <span>WhatsApp Intake Log</span>
              </h4>
              <span className="text-[10px] text-[#175b3b] font-medium">Auto-Ingested</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {ticket.whatsappTranscript.map((msg, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-xl text-xs max-w-[88%] ${
                    msg.sender === 'customer'
                      ? 'bg-[#ebf2e9] text-[#10261d] ml-auto'
                      : 'bg-white border border-[#e3ece1] text-[#53635a]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#798d81] mb-1">
                    <span>{msg.sender === 'customer' ? ticket.customerName : 'Aksen Bot'}</span>
                    <span>{msg.time}</span>
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fixed Action Footer */}
        <div className="border-t border-[#e3ece1] p-5 bg-[#f9faf7]">
          {isSafe && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-[#53635a] bg-white p-2.5 rounded-xl border border-[#e3ece1]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock size={12} className="text-[#175b3b]" />
                  <span>Execute on MoMo terminal &rarr; Confirm below:</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyPayoutInfo}
                  className="flex items-center gap-1.5 font-mono font-bold text-[#175b3b] hover:text-[#10261d] bg-[#ebf5e7] hover:bg-[#dbebd5] px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-2xs"
                  title="Click to copy phone, name, and amount"
                >
                  {isCopied ? <Check size={12} className="text-[#175b3b]" /> : <Copy size={12} />}
                  <span>{isCopied ? 'Copied Details!' : `${ticket.momoRecipient.network} • ${ticket.momoRecipient.phoneNumber}`}</span>
                </button>
              </div>
              {onDisburse ? (
                <button
                  onClick={() => onDisburse(ticket.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-[#175b3b] py-3.5 px-6 text-sm font-bold text-white shadow-md hover:bg-[#0f4329] transition-all cursor-pointer"
                >
                  <span>Confirm Manual Disbursal (GH₵ {ticket.amountOut.toLocaleString()})</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <div className="w-full text-center py-2.5 rounded-full bg-[#ebf5e7] text-xs font-mono font-semibold text-[#175b3b]">
                  Audit Mode &bull; Disbursal Authorized
                </div>
              )}
            </div>
          )}

          {isFlagged && (
            <div className="flex items-center gap-3">
              {onBlockRisk && (
                <button
                  onClick={() => onBlockRisk(ticket.id)}
                  className="flex-1 rounded-full bg-red-600 py-3 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-all cursor-pointer"
                >
                  Block & Refund Remitter
                </button>
              )}
              <button
                onClick={() => alert(`Escalated ticket ${ticket.id} for manual video KYC.`)}
                className="flex-1 rounded-full border border-[#e3ece1] bg-white py-3 text-xs font-semibold text-[#10261d] hover:bg-gray-50 transition-all cursor-pointer"
              >
                Request Video KYC
              </button>
            </div>
          )}

          {isDisbursed && (
            <div className="flex items-center justify-center gap-2 rounded-full bg-[#ebf2e9] py-3 text-xs font-semibold text-[#175b3b]">
              <CheckCircle2 size={15} />
              <span>Disbursed & Reconciled at {ticket.createdAt}</span>
            </div>
          )}

          {isAwaiting && (
            <div className="flex items-center justify-center gap-2 rounded-full border border-[#e3ece1] bg-white py-3 text-xs text-[#53635a]">
              <Clock size={15} />
              <span>Awaiting Bank Credit Alert (AKS Narration)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
