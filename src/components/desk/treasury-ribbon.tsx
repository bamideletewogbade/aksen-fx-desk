'use client';

import { Building2, SlidersHorizontal, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

interface TreasuryRibbonProps {
  ngnTotal: number;
  ghsTotal: number;
  rate: number;
  pendingCount: number;
  flaggedCount: number;
  onEditRateClick?: () => void;
}

export function TreasuryRibbon({
  ngnTotal,
  ghsTotal,
  rate,
  pendingCount,
  flaggedCount,
  onEditRateClick,
}: TreasuryRibbonProps) {
  const ghsCapacity = Math.round((ghsTotal / 250000) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Rate & Margin */}
      <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[#53635a]">
          <span className="font-mono uppercase tracking-wider text-[11px]">Desk Rate</span>
          <button
            onClick={onEditRateClick}
            className="flex items-center gap-1 text-[11px] font-medium text-[#175b3b] hover:underline cursor-pointer"
          >
            <SlidersHorizontal size={11} />
            <span>Adjust Spread</span>
          </button>
        </div>
        <div className="my-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-[#10261d]">1 GHS = {rate} NGN</span>
        </div>
        <div className="text-[11px] text-[#53635a] flex items-center justify-between">
          <span>Base: ₦102.50</span>
          <span className="font-mono font-medium text-[#175b3b]">Desk Spread: +2.5%</span>
        </div>
      </div>

      {/* Nigerian Naira Float */}
      <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[#53635a]">
          <span className="font-mono uppercase tracking-wider text-[11px]">🇳🇬 Nigerian Bank Float</span>
          <span className="rounded-full bg-[#ebf2e9] px-2 py-0.5 text-[10px] font-medium text-[#175b3b]">
            Auto-Rotated
          </span>
        </div>
        <div className="my-1.5">
          <span className="text-2xl font-bold font-mono text-[#10261d]">
            ₦{(ngnTotal / 1000000).toFixed(2)}M
          </span>
        </div>
        <div className="text-[11px] text-[#53635a] flex items-center justify-between">
          <span>Active: GTBank + OPay</span>
          <span className="text-[#175b3b] font-medium">Safe from Caps</span>
        </div>
      </div>

      {/* Ghana Cedis MoMo Float */}
      <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[#53635a]">
          <span className="font-mono uppercase tracking-wider text-[11px]">🇬🇭 Ghana MoMo Float</span>
          <span className="text-[10px] font-mono text-[#53635a]">{ghsCapacity}% Health</span>
        </div>
        <div className="my-1.5 flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-[#10261d]">
            GH₵ {ghsTotal.toLocaleString()}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-[#ebf2e9] h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              ghsCapacity < 25 ? 'bg-[#b45309]' : 'bg-[#175b3b]'
            }`}
            style={{ width: `${Math.min(100, ghsCapacity)}%` }}
          />
        </div>
      </div>

      {/* Action Pipeline */}
      <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-[#53635a]">
          <span className="font-mono uppercase tracking-wider text-[11px]">Desk Pipeline</span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#175b3b]">
            <ShieldCheck size={12} />
            <span>GEV Active</span>
          </span>
        </div>
        <div className="my-1.5 flex items-center gap-3">
          <div>
            <span className="text-2xl font-bold font-mono text-[#175b3b]">{pendingCount}</span>
            <span className="text-xs text-[#53635a] ml-1">Ready</span>
          </div>
          {flaggedCount > 0 && (
            <div className="border-l border-[#e3ece1] pl-3">
              <span className="text-2xl font-bold font-mono text-[#dc2626]">{flaggedCount}</span>
              <span className="text-xs text-[#dc2626] ml-1 font-semibold">Flagged</span>
            </div>
          )}
        </div>
        <div className="text-[11px] text-[#53635a]">
          {flaggedCount > 0 ? (
            <span className="text-[#dc2626] font-medium flex items-center gap-1">
              <AlertTriangle size={11} /> 1 Suspicious trade detected
            </span>
          ) : (
            'All trades passing GEV System 1 fast-path'
          )}
        </div>
      </div>
    </div>
  );
}
