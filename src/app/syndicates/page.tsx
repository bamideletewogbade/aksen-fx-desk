'use client';

import { useState, useEffect } from 'react';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { Session } from '@/lib/auth';
import { Users, TrendingUp, ShieldCheck, ArrowRight, DollarSign, PieChart } from 'lucide-react';

interface SyndicatePartner {
  id: string;
  name: string;
  location: string;
  capitalStaked: number;
  currency: 'USD' | 'NGN' | 'GHS';
  sharePct: number;
  accruedYield: number;
}

const PARTNERS: SyndicatePartner[] = [
  {
    id: 'lp-1',
    name: 'Kofi & Sons Trading',
    location: 'London, UK (Diaspora)',
    capitalStaked: 25000,
    currency: 'USD',
    sharePct: 45.5,
    accruedYield: 1840.5,
  },
  {
    id: 'lp-2',
    name: 'Alhaji Bashir Capital',
    location: 'Kano, Nigeria',
    capitalStaked: 18000,
    currency: 'USD',
    sharePct: 32.7,
    accruedYield: 1324.2,
  },
  {
    id: 'lp-3',
    name: 'Accra Logistics Syndicate',
    location: 'Accra, Ghana',
    capitalStaked: 12000,
    currency: 'USD',
    sharePct: 21.8,
    accruedYield: 882.8,
  },
];

export default function SyndicatesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [partners, setPartners] = useState(PARTNERS);
  const [stakeAmount, setStakeAmount] = useState<number>(5000);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        }
      } catch {}
    }
    loadSession();
  }, []);

  const totalCapitalUSD = partners.reduce((sum, p) => sum + p.capitalStaked, 0);
  const totalAccruedUSD = partners.reduce((sum, p) => sum + p.accruedYield, 0);

  return (
    <OperatorShell session={session}>
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-left">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#10261d]">
            Float Syndicates &amp; Capital Pools
          </h1>
          <p className="text-xs text-[#53635a] mt-0.5">
            Scale daily turnover 5x&ndash;10x by pooling liquidity from trusted diaspora and merchant partners.
          </p>
        </div>

        {/* The 70 / 20 / 10 Waterfall Visualizer */}
        <section className="rounded-2xl border border-[#e3ece1] bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-mono uppercase font-bold tracking-wider text-[#10261d]">
                Automated 70 / 20 / 10 Spread Waterfall
              </h2>
              <p className="text-xs text-[#53635a]">
                Every basis point captured on the desk is distributed automatically upon trade settlement.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#175b3b] bg-[#ebf2e9] px-3 py-1 rounded-full">
              Zero Ledger Drift
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* 70% LPs */}
            <div className="rounded-xl border border-[#c2f576] bg-[#f9fef3] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold font-mono text-[#175b3b]">70%</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#ebf2e9] text-[#175b3b]">
                  LPs
                </span>
              </div>
              <strong className="text-xs font-bold text-[#10261d] block">Capital Providers Yield</strong>
              <p className="text-[11px] text-[#53635a] leading-relaxed">
                Distributed pro-rata to diaspora and merchant partners funding the corridor's MoMo and bank floats.
              </p>
            </div>

            {/* 20% Desk Operator */}
            <div className="rounded-xl border border-[#e3ece1] bg-[#f9faf7] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold font-mono text-[#10261d]">20%</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-gray-100 text-[#10261d]">
                  Operator
                </span>
              </div>
              <strong className="text-xs font-bold text-[#10261d] block">Desk Management Fee</strong>
              <p className="text-[11px] text-[#53635a] leading-relaxed">
                Retained by the bureau operator for managing counterparty intake, customer relationships, and payouts.
              </p>
            </div>

            {/* 10% Reserve Buffer */}
            <div className="rounded-xl border border-[#e3ece1] bg-[#f9faf7] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold font-mono text-[#53635a]">10%</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-gray-100 text-[#53635a]">
                  Reserve
                </span>
              </div>
              <strong className="text-xs font-bold text-[#10261d] block">Emergency Reserve Buffer</strong>
              <p className="text-[11px] text-[#53635a] leading-relaxed">
                Compounded in a treasury reserve to absorb sudden central bank FX devaluations or temporary bank holds.
              </p>
            </div>
          </div>
        </section>

        {/* Active Syndicate Cap Table */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase font-bold tracking-wider text-[#10261d] flex items-center gap-2">
              <Users size={16} className="text-[#175b3b]" />
              <span>Active Syndicate Cap Table</span>
            </h2>
            <div className="text-xs font-mono text-[#53635a]">
              Total Pooled Capital: <strong className="text-[#10261d]">${totalCapitalUSD.toLocaleString()}</strong>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-white shadow-xs overflow-hidden">
            <div className="divide-y divide-[#e3ece1]">
              {partners.map((p) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 gap-3">
                  <div>
                    <strong className="text-xs font-bold text-[#10261d] block">{p.name}</strong>
                    <span className="text-[11px] text-[#53635a]">{p.location}</span>
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-[10px] text-[#53635a] block">Capital Staked</span>
                      <span className="text-xs font-mono font-bold text-[#10261d]">
                        ${p.capitalStaked.toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#53635a] block">Pool Share</span>
                      <span className="text-xs font-mono font-bold text-[#175b3b]">
                        {p.sharePct}%
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-[#53635a] block">Accrued 30d Yield</span>
                      <span className="text-xs font-mono font-bold text-[#175b3b]">
                        +${p.accruedYield.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </OperatorShell>
  );
}
