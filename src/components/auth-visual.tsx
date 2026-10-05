'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock, Landmark, Link2, Users } from 'lucide-react';

/**
 * Left half of the sign-in pages: one sample trade moving through the desk,
 * step by step, over a darkened product image. Sample data only.
 */
const STEPS = [
  { label: 'Quote sent', detail: 'Link shared with the customer', icon: Link2, chip: 'AK-7QX4 · quote link opened' },
  { label: 'Accepted', detail: 'Payout details added by the customer', icon: Clock, chip: 'Customer accepted · MTN 0244…200' },
  { label: 'Funds confirmed', detail: 'Credit found on the GTBank statement', icon: Landmark, chip: 'Credit NIP-0001 matched' },
  { label: 'Approved', detail: 'Second admin ticked every check', icon: Users, chip: 'Approved by Tunde' },
  { label: 'Paid out', detail: 'Reference recorded, receipt on the link', icon: CheckCircle2, chip: 'GH₵ 10,000 sent · ref MTN 44712' },
];

export function AuthVisual() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(STEPS.length - 1);
      return;
    }
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2400);
    return () => clearInterval(t);
  }, []);
  const done = step === STEPS.length - 1;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-clip">
      <Image src="/images/otc-infinity.jpg" alt="" fill priority sizes="50vw" className="object-cover opacity-35 [mask-image:radial-gradient(ellipse_at_60%_40%,black,transparent_75%)]" />
      <div aria-hidden className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
      <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-lime/15 blur-3xl" />

      <div className="relative w-full max-w-sm px-6">
        {/* floating event chips */}
        <div className="pointer-events-none absolute -top-14 left-6 right-6 h-10">
          <div key={step} className="animate-pop mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" /> {STEPS[step].chip}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0d1813]/80 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-white/50">AK-7QX4 · sample</span>
            <span key={done ? 'd' : 'o'} className={`animate-pop rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold ${done ? 'bg-lime text-ink' : 'bg-white/10 text-white/80'}`}>
              {done ? 'Completed' : 'In progress'}
            </span>
          </div>
          <div className="mt-3 font-mono text-lg font-bold tabular text-white">
            ₦1,062,000 <span className="text-white/40">→</span> <span className="text-lime">GH₵ 10,000</span>
          </div>

          <ol className="mt-5 space-y-0">
            {STEPS.map((s, i) => {
              const state = i < step ? 'done' : i === step ? 'now' : 'next';
              return (
                <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < STEPS.length - 1 && (
                    <span aria-hidden className="absolute left-[0.8rem] top-7 h-[calc(100%-1.25rem)] w-px bg-white/10">
                      <span className={`block w-px bg-lime transition-all duration-700 ${i < step ? 'h-full' : 'h-0'}`} />
                    </span>
                  )}
                  <span className={`relative z-10 flex h-[1.6rem] w-[1.6rem] flex-shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${state === 'done' ? 'border-lime bg-lime text-ink' : state === 'now' ? 'border-lime bg-lime/15 text-lime shadow-[0_0_0_4px_rgba(194,245,118,0.12)]' : 'border-white/15 text-white/30'}`}>
                    {state === 'done' ? <BadgeCheck size={14} /> : <s.icon size={13} />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold transition-colors ${state === 'next' ? 'text-white/35' : 'text-white'}`}>{s.label}</span>
                    <span className={`block overflow-hidden text-xs text-white/55 transition-all duration-500 ${state === 'now' ? 'max-h-6 opacity-100' : 'max-h-0 opacity-0'}`}>{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
