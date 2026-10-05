'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock, Copy, FileCheck2, Landmark, Link2, Lock, Pause, Play, ShieldCheck, Users } from 'lucide-react';

/**
 * Animated walkthrough: the customer's phone on the left, the operator's desk
 * on the right, moving together through one trade. Sample data throughout.
 */
const STEPS = [
  { label: 'Quote', desk: 'Quote sent', deskTone: 'neutral', deskLine: 'Rate held for 15 minutes', deskAction: 'Waiting for the customer' },
  { label: 'Accept', desk: 'Awaiting funds', deskTone: 'waiting', deskLine: 'Customer accepted · payout details added', deskAction: 'Pay into GTBank 0011223344, ref AK-7QX4' },
  { label: 'Pay', desk: 'Funds confirmed', deskTone: 'action', deskLine: 'Receipt received · credit NIP-0001 found on statement', deskAction: '₦1,062,000 recorded against GTBank' },
  { label: 'Paid out', desk: 'Completed', deskTone: 'good', deskLine: 'Approved by Tunde · sent from MTN line', deskAction: 'Payout ref MTN 44712 · receipt on the link' },
] as const;

const TONE: Record<string, string> = {
  neutral: 'bg-[#eef1f5] text-[#3d4b5c]',
  waiting: 'bg-amber-bg text-amber',
  action: 'bg-lime-soft text-brand',
  good: 'bg-[#eaf6e8] text-brand',
};

function PhoneScreen({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div key="s0" className="animate-rise flex h-full flex-col bg-[#efeae2]">
        <div className="bg-[#075e54] px-4 pb-3 pt-9 text-white">
          <div className="text-[0.8125rem] font-bold">Sample Desk</div>
          <div className="text-[0.625rem] text-[#d6f0ea]">your desk’s own WhatsApp</div>
        </div>
        <div className="flex-1 space-y-3 p-3">
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-2.5 text-[0.75rem] text-[#111b21] shadow-sm">How much cedis for ₦1,062,000 to MTN?</div>
          <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white p-2.5 text-[0.75rem] text-[#111b21] shadow-sm">
            Hi Ama, here is your quote. Open the link to accept:
            <div className="mt-2 overflow-hidden rounded-xl border border-[#d9e3d6]">
              <div className="bg-[#10261d] px-3 py-2 text-[0.6875rem] font-bold text-lime">Sample Desk · AK-7QX4</div>
              <div className="space-y-0.5 bg-white px-3 py-2 font-mono text-[0.6875rem]">
                <div>You send ₦1,062,000</div>
                <div className="font-bold text-brand">You receive GH₵ 10,000</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div key={`s${step}`} className="animate-rise flex h-full flex-col bg-paper">
      <div className="bg-[#10261d] px-4 pb-12 pt-9 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.8125rem] font-bold">Sample Desk</div>
            <div className="font-mono text-[0.625rem] text-[#a3b8ac]">Trade AK-7QX4</div>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-[#1b3a2a] px-2 py-0.5 text-[0.5625rem] text-lime"><Lock size={9} /> Private</span>
        </div>
      </div>
      <div className="-mt-9 flex-1 space-y-2.5 px-3">
        <div className="rounded-2xl border border-line bg-white p-3 shadow-sm">
          <div className="text-[0.875rem] font-bold text-ink">{step === 1 ? 'Waiting for your payment' : step === 2 ? 'Payment received' : 'Paid out'}</div>
          <div className="mt-2 grid grid-cols-5 gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1 rounded-full transition-colors duration-500 ${i < step + 1 + (step === 3 ? 1 : 0) ? 'bg-brand' : 'bg-[#e3ebe1]'}`} />)}
          </div>
          <div className="mt-2.5 font-mono text-[0.6875rem] text-muted">₦1,062,000 → <span className="font-bold text-brand">GH₵ 10,000</span></div>
        </div>
        {step === 1 && (
          <div className="rounded-2xl border border-line bg-white p-3 text-[0.6875rem] shadow-sm">
            <div className="font-bold text-ink">Pay ₦1,062,000</div>
            {[['GTBank', ''], ['0011223344', 'copy'], ['Ref AK-7QX4', 'copy']].map(([v, c]) => (
              <div key={v} className="mt-1.5 flex items-center justify-between font-mono"><span>{v}</span>{c && <Copy size={11} className="text-brand" />}</div>
            ))}
            <div className="mt-2.5 rounded-lg border border-dashed border-[#c9d6c6] py-1.5 text-center text-[0.625rem] text-muted">Upload your receipt</div>
          </div>
        )}
        {step === 2 && (
          <div className="rounded-2xl border border-[#c6e3c0] bg-[#eaf6e8] p-3 text-[0.6875rem] text-[#164a2f]">
            <div className="flex items-center gap-1 font-bold"><FileCheck2 size={12} /> The desk found your payment</div>
            <div className="mt-1">Your payout is being prepared. This page updates on its own.</div>
          </div>
        )}
        {step === 3 && (
          <div className="rounded-2xl border border-line bg-white p-3 text-[0.6875rem] shadow-sm">
            <div className="flex items-center gap-1 font-bold text-brand"><CheckCircle2 size={12} /> Receipt</div>
            <div className="mt-1.5 space-y-1 font-mono">
              <div className="flex justify-between"><span className="text-muted">Paid to</span><span>Ama · MTN</span></div>
              <div className="flex justify-between"><span className="text-muted">Reference</span><span>MTN 44712</span></div>
              <div className="flex justify-between"><span className="text-muted">Check code</span><span>9F2C 81A0</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PhoneSimulator() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 3800);
    return () => clearInterval(t);
  }, [playing]);
  const s = STEPS[step];

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div className="flex justify-center">
        <div className="relative w-full max-w-[20rem] rounded-[46px] border-[9px] border-ink bg-ink p-2 shadow-2xl">
          <div className="absolute left-1/2 top-3 z-20 h-4 w-24 -translate-x-1/2 rounded-full bg-ink" />
          <div className="relative h-[26.875rem] overflow-hidden rounded-[36px] text-xs">
            <PhoneScreen step={step} />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-line bg-[#eef4ec] p-1">
            {STEPS.map((x, i) => (
              <button key={x.label} type="button" onClick={() => { setPlaying(false); setStep(i); }} className={`cursor-pointer rounded-full px-3 py-1.5 font-mono text-xs font-bold transition-colors ${step === i ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
                {i + 1}. {x.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-[#eef4ec]">
            {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Playing' : 'Play'}
          </button>
        </div>

        <div className="space-y-4 rounded-3xl border border-line bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <span className="font-mono text-sm font-bold text-ink">Your desk · AK-7QX4</span>
            <span key={s.desk} className={`animate-rise rounded-full px-3 py-1 text-xs font-semibold ${TONE[s.deskTone]}`}>{s.desk}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {STEPS.map((x, i) => (
              <div key={x.label}>
                <div className="h-2 overflow-hidden rounded-full bg-[#e3ece1]"><div className={`h-full rounded-full bg-brand transition-all duration-700 ${step >= i ? 'w-full' : 'w-0'}`} /></div>
                <div className="mt-1 text-[0.6875rem] font-semibold text-muted">{x.label}</div>
              </div>
            ))}
          </div>
          <div key={step} className="animate-rise space-y-2 rounded-2xl border border-line bg-paper p-4 text-sm">
            <div className="flex items-start gap-2 text-ink">{step === 0 ? <Link2 size={16} className="mt-0.5 text-brand" /> : step === 1 ? <Clock size={16} className="mt-0.5 text-amber" /> : step === 2 ? <Landmark size={16} className="mt-0.5 text-brand" /> : <Users size={16} className="mt-0.5 text-brand" />}{s.deskLine}</div>
            <div className="pl-6 font-mono text-xs text-muted">{s.deskAction}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-start gap-2 rounded-xl border border-line p-3"><ShieldCheck size={15} className="mt-0.5 text-brand" /><span><strong className="block text-ink">Receipt ≠ payment</strong><span className="text-muted">The statement decides.</span></span></div>
            <div className="flex items-start gap-2 rounded-xl border border-line p-3"><BadgeCheck size={15} className="mt-0.5 text-brand" /><span><strong className="block text-ink">No app for customers</strong><span className="text-muted">Just a link.</span></span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
