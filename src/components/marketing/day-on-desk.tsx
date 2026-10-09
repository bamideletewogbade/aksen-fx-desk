'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ArrowDown,
  BadgeCheck,
  Check,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LockKeyhole,
  MessageCircle,
  MoonStar,
  ShieldCheck,
  SunMedium,
  Users,
} from 'lucide-react';

type DeskMoment = {
  time: string;
  label: string;
  title: string;
  story: string;
  note: string;
  status: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone: string;
  detail: { tag: string; value: string };
};

const MOMENTS: DeskMoment[] = [
  {
    time: '08:05',
    label: 'Open the desk',
    title: 'The day starts with what is actually available.',
    story: 'The team reviews today’s rates, settlement accounts and open items before the first customer quote leaves the desk.',
    note: 'Rates are set by the desk',
    status: 'Ready for requests',
    icon: SunMedium,
    tone: 'bg-[#f7f1d5] text-[#705b14]',
    detail: { tag: 'Today’s Corridors', value: 'NGN/GHS 106.20 · GHS/NGN 103.90 · Float checked' },
  },
  {
    time: '09:18',
    label: 'A customer asks',
    title: 'A WhatsApp question becomes a quote your team can track.',
    story: 'Ama asks for a ₦1.5m quote. The desk prepares a held rate and sends a customer link, without moving or promising any money.',
    note: 'Quote AK-7QX4 · held for 15 minutes',
    status: 'Waiting for customer',
    icon: MessageCircle,
    tone: 'bg-[#dff4e7] text-[#175b3b]',
    detail: { tag: 'Customer Quote', value: '₦1,500,000 → GH₵ 14,124 · 15m rate lock on link' },
  },
  {
    time: '11:42',
    label: 'Evidence arrives',
    title: 'A receipt starts a check. It never finishes one.',
    story: 'The customer uploads payment evidence. The desk keeps the trade on hold until an operator finds the matching credit on your own statement.',
    note: 'Screenshot received · no credit confirmed',
    status: 'Statement check needed',
    icon: FileCheck2,
    tone: 'bg-[#fff0d4] text-[#8b5100]',
    detail: { tag: 'Statement Rule', value: 'Screenshot received · HOLD until bank ledger match' },
  },
  {
    time: '12:06',
    label: 'Money is confirmed',
    title: 'One person records the credit. Another protects the payout.',
    story: 'The operator records the statement match. Because this payout crosses the desk’s limit, it moves to a second teammate for approval.',
    note: 'Credit recorded by Kwame · approval required',
    status: 'Awaiting second approval',
    icon: Users,
    tone: 'bg-[#e8effb] text-[#1d4f91]',
    detail: { tag: 'Dual Control', value: 'Kwame matched NIP-8821 · Routed to Adwoa (>GH₵ 10k)' },
  },
  {
    time: '15:37',
    label: 'Payout recorded',
    title: 'The second pair of eyes signs off—and the record stays behind.',
    story: 'Adwoa approves the payout. The team records the beneficiary reference, who acted, and when, so the trade can be followed later.',
    note: 'Approved by Adwoa · payout reference saved',
    status: 'Trade complete',
    icon: BadgeCheck,
    tone: 'bg-[#e7fbc9] text-[#175b3b]',
    detail: { tag: 'Settled Reference', value: 'Approved by Adwoa · MTN MoMo #44712 · Audit locked' },
  },
  {
    time: '18:10',
    label: 'Close the day',
    title: 'The desk closes with the exceptions in plain sight.',
    story: 'Completed trades, holds and unresolved differences are reviewed together. Anything that does not match stays visible for a person to resolve tomorrow.',
    note: '12 complete · 1 hold · 1 item to review',
    status: 'Close reviewed',
    icon: MoonStar,
    tone: 'bg-[#28382f] text-[#c2f576]',
    detail: { tag: 'Day Close Reconciled', value: '12 trades · GH₵ 142,800 · Zero unaccounted variance' },
  },
];

function DeskScreen({ moment, index, onSelect }: { moment: DeskMoment; index: number; onSelect: (i: number) => void }) {
  const Icon = moment.icon;
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f5f7f3] text-ink shadow-[0_2rem_6rem_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-xs font-bold text-lime">DY</span>
          <div>
            <div className="text-xs font-bold">Sample desk</div>
            <div className="text-[0.625rem] text-subtle">A day in Dinero-Yard</div>
          </div>
        </div>
        <span className="rounded-full bg-[#eef4ec] px-3 py-1 font-mono text-[0.6875rem] font-bold text-brand">{moment.time}</span>
      </div>

      {/* Quick-jump timeline pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line bg-white/60 px-3 py-2 sm:px-4">
        {MOMENTS.map((m, i) => (
          <button
            key={m.time}
            type="button"
            onClick={() => onSelect(i)}
            className={`cursor-pointer rounded-lg px-2.5 py-1 font-mono text-[0.6875rem] font-bold transition-all ${
              i === index
                ? 'bg-ink text-lime shadow-sm scale-105'
                : 'text-muted hover:bg-[#eef4ec] hover:text-ink'
            }`}
          >
            {m.time}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 border-b border-line bg-white px-3 py-3 sm:px-5">
        {[
          ['Open trades', index < 1 ? '0' : index < 4 ? '3' : '1'],
          ['Needs review', index === 2 || index === 3 || index === 5 ? '1' : '0'],
          ['Completed', index < 4 ? '—' : index === 4 ? '1' : '12'],
        ].map(([label, value]) => (
          <div key={label} className="border-r border-line px-2 last:border-r-0 sm:px-3">
            <div className="font-mono text-lg font-bold tabular sm:text-xl">{value}</div>
            <div className="truncate text-[0.625rem] text-subtle sm:text-xs">{label}</div>
          </div>
        ))}
      </div>

      <div className="min-h-[17rem] p-4 sm:min-h-[19rem] sm:p-5">
        <div className="flex items-center justify-between text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-subtle">
          <span>Live desk record</span>
          <span>{String(index + 1).padStart(2, '0')} / {String(MOMENTS.length).padStart(2, '0')}</span>
        </div>

        <div key={moment.time} className="animate-rise mt-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${moment.tone}`}><Icon size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{moment.label}</strong>
                <span className="font-mono text-[0.6875rem] text-subtle">{moment.time}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{moment.note}</p>
            </div>
          </div>

          {/* Real operational signal badge */}
          <div className="mt-3.5 rounded-xl border border-line/70 bg-[#fafcfa] px-3 py-2">
            <div className="text-[0.625rem] font-mono font-bold uppercase tracking-wider text-subtle">{moment.detail.tag}</div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-ink truncate">{moment.detail.value}</div>
          </div>

          <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#f3f6f1] px-3 py-2.5 text-xs font-semibold text-ink">
            {index === 2 ? <LockKeyhole size={14} className="text-amber" /> : index === 3 ? <Users size={14} className="text-info" /> : <Check size={14} className="text-brand" />}
            {moment.status}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-center gap-1.5 text-[0.6875rem] text-subtle"><CircleDollarSign size={13} /> Customer funds</div>
            <div className="mt-1 text-xs font-bold">Held by the desk</div>
          </div>
          <div className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-center gap-1.5 text-[0.6875rem] text-subtle"><ShieldCheck size={13} /> Final authority</div>
            <div className="mt-1 text-xs font-bold">Always a person</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DayOnDesk() {
  const [active, setActive] = useState(0);
  const momentRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observers = momentRefs.current.map((element, index) => {
      if (!element) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(index);
        },
        { rootMargin: '-32% 0px -45% 0px', threshold: 0 },
      );
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach((observer) => observer?.disconnect());
  }, []);

  const moment = MOMENTS[active];

  const scrollToMoment = (index: number) => {
    setActive(index);
    const element = momentRefs.current[index];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section id="day-on-the-desk" className="relative scroll-mt-16 overflow-clip bg-[#08110d] px-4 py-20 text-white sm:px-6 sm:py-28 lg:px-8">
      <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(circle_at_20%_8%,rgba(194,245,118,0.13),transparent_24%),radial-gradient(circle_at_80%_72%,rgba(77,130,188,0.13),transparent_26%)]" />
      <div aria-hidden className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-14 max-w-3xl sm:mb-20">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-lime"><Clock3 size={14} /> A day on the desk</div>
          <h2 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Six moments. One record.<br /><span className="text-white/45">No leap of faith.</span></h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">Follow a sample trade through a working day. The software keeps the steps together; your team keeps control of every decision involving money.</p>
          <a href="#desk-moment-1" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-lime">Scroll through the day <ArrowDown size={15} className="animate-gentle-pulse" /></a>
        </div>

        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24">
            <DeskScreen moment={moment} index={active} onSelect={scrollToMoment} />
            <div className="mt-5 flex items-center gap-3" aria-hidden>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${((active + 1) / MOMENTS.length) * 100}%` }} /></span>
              <span className="font-mono text-xs text-white/45">{active + 1}/{MOMENTS.length}</span>
            </div>
          </div>

          <div className="relative">
            <div aria-hidden className="absolute bottom-[15%] left-[0.9375rem] top-[12%] w-px bg-white/15 sm:left-[1.1875rem]">
              <span className="block w-px bg-lime transition-[height] duration-500" style={{ height: `${(active / (MOMENTS.length - 1)) * 100}%` }} />
            </div>
            {MOMENTS.map((item, index) => {
              const Icon = item.icon;
              const selected = index === active;
              return (
                <article
                  id={`desk-moment-${index + 1}`}
                  key={item.time}
                  ref={(element) => { momentRefs.current[index] = element; }}
                  className="relative flex min-h-[62vh] scroll-mt-28 gap-5 pb-16 last:min-h-[48vh] last:pb-0 sm:gap-7 lg:min-h-[68vh]"
                >
                  <span className={`relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-full border transition-all duration-500 sm:h-10 sm:w-10 ${selected ? 'scale-110 border-lime bg-lime text-ink shadow-[0_0_0_8px_rgba(194,245,118,0.08)]' : 'border-white/15 bg-[#12221b] text-white/45'}`}><Icon size={16} /></span>
                  <div className={`max-w-lg pt-0.5 transition-all duration-500 sm:pt-1 ${selected ? 'translate-x-0 opacity-100' : 'opacity-45 lg:translate-x-2'}`}>
                    <div className="flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.16em] text-lime"><span>{item.time}</span><span className="h-px w-6 bg-lime/50" /><span>{item.label}</span></div>
                    <h3 className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{item.title}</h3>
                    <p className="mt-4 text-base leading-relaxed text-white/65">{item.story}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
