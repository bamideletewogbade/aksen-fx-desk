'use client';

import { BadgeCheck, BookCheck, CircleDollarSign, Link2, ShieldAlert, Users } from 'lucide-react';

/** A scrolling strip of what a desk's day looks like inside Aksen. Sample events, not live data. */
const EVENTS = [
  { icon: Link2, text: 'AK-7QX4 · quote link opened' },
  { icon: BadgeCheck, text: 'Credit matched to GTBank statement' },
  { icon: Users, text: 'Payout approved by a second admin' },
  { icon: CircleDollarSign, text: 'GH₵ 10,000 sent · ref MTN 44712' },
  { icon: ShieldAlert, text: 'Same receipt seen on another trade' },
  { icon: Link2, text: 'Customer accepted · payout details added' },
  { icon: BookCheck, text: 'Day closed · statement matches' },
  { icon: BadgeCheck, text: 'Partial payment · ₦62,000 still due' },
];

export function DeskTicker() {
  return (
    <div className="w-full select-none overflow-hidden border-t border-line bg-white/80 py-3 backdrop-blur-sm" aria-label="Sample desk activity">
      <div className="flex items-center">
        <div className="z-10 hidden flex-shrink-0 items-center gap-2 border-r border-line bg-white/90 px-6 md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand">A day on the desk</span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="animate-marquee flex items-center gap-4 py-0.5">
            {[...EVENTS, ...EVENTS].map((e, i) => (
              <span key={i} aria-hidden={i >= EVENTS.length} className="flex flex-shrink-0 items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink shadow-sm transition-colors hover:border-brand">
                <e.icon size={13} className="text-brand" /> {e.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kept for older imports. */
export const FxTicker = DeskTicker;
