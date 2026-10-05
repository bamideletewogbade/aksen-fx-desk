'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#controls', label: 'Controls' },
  { href: '#pricing', label: 'Pilot' },
];

/** Public site navigation. */
export function Topbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <span className="text-sm font-bold tracking-tight text-ink">AKSEN <span className="font-normal text-subtle">OTC</span></span>
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-6 text-sm text-muted md:flex">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="hover:text-ink">{l.label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-[#eef4ec]">Sign in</Link>
          <a href="#demo" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">Book a demo</a>
        </div>
        <button type="button" className="rounded-lg p-2 text-ink md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav aria-label="Site" className="border-t border-line bg-paper px-4 py-3 md:hidden">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm text-ink">{l.label}</a>)}
          <div className="mt-2 flex gap-2 border-t border-line pt-3">
            <Link href="/login" className="flex-1 rounded-xl border border-line px-3 py-2 text-center text-sm font-semibold text-ink">Sign in</Link>
            <a href="#demo" onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-brand px-3 py-2 text-center text-sm font-semibold text-white">Book a demo</a>
          </div>
        </nav>
      )}
    </header>
  );
}
