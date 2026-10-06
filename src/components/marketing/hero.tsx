'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpDown, Clock, Link2 } from 'lucide-react';
import { computeQuote, formatMinor, parseRate, type Corridor } from '@/lib/money';
import { DeskTicker } from './fx-ticker';
import { HeroBackdrop } from './hero-backdrop';

const SAMPLE_RATE: Record<Corridor, string> = { NGN_GHS: '106.20', GHS_NGN: '103.90' };
const PRESETS: Record<Corridor, number[]> = {
  NGN_GHS: [500_000, 1_500_000, 3_500_000, 5_000_000],
  GHS_NGN: [5_000, 15_000, 35_000, 50_000],
};

function QuoteCard() {
  const [corridor, setCorridor] = useState<Corridor>('NGN_GHS');
  const [amount, setAmount] = useState(1_500_000);
  const [secs, setSecs] = useState(15 * 60);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s <= 1 ? 15 * 60 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const ngn = corridor === 'NGN_GHS';
  const q = amount > 0 ? computeQuote({ corridor, mode: 'PAY', amountMinor: amount * 100, rate: parseRate(SAMPLE_RATE[corridor]) }) : null;
  const flip = (c: Corridor) => {
    setCorridor(c);
    setAmount(c === 'NGN_GHS' ? 1_500_000 : 15_000);
  };

  return (
    <div className="relative z-10 -mt-10 w-full space-y-4 rounded-3xl border border-line bg-white p-5 shadow-2xl sm:p-6 lg:space-y-3 lg:p-5">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-1 rounded-full border border-line bg-[#f1f5ee] p-1" role="radiogroup" aria-label="Direction">
          {(['NGN_GHS', 'GHS_NGN'] as Corridor[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={corridor === c} onClick={() => flip(c)} className={`cursor-pointer rounded-full px-3 py-1 font-mono text-xs font-bold transition-colors ${corridor === c ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
              {c === 'NGN_GHS' ? '₦ → GH₵' : 'GH₵ → ₦'}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-brand/20 bg-lime-soft px-3 py-1 font-mono text-xs font-bold text-brand">
          <Clock size={13} />
          <span suppressHydrationWarning>Held {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-paper p-3.5">
        <div className="flex justify-between font-mono text-xs text-muted"><span>Customer sends</span><span className="font-bold text-ink">{ngn ? 'NGN' : 'GHS'}</span></div>
        <input
          aria-label="Amount the customer sends"
          inputMode="numeric"
          value={amount.toLocaleString('en-US')}
          onChange={(e) => setAmount(Math.min(999_999_999, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
          className="mt-1 w-full bg-transparent font-mono text-2xl font-bold tabular text-ink outline-none sm:text-3xl"
        />
      </div>
      <div className="-my-1 flex justify-center">
        <button type="button" aria-label="Swap direction" onClick={() => flip(ngn ? 'GHS_NGN' : 'NGN_GHS')} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-brand shadow-sm transition-all hover:rotate-180 hover:bg-brand hover:text-white">
          <ArrowUpDown size={14} />
        </button>
      </div>
      <div className="rounded-2xl border border-brand/20 bg-[#f1f8ee] p-3.5">
        <div className="flex justify-between font-mono text-xs text-brand"><span>Customer receives</span><span className="font-bold">{ngn ? 'GHS' : 'NGN'}</span></div>
        <div key={`${corridor}-${amount}`} className="animate-rise mt-1 font-mono text-2xl font-bold tabular text-ink sm:text-3xl">{q ? formatMinor(q.receiveMinor, ngn ? 'GHS' : 'NGN') : '—'}</div>
      </div>
      <div className="flex gap-2">
        {PRESETS[corridor].map((v) => (
          <button key={v} type="button" onClick={() => setAmount(v)} className={`flex-1 cursor-pointer rounded-lg border py-1.5 font-mono text-xs font-semibold transition-colors ${amount === v ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-muted hover:text-ink'}`}>
            {ngn ? `₦${v / 1_000_000}M` : `GH₵${v / 1000}k`}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-muted">
        <span>1 GHS = ₦{SAMPLE_RATE[corridor]}</span>
        <span className="text-subtle">Sample rate</span>
      </div>
      <a href="#how" className="flex items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep">
        <Link2 size={15} /> Send it as a customer link
      </a>
    </div>
  );
}

export function Hero() {
  return (
    // Exactly one screen under the 4rem top bar on desktop, so the activity strip
    // sits on the bottom edge at load. The image shrinks to give back height.
    <section className="relative flex min-h-[calc(100svh-4rem-1px)] flex-col justify-between overflow-clip border-b border-line bg-paper pt-8 sm:pt-12 lg:pt-0">
      <HeroBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-6 sm:px-6 lg:px-8 lg:py-[2.5vh]">
        <div className="grid w-full items-center gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="animate-rise space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8e3d6] bg-white px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-brand shadow-sm">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
              Desk software · NGN ⇄ GHS
            </div>
            <h1 className="text-4xl font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Pay out only when the money is{' '}
              <span className="relative inline-block text-brand">
                really in
                <svg className="absolute -bottom-1 left-0 -z-10 h-3 w-full text-lime" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="6" fill="transparent" />
                </svg>
              </span>
              .
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              Customers ask for a rate on WhatsApp and get a locked quote back. You check every credit against your own statement, and a second person signs off larger payouts. <strong className="font-semibold text-ink">Your accounts and your float stay yours.</strong>
            </p>
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <a href="#demo" className="group flex items-center justify-center gap-2 rounded-full bg-brand px-8 py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-brand-deep">
                Book a walkthrough <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </a>
              <Link href="/login" className="flex items-center justify-center rounded-full border border-line bg-white px-7 py-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-[#eef4ec]">
                Try the sample desk
              </Link>
            </div>
            <dl className="grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
              {[
                ['Statement', 'confirms every credit'],
                ['2 people', 'approve larger payouts'],
                ['Every step', 'on a tamper-evident record'],
              ].map(([big, small], i) => (
                <div key={big} className="animate-rise" style={{ animationDelay: `${200 + i * 120}ms` }}>
                  <dt className="font-mono text-xl font-bold text-ink sm:text-2xl">{big}</dt>
                  <dd className="mt-0.5 text-xs font-medium text-muted">{small}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div data-hero-card className="relative flex w-full flex-col items-center lg:col-span-5">
            <div className="group relative h-56 w-full overflow-hidden rounded-3xl border border-line bg-white shadow-xl sm:h-72 lg:h-[clamp(6rem,calc(100svh-40rem),20rem)]">
              <Image src="/images/otc-infinity.jpg" alt="" fill priority sizes="(max-width: 1024px) 100vw, 520px" className="object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
              <div className="absolute left-4 top-4 rounded-full border border-line bg-white/95 px-3.5 py-1 font-mono text-xs font-semibold text-ink shadow-sm backdrop-blur">Quote locked for the customer</div>
            </div>
            <QuoteCard />
          </div>
        </div>
      </div>

      <div className="relative z-20 mt-8 w-full flex-shrink-0 sm:mt-12 lg:mt-0">
        <DeskTicker />
      </div>
    </section>
  );
}
