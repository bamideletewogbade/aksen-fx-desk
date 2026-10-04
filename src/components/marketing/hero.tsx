'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Clock,
  ArrowUpDown,
  MessageSquare,
} from 'lucide-react';
import { FxTicker } from './fx-ticker';

export function Hero() {
  // Swap direction: 'NGN_TO_GHS' or 'GHS_TO_NGN'
  const [direction, setDirection] = useState<'NGN_TO_GHS' | 'GHS_TO_NGN'>('NGN_TO_GHS');
  const [amountIn, setAmountIn] = useState<number>(1500000);
  const [countdown, setCountdown] = useState<number>(899); // 14:59

  // Corridor rates
  const rateNgnToGhs = 105.06; // 1 GHS = 105.06 NGN
  const rateGhsToNgn = 105.06;

  // Real-time calculation based on selected direction
  const isNgnToGhs = direction === 'NGN_TO_GHS';
  const amountOut = isNgnToGhs
    ? parseFloat((amountIn / rateNgnToGhs).toFixed(2))
    : parseFloat((amountIn * rateGhsToNgn).toFixed(2));

  // 15-Minute Rate Lock Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 900 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleToggleDirection = () => {
    if (isNgnToGhs) {
      setDirection('GHS_TO_NGN');
      setAmountIn(15000);
    } else {
      setDirection('NGN_TO_GHS');
      setAmountIn(1500000);
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-between overflow-hidden bg-[#f9faf7] text-[#10261d] pt-6 sm:pt-10 border-b border-[#e3ece1]">
      {/* Refined Architectural Texture Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-60">
        <svg
          className="absolute w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <defs>
            <radialGradient id="paper-glow" cx="70%" cy="20%" r="60%">
              <stop offset="0%" stopColor="#ebf5e7" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#f9faf7" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f9faf7" stopOpacity="0" />
            </radialGradient>
            <pattern id="grid-nodes" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="1.5" fill="#cbd8c8" opacity="0.6" />
              <path d="M 30 30 L 60 30 M 30 30 L 30 60" stroke="#e3ece1" strokeWidth="0.75" strokeDasharray="3 3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#paper-glow)" />
          <rect width="100%" height="100%" fill="url(#grid-nodes)" />
        </svg>
      </div>

      {/* Main Hero Content Area: Bold Full-Scale Typography and 3D Asset */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full z-10 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center w-full">
          {/* Left Column: Full-Scale Editorial Copy */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Eyebrow Badge */}
            <div className="inline-flex items-center rounded-full border border-[#d8e3d6] bg-white px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b] shadow-2xs">
              <span>WEST AFRICA OTC DESK &middot; NGN ⇄ GHS CORRIDOR</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#10261d] leading-[1.08]">
              Never lose a day of margin to{' '}
              <span className="text-[#175b3b] relative inline-block">
                slow quotes
                <svg className="absolute -bottom-1 left-0 w-full h-2.5 text-[#c2f576] -z-10" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="6" fill="transparent" />
                </svg>
              </span>{' '}
              or fake slips.
            </h1>

            <p className="max-w-xl text-base sm:text-lg text-[#47584e] leading-relaxed font-normal">
              Turn chaotic WhatsApp trade requests into guaranteed trade settlements. Lock rates instantly, verify bank and MoMo slips before disbursing, and <strong className="text-[#10261d] font-semibold">keep 100% control of your bank accounts and float</strong>.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              <Link
                href="/desk"
                className="flex items-center justify-center gap-2 rounded-full bg-[#175b3b] px-8 py-4 text-sm font-bold text-white shadow-md hover:bg-[#0f4329] transition-all cursor-pointer group"
              >
                <span>Launch Operator Desk</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/#how-it-works"
                className="flex items-center justify-center gap-2 rounded-full border border-[#e3ece1] bg-white px-7 py-4 text-sm font-semibold text-[#10261d] hover:bg-[#ebf2e9] transition-all cursor-pointer shadow-2xs"
              >
                <span>See How It Works</span>
              </Link>
            </div>

            {/* Full-Scale Trust Strip */}
            <div className="pt-6 grid grid-cols-3 gap-6 border-t border-[#e3ece1] max-w-lg">
              <div>
                <span className="text-2xl sm:text-3xl font-bold font-mono text-[#10261d]">15-Min</span>
                <span className="text-xs text-[#53635a] font-medium block mt-0.5">Guaranteed Rate Locks</span>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold font-mono text-[#175b3b]">100%</span>
                <span className="text-xs text-[#53635a] font-medium block mt-0.5">Operator-Controlled Payouts</span>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold font-mono text-[#10261d]">Zero</span>
                <span className="text-xs text-[#53635a] font-medium block mt-0.5">Unverified Payout Leaks</span>
              </div>
            </div>
          </div>

          {/* Right Column: Full-Scale 3D Art & Bidirectional Live Quotation Terminal */}
          <div id="terminal" className="lg:col-span-5 relative flex flex-col items-center w-full">
            {/* 3D Infinity Currency sculpture container with clean framed border */}
            <div className="relative w-full aspect-16/9 rounded-3xl overflow-hidden border border-[#e3ece1] shadow-xl bg-white group">
              <Image
                src="/images/otc-infinity.jpg"
                alt="Aksen OTC 3D Currency Exchange Sculpture"
                fill
                priority
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

              <div className="absolute top-4 left-4 flex items-center rounded-full bg-white/95 backdrop-blur-md border border-[#e3ece1] px-3.5 py-1 text-[#10261d] text-xs font-mono shadow-xs">
                <span className="font-semibold">INSTITUTIONAL LIQUIDITY ACTIVE</span>
              </div>
            </div>

            {/* Full-Scale Bidirectional Live Quoting Card */}
            <div className="w-full -mt-8 sm:-mt-10 relative z-10 rounded-3xl border border-[#e3ece1] bg-white p-5 sm:p-6 shadow-2xl space-y-4">
              {/* Header with Direction Switcher & 15m Countdown */}
              <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#f1f5ee] rounded-full border border-[#e3ece1]">
                  <button
                    onClick={() => {
                      setDirection('NGN_TO_GHS');
                      setAmountIn(1500000);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                      isNgnToGhs
                        ? 'bg-[#10261d] text-white shadow-xs'
                        : 'text-[#53635a] hover:text-[#10261d]'
                    }`}
                  >
                    ₦ ➔ GH₵
                  </button>
                  <button
                    onClick={() => {
                      setDirection('GHS_TO_NGN');
                      setAmountIn(15000);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                      !isNgnToGhs
                        ? 'bg-[#10261d] text-white shadow-xs'
                        : 'text-[#53635a] hover:text-[#10261d]'
                    }`}
                  >
                    GH₵ ➔ ₦
                  </button>
                </div>

                <div className="flex items-center gap-1.5 rounded-full bg-[#ebf5e7] border border-[#175b3b]/20 px-3 py-1 text-xs font-mono font-bold text-[#175b3b]">
                  <Clock size={13} />
                  <span suppressHydrationWarning>Holds: {formatTimer(countdown)}</span>
                </div>
              </div>

              {/* Calculator Inputs */}
              <div className="space-y-3">
                {/* Remitter Box */}
                <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-3.5 space-y-1">
                  <div className="flex justify-between text-xs font-mono text-[#53635a]">
                    <span>You Send ({isNgnToGhs ? 'Bank' : 'MoMo'})</span>
                    <span className="font-bold text-[#10261d]">{isNgnToGhs ? '₦ NGN' : 'GH₵ GHS'}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="number"
                      value={amountIn}
                      onChange={(e) => setAmountIn(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-transparent font-mono text-2xl sm:text-3xl font-bold text-[#10261d] focus:outline-hidden"
                    />
                    <span className="font-mono text-xs font-bold text-[#175b3b] bg-white px-2.5 py-1 rounded-md border border-[#e3ece1] shadow-2xs flex-shrink-0">
                      {isNgnToGhs ? 'Bank' : 'MoMo'}
                    </span>
                  </div>
                </div>

                {/* Quick Swap Direction Icon Button */}
                <div className="flex justify-center -my-1">
                  <button
                    onClick={handleToggleDirection}
                    className="h-8 w-8 rounded-full bg-white border border-[#e3ece1] flex items-center justify-center text-[#175b3b] hover:bg-[#175b3b] hover:text-white transition-all cursor-pointer shadow-xs"
                    title="Invert swap direction"
                  >
                    <ArrowUpDown size={14} />
                  </button>
                </div>

                {/* Recipient Box */}
                <div className="rounded-2xl border border-[#175b3b]/20 bg-[#f1f8ee] p-3.5 space-y-1">
                  <div className="flex justify-between text-xs font-mono text-[#175b3b]">
                    <span>Recipient Gets ({isNgnToGhs ? 'MoMo' : 'Bank'})</span>
                    <span className="font-bold text-[#175b3b]">{isNgnToGhs ? 'GH₵ GHS' : '₦ NGN'}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-2xl sm:text-3xl font-bold text-[#10261d]">
                      {isNgnToGhs ? `GH₵ ${amountOut.toLocaleString()}` : `₦${amountOut.toLocaleString()}`}
                    </div>
                    <span className="font-mono text-xs font-bold text-[#175b3b] bg-white px-2.5 py-1 rounded-md border border-[#175b3b]/30 shadow-2xs flex-shrink-0">
                      {isNgnToGhs ? 'MoMo' : 'Bank'}
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 pt-1">
                  {(isNgnToGhs ? [500000, 1500000, 3500000, 5000000] : [5000, 15000, 35000, 50000]).map((val) => (
                    <button
                      key={val}
                      onClick={() => setAmountIn(val)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                        amountIn === val
                          ? 'bg-[#10261d] text-white border-[#10261d]'
                          : 'bg-[#f9faf7] text-[#53635a] border-[#e3ece1] hover:bg-[#ebf2e9] hover:text-[#10261d]'
                      }`}
                    >
                      {isNgnToGhs ? `₦${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M` : `GH₵ ${(val / 1000).toFixed(0)}k`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate Information & Direct CTA */}
              <div className="flex items-center justify-between text-xs font-mono text-[#53635a] pt-1">
                <span>Rate: 1 GHS = {isNgnToGhs ? rateNgnToGhs : rateGhsToNgn} NGN</span>
                <span className="text-[#175b3b] font-semibold">Zero Commission Fee</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <a
                  href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_DESK_NUMBER || '2349155833108'}?text=${encodeURIComponent(
                    isNgnToGhs
                      ? `Hi Aksen OTC Desk, I want to lock a rate quote: Sending ₦${amountIn.toLocaleString()} NGN for GH₵ ${amountOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHS via MoMo.`
                      : `Hi Aksen OTC Desk, I want to lock a rate quote: Sending GH₵ ${amountIn.toLocaleString()} GHS for ₦${amountOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN via Bank.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[#175b3b] py-3.5 px-4 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer shadow-md"
                >
                  <MessageSquare size={15} />
                  <span>Lock Rate on WhatsApp</span>
                </a>
                <Link
                  href="/desk"
                  className="flex items-center justify-center gap-1.5 rounded-full border border-[#e3ece1] bg-[#f9faf7] py-3.5 px-4 text-xs font-bold text-[#10261d] hover:bg-[#ebf2e9] transition-all cursor-pointer"
                >
                  <span>Operator Desk</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Global FX & Corridor Marquee Ticker: Pinned directly to the bottom edge */}
      <div className="w-full flex-shrink-0 z-20 mt-8 sm:mt-12">
        <FxTicker />
      </div>
    </section>
  );
}
