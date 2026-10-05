import Link from 'next/link';
import { ArrowRight, Bot, CalendarCheck, Landmark, MessageCircle, MonitorPlay, ShieldCheck } from 'lucide-react';
import { Topbar } from '@/components/navigation/topbar';
import { Hero } from '@/components/marketing/hero';
import { PhoneSimulator } from '@/components/marketing/phone-simulator';
import { ForensicLab } from '@/components/marketing/forensic-lab';
import { DemoChat } from '@/components/marketing/demo-chat';
import { Reveal } from '@/components/marketing/reveal';
import { Pebbles } from '@/components/marketing/pebbles';

export const metadata = {
  title: 'Aksen OTC · Desk software for licensed currency operators',
  description: 'Quote links for customers, payment checks against your statement, two-person payout approval and daily reconciliation for Nigeria and Ghana currency desks.',
};

const FACTS = [
  { icon: ShieldCheck, t: 'Software only', d: 'Your licences, accounts and money stay yours.', tint: 'from-[#e7fbc9] to-[#d3efb0]' },
  { icon: Landmark, t: 'Your statement decides', d: 'No bank connection needed to start.', tint: 'from-[#e3eefb] to-[#cfe0f5]' },
  { icon: MessageCircle, t: 'Your WhatsApp', d: 'Send links the way you already talk.', tint: 'from-[#dcf5e6] to-[#c3ebd2]' },
  { icon: Bot, t: 'AI assists', d: 'It summarises. People approve.', tint: 'from-[#f1ece2] to-[#e5dccb]' },
];

const PILOT = [
  { t: 'Walkthrough', d: 'We see how you work today' },
  { t: 'Set-up', d: 'Rates, accounts, roles in one session' },
  { t: 'Shadow', d: 'Two weeks alongside your process' },
  { t: 'Live', d: 'When day close matches' },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-paper text-ink selection:bg-lime">
      <Topbar />
      <Hero />

      {/* How it works */}
      <section id="how" className="relative scroll-mt-16 overflow-clip bg-gradient-to-b from-white via-white to-[#f4f8f2] px-4 py-24 sm:px-6 lg:px-8">
        <Pebbles tone="light" />
        <div className="relative mx-auto max-w-7xl space-y-12">
          <Reveal className="max-w-2xl">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand">How it works</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your customer taps a link. <span className="text-brand">Your desk sees every step.</span></h2>
          </Reveal>
          <Reveal delay={120}><PhoneSimulator /></Reveal>
        </div>
      </section>

      {/* Controls */}
      <section id="controls" className="relative scroll-mt-16 overflow-clip bg-[#0b1310] px-4 py-24 text-white sm:px-6 lg:px-8">
        <div aria-hidden className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime/40 to-transparent" />
        <Pebbles tone="dark" />
        <div className="relative mx-auto max-w-7xl space-y-10">
          <Reveal className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-lime">Controls</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Edited receipts don’t get paid here.</h2>
            </div>
            <p className="text-sm text-white/55">Pick a case and watch where the money stops.</p>
          </Reveal>
          <Reveal delay={120}><ForensicLab /></Reveal>
        </div>
      </section>

      {/* Facts + pilot */}
      <section id="pricing" className="relative scroll-mt-16 overflow-clip bg-[radial-gradient(ellipse_at_top_left,#eaf5e3,transparent_55%),radial-gradient(ellipse_at_bottom_right,#e8eff8,transparent_50%)] px-4 py-24 sm:px-6 lg:px-8">
        <Pebbles tone="light" />
        <div className="relative mx-auto max-w-7xl space-y-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map((f, i) => (
              <Reveal key={f.t} delay={i * 90}>
                <div className="h-full rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${f.tint}`}><f.icon size={19} className="text-ink" /></span>
                  <div className="mt-4 font-semibold">{f.t}</div>
                  <div className="mt-0.5 text-sm text-muted">{f.d}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="rounded-3xl border border-white/80 bg-white/75 p-8 shadow-sm backdrop-blur sm:p-10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Start with a pilot, not a leap.</h2>
                <span className="text-sm text-muted">Set-up plus a monthly desk fee, agreed after the walkthrough.</span>
              </div>
              <ol className="relative mt-10 grid gap-8 sm:grid-cols-4 sm:gap-4">
                <span aria-hidden className="absolute left-4 right-4 top-4 hidden h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand via-lime to-[#cfe0c9] transition-transform delay-300 duration-[1600ms] ease-out group-data-[shown=true]:scale-x-100 sm:block" />
                {PILOT.map((p, i) => (
                  <li key={p.t} className="relative translate-y-2 opacity-0 transition-all duration-500 group-data-[shown=true]:translate-y-0 group-data-[shown=true]:opacity-100" style={{ transitionDelay: `${400 + i * 300}ms` }}>
                    <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand font-mono text-sm font-bold text-lime shadow">{i + 1}</span>
                    <div className="mt-3 font-semibold">{p.t}</div>
                    <div className="text-sm text-muted">{p.d}</div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Conversation */}
      <section id="demo" className="relative scroll-mt-16 overflow-clip border-t border-line bg-white px-4 py-24 sm:px-6 lg:px-8">
        <div aria-hidden className="absolute -right-40 top-10 h-[26.25rem] w-[26.25rem] rounded-full bg-lime/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="space-y-6">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand">Talk to us</span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">See it on a working desk.</h2>
            <p className="max-w-md text-muted">Answer a few quick questions and we’ll set up a walkthrough. Rather look first? The sample desk is open.</p>
            <ul className="space-y-3">
              {[
                { icon: MessageCircle, t: 'You answer five questions', d: 'About a minute.' },
                { icon: CalendarCheck, t: 'We arrange a walkthrough', d: 'On your own trades, at a time that suits you.' },
                { icon: MonitorPlay, t: 'You decide on a pilot', d: 'Nothing goes live until the numbers match.' },
              ].map((s) => (
                <li key={s.t} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#eef4ec] text-brand"><s.icon size={17} /></span>
                  <span><strong className="block text-sm text-ink">{s.t}</strong><span className="text-sm text-muted">{s.d}</span></span>
                </li>
              ))}
            </ul>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">Open the sample desk <ArrowRight size={14} /></Link>
          </Reveal>
          <Reveal delay={150}><DemoChat /></Reveal>
        </div>
      </section>

      <footer className="border-t border-line bg-paper px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-ink">Aksen OTC</strong> by Aksen Labs</span>
          <span>Aksen does not exchange currency or hold customer funds.</span>
          <Link href="/login" className="font-semibold text-brand">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
