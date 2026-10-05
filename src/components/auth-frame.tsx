import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthVisual } from './auth-visual';

/** Two equal halves: an animated look at the desk on the left, the form on the right. */
export function AuthFrame({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-2">
      <div className="relative hidden flex-col bg-[#0b1310] text-white lg:flex">
        <div className="relative z-10 flex items-center justify-between px-10 pt-8">
          <Link href="/" className="text-sm font-bold">AKSEN <span className="font-normal text-white/50">OTC</span></Link>
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-white/40">Sample trade</span>
        </div>
        <div className="flex-1">
          <AuthVisual />
        </div>
        <div className="relative z-10 px-10 pb-8">
          <p className="max-w-md text-xl font-bold leading-snug tracking-tight">Every quote, payment check and payout in one desk.</p>
          <p className="mt-1.5 max-w-md text-sm text-white/50">Software for licensed currency desks. Your accounts and customers stay yours.</p>
        </div>
      </div>

      <main className="relative flex items-center justify-center p-5 sm:p-10">
        <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(#dfe8dc_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,transparent_35%,black_90%)]" />
        <div className="relative w-full max-w-md space-y-6">
          <Link href="/" className="text-sm font-bold text-ink lg:hidden">AKSEN <span className="font-normal text-subtle">OTC</span></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {children}
          {aside}
        </div>
      </main>
    </div>
  );
}
