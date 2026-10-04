'use client';

import Link from 'next/link';
import { Topbar } from '@/components/navigation/topbar';
import { Hero } from '@/components/marketing/hero';
import { PhoneSimulator } from '@/components/marketing/phone-simulator';
import { ForensicLab } from '@/components/marketing/forensic-lab';
import { TrustAndReviews } from '@/components/marketing/trust-and-reviews';
import { OriginStory } from '@/components/marketing/origin-story';
import { ContactDesk } from '@/components/marketing/contact-desk';
import { ArrowRight, ShieldCheck, Zap, Lock } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f9faf7] text-[#10261d] selection:bg-[#c2f576] selection:text-[#10261d]">
      <Topbar />

      {/* 1. Hero with 3D Media & Live Quoting Terminal */}
      <Hero />

      {/* 2. Living Interactive Smartphone WhatsApp Simulation */}
      <PhoneSimulator />

      {/* 3. GEV Sentinel Forensic Lab with 3D Shield & Interactive Tamper Inspector */}
      <ForensicLab />

      {/* 4. Robust Counterparty Trust Ledger & Reviews */}
      <TrustAndReviews />

      {/* 5. Grounded Origin Story */}
      <OriginStory />

      {/* 6. Direct OTC Contact & Desk Locations */}
      <ContactDesk />

      {/* 7. Direct Conversion Banner */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#10261d] text-white">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <span className="text-xs font-mono uppercase tracking-widest text-[#c2f576] font-bold">
            SCALE YOUR DESK
          </span>

          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
            Protect your margin. Grow your daily volume.
          </h2>

          <p className="max-w-xl mx-auto text-sm sm:text-base text-[#cbd8c8] leading-relaxed">
            Stop juggling chaotic chats, calculating rates on scrap paper, and stressing over fake payment slips. Upgrade your currency exchange business with automated quotation locks, instant receipt auditing, and clean shift ledgers.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/desk"
              className="flex items-center justify-center gap-2 rounded-full bg-[#c2f576] px-8 py-4 text-sm font-bold text-[#10261d] shadow-lg hover:bg-[#b0ec5d] transition-all cursor-pointer group"
            >
              <span>Launch Operator Desk</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/#contact"
              className="flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-sm font-bold text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <span>Contact Desk &amp; Locations</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e3ece1] bg-[#f9faf7] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#53635a]">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rotate-45 rounded-[1px] bg-[#175b3b]" />
            <span className="font-bold text-[#10261d]">AKSEN OTC</span>
            <span>&middot; West Africa Bureau Operating System &middot; Lagos ⇄ Accra Corridor</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium">
            <Link href="/#how-it-works" className="hover:text-[#10261d] transition-colors">
              How It Works
            </Link>
            <Link href="/#forensics" className="hover:text-[#10261d] transition-colors">
              Fraud Defense
            </Link>
            <Link href="/#about" className="hover:text-[#10261d] transition-colors">
              About
            </Link>
            <Link href="/#contact" className="hover:text-[#10261d] transition-colors">
              Contact Desk
            </Link>
            <Link href="/login" className="font-bold text-[#175b3b] hover:underline flex items-center gap-1">
              <Lock size={11} />
              <span>Operator Sign In</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
