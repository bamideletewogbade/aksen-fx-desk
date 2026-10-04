'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, AlertTriangle, CheckCircle2, Lock, Eye, ScanLine, ArrowRight } from 'lucide-react';

export function ForensicLab() {
  const [activeSlipType, setActiveSlipType] = useState<'GENUINE' | 'TAMPERED'>('GENUINE');

  return (
    <section id="forensics" className="py-20 px-4 sm:px-6 lg:px-8 border-b border-[#e3ece1] bg-[#f9faf7] scroll-mt-16">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#e3ece1] bg-white px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b] shadow-2xs">
              <span>PAYMENT INTEGRITY &amp; FRAUD DEFENSE</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#10261d] mt-2">
              Stop receipt scams before your money leaves the bank.
            </h2>
            <p className="text-sm text-[#53635a] max-w-xl mt-1 leading-relaxed">
              Fake mobile bank alerts and Photoshopped transfer receipts cost OTC currency desks millions every week. Aksen automatically inspects every incoming payment slip for altered amounts, edited fonts, and reused transaction references—protecting your capital before you release a single Cedi or Naira.
            </p>
          </div>

          {/* Interactive Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-[#ebf2e9] rounded-2xl border border-[#e3ece1] self-start md:self-auto">
            <button
              onClick={() => setActiveSlipType('GENUINE')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeSlipType === 'GENUINE'
                  ? 'bg-white text-[#10261d] font-bold shadow-2xs'
                  : 'text-[#53635a] hover:text-[#10261d]'
              }`}
            >
              1. Authentic Transfer Slip
            </button>
            <button
              onClick={() => setActiveSlipType('TAMPERED')}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeSlipType === 'TAMPERED'
                  ? 'bg-red-50 text-red-700 font-bold border border-red-200'
                  : 'text-[#53635a] hover:text-[#10261d]'
              }`}
            >
              2. Manipulated / Scam Slip
            </button>
          </div>
        </div>

        {/* 3D Shield + Forensic Inspector Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: 3D Vault Shield Image with Living Status */}
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-square w-full rounded-3xl overflow-hidden border border-[#e3ece1] shadow-xl bg-[#0a1711] group">
              <Image
                src="/images/gev-shield.jpg"
                alt="GEV Sentinel 3D Security Vault Shield"
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a1711] via-transparent to-transparent opacity-60" />

              <div className="absolute bottom-5 left-5 right-5 p-4 rounded-2xl bg-[#10261d]/85 backdrop-blur-md border border-[#e3ece1]/20 text-white space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#c2f576]">
                  <span>DISBURSAL SAFETY STATUS</span>
                  <span className="font-bold">
                    {activeSlipType === 'GENUINE' ? 'Risk: Low (0.8%)' : 'Risk: High (89.2%)'}
                  </span>
                </div>
                <div className="text-xs text-[#cbd8c8]">
                  {activeSlipType === 'GENUINE'
                    ? 'Legitimate bank deposit confirmed. Verified safe to disburse.'
                    : 'Font variance & identity mismatch detected. Disbursal blocked.'}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Inspector Card */}
          <div className="lg:col-span-7 rounded-3xl border border-[#e3ece1] bg-white p-6 sm:p-8 shadow-sm space-y-6">
            {/* Simulated Receipt Preview */}
            <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-[#e3ece1] pb-2.5">
                <span className="font-bold text-[#10261d]">GTBANK NIGERIA NIP CREDIT ALERT</span>
                <span className="text-[10px] text-[#798d81]">REF: AKS-73912</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-[#53635a] block">Receiving Account:</span>
                  <span className="font-bold text-[#10261d]">0123984752 (GTBank)</span>
                </div>
                <div>
                  <span className="text-[#53635a] block">NIBSS Session ID:</span>
                  <span className="font-bold text-[#10261d]">0000139820491028</span>
                </div>
              </div>

              {/* Amount Bounding Box with Visual Tamper Detection */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                  activeSlipType === 'GENUINE'
                    ? 'border-[#c2f576] bg-[#f2fce2]'
                    : 'border-red-400 bg-red-50 ring-2 ring-red-400'
                }`}
              >
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#53635a] block">
                    Transferred Amount
                  </span>
                  <span className="text-xl font-bold font-mono text-[#10261d]">
                    {activeSlipType === 'GENUINE' ? '₦1,500,000.00' : '₦5,000,000.00'}
                  </span>
                </div>

                <div className="text-right">
                  {activeSlipType === 'GENUINE' ? (
                    <span className="text-[11px] font-bold text-[#175b3b] flex items-center gap-1">
                      <CheckCircle2 size={14} /> Font &amp; Layout Authentic
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                      <AlertTriangle size={14} /> Altered Text &amp; Font Detected
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                <div>
                  <span className="text-[#53635a] block">Remitter (Sender):</span>
                  <span className="font-bold text-[#10261d]">
                    {activeSlipType === 'GENUINE' ? 'Bishop Tewogbade' : 'Chioma Adeleke'}
                  </span>
                </div>
                <div>
                  <span className="text-[#53635a] block">MoMo Beneficiary:</span>
                  <span className="font-bold text-[#10261d]">
                    {activeSlipType === 'GENUINE' ? 'Bishop Tewogbade (MTN)' : 'Kofi Mensah (Burner MoMo)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Verdict & Analysis */}
            <div className="space-y-4">
              {activeSlipType === 'GENUINE' ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#ebf2e9] px-3.5 py-1 text-xs font-bold text-[#175b3b]">
                    <CheckCircle2 size={14} />
                    <span>Audit Verdict: VERIFIED &middot; SAFE TO PAY</span>
                  </div>

                  <p className="text-xs text-[#53635a] leading-relaxed">
                    Remitter identity matches WhatsApp trade counterparty and recipient MoMo wallet. Visual and metadata analysis confirms zero font or timestamp manipulation. Safe for operator disbursement.
                  </p>

                  <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xl border border-[#e3ece1] bg-[#f9faf7]">
                      <span className="text-[#798d81] block text-[10px]">Identity Match</span>
                      <strong className="text-[#175b3b]">100% Verified</strong>
                    </div>
                    <div className="p-3 rounded-xl border border-[#e3ece1] bg-[#f9faf7]">
                      <span className="text-[#798d81] block text-[10px]">Payment Ref</span>
                      <strong className="text-[#175b3b]">Unique &amp; Clean</strong>
                    </div>
                    <div className="p-3 rounded-xl border border-[#e3ece1] bg-[#f9faf7]">
                      <span className="text-[#798d81] block text-[10px]">Disbursal Action</span>
                      <strong className="text-[#175b3b]">Operator Approved</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3.5 py-1 text-xs font-bold text-red-700">
                    <AlertTriangle size={14} />
                    <span>Audit Verdict: TRIANGULAR SCAM FLAGGED</span>
                  </div>

                  {/* Fraud Synthesis Card */}
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] font-mono text-red-800 font-bold">
                      <span>Anti-Fraud Sentinel</span>
                      <span>Account Freeze Prevention</span>
                    </div>
                    <p className="text-red-900 leading-relaxed text-[11.5px]">
                      Remitter <em>Chioma Adeleke</em> in Lagos is an innocent third party paying for an unrelated item. The WhatsApp scammer is attempting to cash out Cedis to a burner Ghana MoMo line. Disbursing would trigger a Post-No-Debit (PND) freeze on your bank account when a fraud dispute is logged. Blocked before payout.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xl border border-red-200 bg-red-50/70">
                      <span className="text-red-600 block text-[10px]">Identity Match</span>
                      <strong className="text-red-800">18.2% (Failed)</strong>
                    </div>
                    <div className="p-3 rounded-xl border border-red-200 bg-red-50/70">
                      <span className="text-red-600 block text-[10px]">Fraud Risk Level</span>
                      <strong className="text-red-800">High Risk (89.2%)</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
