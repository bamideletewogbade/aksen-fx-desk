import Link from 'next/link';
import { ArrowRight, CheckCircle2, Landmark, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { Topbar } from '@/components/navigation/topbar';
import { Hero } from '@/components/marketing/hero';
import { DayOnDesk } from '@/components/marketing/day-on-desk';
import { DemoChat } from '@/components/marketing/demo-chat';
import { Reveal } from '@/components/marketing/reveal';
import { Pebbles } from '@/components/marketing/pebbles';

export const metadata = {
  title: 'Aksen OTC · Desk software for licensed currency operators',
  description: 'One inbox for WhatsApp and SMS rate requests, locked quote links, payment checks against your own statement, two-person payout approval and a daily close for Nigeria and Ghana currency desks.',
};

const SAFEGUARDS = [
  {
    icon: ShieldCheck,
    tag: 'Zero custody',
    title: 'Your accounts and float stay 100% yours',
    description: 'We build the operating software, not a bank or wallet. Your licences, bank accounts, and mobile money lines stay under your name. Aksen never touches, holds, or pools customer funds.',
    signal: '0 customer deposits handled',
    accent: 'bg-[#dcf5e6] text-[#175b3b]',
  },
  {
    icon: Landmark,
    tag: 'Fraud immunity',
    title: 'A screenshot never releases cash',
    description: 'Receipts can be fabricated in seconds. In Aksen, a payout is impossible until an operator confirms the credit line directly on your desk’s official bank or mobile money statement.',
    signal: '100% statement-matched payouts',
    accent: 'bg-[#fff0d4] text-[#8b5100]',
  },
  {
    icon: Users,
    tag: 'Four-eyes control',
    title: 'Two people sign off larger payouts',
    description: 'Prevent accidental duplicate payments or rogue transfers. Set your desk threshold so one operator verifies incoming funds and an authorized teammate approves the outgoing payment.',
    signal: 'Tamper-evident audit trail',
    accent: 'bg-[#e8effb] text-[#1d4f91]',
  },
];

const PILOT = [
  { step: '01', title: 'Walkthrough', desc: 'A 20-minute review of your desk’s volume, corridors, and current workflow.' },
  { step: '02', title: 'Set-up', desc: 'Configure rates, WhatsApp lines, accounts, and operator roles in one working session.' },
  { step: '03', title: 'Shadow run', desc: 'Run Aksen alongside your current chats and spreadsheets for two weeks with zero disruption.' },
  { step: '04', title: 'Go live', desc: 'Transition completely only when your day-end balances match to the exact pesewa.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-paper text-ink selection:bg-lime">
      <Topbar />
      <Hero />

      {/* Centerpiece: A Day on the Desk */}
      <DayOnDesk />

      {/* Safeguards: Core operator protections */}
      <section id="safeguards" className="relative scroll-mt-16 overflow-clip bg-gradient-to-b from-white via-white to-[#f4f8f2] px-4 py-24 sm:px-6 lg:px-8 border-b border-line">
        <Pebbles tone="light" />
        <div className="relative mx-auto max-w-7xl space-y-12">
          <Reveal className="max-w-3xl">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand">Operator Safeguards</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Three controls your desk <span className="text-brand">never compromises on</span>.
            </h2>
            <p className="mt-4 text-base text-muted sm:text-lg">
              Designed specifically for licensed currency desks in Nigeria and Ghana. No black boxes, no third-party custody, and no shortcuts around your statement.
            </p>
          </Reveal>

          <div className="grid gap-6 md:grid-cols-3">
            {SAFEGUARDS.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.tag} delay={i * 100}>
                  <div className="flex h-full flex-col justify-between rounded-3xl border border-line bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${s.accent}`}>
                          <Icon size={22} />
                        </span>
                        <span className="rounded-full bg-[#f1f5ee] px-3 py-1 font-mono text-[0.6875rem] font-bold text-subtle">
                          {s.tag}
                        </span>
                      </div>
                      <h3 className="mt-6 text-xl font-bold tracking-tight text-ink">{s.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted">{s.description}</p>
                    </div>
                    <div className="mt-8 flex items-center gap-2 border-t border-line/70 pt-4 text-xs font-semibold text-brand">
                      <CheckCircle2 size={15} />
                      <span>{s.signal}</span>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pilot + Walkthrough Booking */}
      <section id="pilot" className="relative scroll-mt-16 overflow-clip bg-[#09140f] px-4 py-24 text-white sm:px-6 lg:px-8">
        <div aria-hidden className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime/40 to-transparent" />
        <Pebbles tone="dark" />

        <div className="relative mx-auto max-w-7xl space-y-16">
          <Reveal className="max-w-3xl">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-lime">Pilot Process</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Start with a shadow pilot, <span className="text-white/45">not a leap of faith</span>.
            </h2>
            <p className="mt-4 text-base text-white/65 sm:text-lg">
              We never ask you to switch cold turkey. Run Aksen alongside your current books until your reconciliations match to the pesewa.
            </p>
          </Reveal>

          {/* 4-step pilot timeline */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILOT.map((p, i) => (
              <Reveal key={p.step} delay={i * 90}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
                  <span className="font-mono text-xs font-bold text-lime">{p.step}</span>
                  <div className="mt-2 text-lg font-bold text-white">{p.title}</div>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Walkthrough CTA & interactive chat */}
          <div id="walkthrough" className="scroll-mt-20 rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur sm:p-10 lg:p-12">
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
              <Reveal className="space-y-6">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-lime">Talk to us</span>
                <h3 className="text-3xl font-bold tracking-tight sm:text-4xl">See it live on your own numbers.</h3>
                <p className="text-sm text-white/70 leading-relaxed max-w-md">
                  Answer a few quick questions in the chat to tell us about your desk, and we’ll schedule a 20-minute tailored walkthrough.
                </p>
                <div className="pt-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    Or open the sample desk right now <ArrowRight size={15} />
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <DemoChat />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-paper px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-ink">Aksen OTC</strong> by Aksen Labs</span>
          <span>Aksen does not exchange currency or hold customer funds.</span>
          <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
