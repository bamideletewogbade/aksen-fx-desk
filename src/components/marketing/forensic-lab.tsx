'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Ban, Copy, FileImage, Fingerprint, Landmark, ShieldAlert, Users, Wallet } from 'lucide-react';

type Scenario = 'receipt' | 'statement' | 'reused';

const SCENARIOS: Record<Scenario, { tab: string; source: string; sourceIcon: typeof FileImage; nodes: { label: string; state: 'ok' | 'stop' | 'warn' | 'idle' }[]; status: string; tone: 'ok' | 'stop' | 'warn' }> = {
  receipt: {
    tab: 'Customer sends a screenshot',
    source: 'Transfer screenshot',
    sourceIcon: FileImage,
    nodes: [{ label: 'Saved as proof', state: 'ok' }, { label: 'Funds confirmed', state: 'stop' }, { label: 'Payout', state: 'idle' }],
    status: 'Still awaiting funds. A screenshot can’t move money.',
    tone: 'stop',
  },
  statement: {
    tab: 'Credit is on your statement',
    source: 'Statement credit NIP-0001',
    sourceIcon: Landmark,
    nodes: [{ label: 'Funds confirmed', state: 'ok' }, { label: 'Second-person approval', state: 'ok' }, { label: 'Payout recorded', state: 'ok' }],
    status: 'Cleared step by step, each one on the record.',
    tone: 'ok',
  },
  reused: {
    tab: 'Same receipt, two trades',
    source: 'Receipt seen on AK-4NRC',
    sourceIcon: Copy,
    nodes: [{ label: 'Flagged before approval', state: 'warn' }, { label: 'Admin must tick it', state: 'warn' }, { label: 'Payout', state: 'idle' }],
    status: 'Reused proof is flagged. Check the statement directly.',
    tone: 'warn',
  },
};

const STATE_CLS = {
  ok: 'border-lime/40 bg-white/[0.06] text-lime shadow-[0_0_24px_-8px_rgba(194,245,118,0.5)]',
  stop: 'border-[#ff8a7a]/40 bg-[#ff8a7a]/10 text-[#ffb4ab] line-through decoration-[#ffb4ab]/70',
  warn: 'border-[#f7c873]/40 bg-[#f7c873]/10 text-[#f7c873]',
  idle: 'border-dashed border-white/15 bg-transparent text-white/40',
};

const CONTROLS = [
  { icon: Copy, t: 'One credit, one trade', d: 'A statement reference can’t pay twice.' },
  { icon: Users, t: 'Two-person payouts', d: 'Above your limit, someone else approves.' },
  { icon: Wallet, t: 'Every payout traceable', d: 'Each payout names the account it left from and its reference.' },
  { icon: Fingerprint, t: 'Tamper-evident record', d: 'Edit history and the chain breaks.' },
];

export function ForensicLab() {
  const [s, setS] = useState<Scenario>('receipt');
  const sc = SCENARIOS[s];
  const Src = sc.sourceIcon;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur" role="tablist">
        {(Object.keys(SCENARIOS) as Scenario[]).map((k, i) => (
          <button key={k} type="button" role="tab" aria-selected={s === k} onClick={() => setS(k)} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${s === k ? 'bg-white text-ink shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[0.625rem] ${s === k ? 'bg-ink text-lime' : 'bg-white/10'}`}>{i + 1}</span>
            {SCENARIOS[k].tab}
          </button>
        ))}
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        <div className="group relative min-h-64 overflow-hidden rounded-3xl border border-white/10 lg:col-span-5">
          <Image src="/images/gev-shield.jpg" alt="" fill sizes="(max-width: 1024px) 100vw, 480px" className="object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent" />
          <div key={s} className="animate-rise absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-[#0b120f]/80 p-4 backdrop-blur-md">
            <div className={`flex items-center gap-1.5 font-mono text-[0.6875rem] font-bold ${sc.tone === 'ok' ? 'text-lime' : sc.tone === 'warn' ? 'text-[#f7c873]' : 'text-[#ffb4ab]'}`}>
              {sc.tone === 'ok' ? <Landmark size={13} /> : sc.tone === 'warn' ? <ShieldAlert size={13} /> : <Ban size={13} />}
              {sc.tone === 'ok' ? 'CLEAR TO PAY' : sc.tone === 'warn' ? 'CHECK BEFORE PAYING' : 'NOT PAYABLE'}
            </div>
            <div className="mt-1 text-sm text-[#e3ece1]">{sc.status}</div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur lg:col-span-7">
          <div className="mb-4 font-mono text-[0.6875rem] uppercase tracking-wider text-white/40">Where the money goes</div>
          <div key={s} className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="animate-pop flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3 text-sm font-medium text-white">
              <Src size={18} className="text-white/80" /> {sc.source}
            </div>
            {sc.nodes.map((n, i) => (
              <div key={n.label} className="flex flex-col items-center gap-3 sm:flex-row">
                <span className={`flow-line h-0.5 w-6 rounded-full max-sm:h-5 max-sm:w-0.5 ${n.state === 'ok' ? 'text-lime/70' : n.state === 'stop' ? 'text-[#ffb4ab]/50' : n.state === 'warn' ? 'text-[#f7c873]/60' : 'text-white/20'}`} aria-hidden />
                <ArrowRight size={14} className="-ml-3 hidden text-white/30 sm:block" aria-hidden />
                <div className={`animate-pop rounded-2xl border px-3.5 py-3 text-center text-xs font-semibold ${STATE_CLS[n.state]}`} style={{ animationDelay: `${(i + 1) * 220}ms` }}>
                  {n.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {CONTROLS.map((c) => (
              <div key={c.t} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5 transition-colors hover:border-white/15 hover:bg-white/[0.06]">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.07]"><c.icon size={16} className="text-white/85" /></span>
                <span><strong className="block text-sm text-white">{c.t}</strong><span className="text-xs text-white/55">{c.d}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
