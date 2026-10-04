'use client';

import { useState, useEffect } from 'react';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { INITIAL_BANK_ACCOUNTS, INITIAL_FLOAT_POOLS } from '@/lib/mock-data';
import { Building2, ShieldCheck, AlertTriangle, ArrowRight, RotateCw, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Session } from '@/lib/auth';

export default function TreasuryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [accounts, setAccounts] = useState(INITIAL_BANK_ACCOUNTS);
  const [pools, setPools] = useState(INITIAL_FLOAT_POOLS);

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

  return (
    <OperatorShell session={session}>
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#10261d]">
            Float &amp; Bank Account Routing
          </h1>
          <p className="text-xs text-[#53635a] mt-0.5">
            Prevent CBN &amp; NIBSS AML account freezes through dynamic bank rotation and real-time MoMo float monitoring.
          </p>
        </div>

        {/* Section 1: Nigerian Collection Bank Accounts (Anti-AML Caps) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-mono uppercase font-bold tracking-wider text-[#10261d] flex items-center gap-2">
                <Building2 size={16} className="text-[#175b3b]" />
                <span>🇳🇬 Nigerian Bank Collection Accounts</span>
              </h2>
              <p className="text-xs text-[#53635a]">
                The WhatsApp bot rotates these accounts automatically based on daily turnover caps.
              </p>
            </div>
            <span className="text-xs font-mono text-[#175b3b] font-semibold bg-[#ebf2e9] px-2.5 py-1 rounded-full">
              Dynamic Auto-Router: Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {accounts.map((acc) => {
              const pctUsed = Math.round((acc.dailyUsed / acc.dailyLimit) * 100);
              const isNearCap = pctUsed >= 80;
              const isCooling = acc.status === 'COOLING_DOWN';

              return (
                <div
                  key={acc.id}
                  className={`rounded-2xl border p-5 bg-white shadow-xs space-y-3 ${
                    isNearCap
                      ? 'border-red-300 ring-1 ring-red-300'
                      : isCooling
                      ? 'border-[#e3ece1] opacity-75'
                      : 'border-[#e3ece1]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#10261d]">{acc.bankName}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isNearCap
                          ? 'bg-red-100 text-red-700'
                          : isCooling
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-[#ebf2e9] text-[#175b3b]'
                      }`}
                    >
                      {isNearCap ? 'NEAR CAP' : isCooling ? 'COOLING OFF' : 'ROUTING'}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-[#53635a]">
                    Acc: {acc.accountNumber}
                    <span className="block text-[11px] text-[#798d81] truncate">{acc.accountName}</span>
                  </div>

                  {/* Daily Cap Meter */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#53635a]">Daily NIBSS Inflow:</span>
                      <strong className={isNearCap ? 'text-red-600' : 'text-[#10261d]'}>
                        {pctUsed}%
                      </strong>
                    </div>
                    <div className="w-full bg-[#ebf2e9] h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isNearCap ? 'bg-red-500' : pctUsed > 50 ? 'bg-[#175b3b]' : 'bg-[#175b3b]'
                        }`}
                        style={{ width: `${Math.min(100, pctUsed)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#798d81] font-mono">
                      <span>₦{(acc.dailyUsed / 1000000).toFixed(1)}M used</span>
                      <span>Cap: ₦{(acc.dailyLimit / 1000000).toFixed(0)}M</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Ghana Mobile Money Float Pool ("The One-Way River") */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-mono uppercase font-bold tracking-wider text-[#10261d] flex items-center gap-2">
              <span>🇬🇭 Ghana Mobile Money Float Health</span>
            </h2>
            <p className="text-xs text-[#53635a]">
              Track Cedi reserves across MTN MoMo and Ecobank to prevent disbursement stall outs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#e3ece1] bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#53635a] font-mono">Ghana Float Balance</span>
                  <div className="text-3xl font-bold font-mono text-[#10261d] mt-1">
                    GH₵ {pools.ghs.totalBalance.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-[#ebf2e9] text-[#175b3b] p-3 text-right">
                  <span className="text-xs font-bold block">Available for Payout</span>
                  <span className="text-lg font-mono font-bold">
                    GH₵ {pools.ghs.availableBalance.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="font-semibold text-[#10261d]">Active Distribution:</div>
                {pools.ghs.topAccounts.map((line, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[#f9faf7]">
                    <span className="text-[#53635a]">{line.split(' (')[0]}</span>
                    <span className="font-mono font-bold text-[#10261d]">{line.split(' (')[1]?.replace(')', '')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#e3ece1] bg-white p-6 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#175b3b]">
                  <CheckCircle2 size={16} />
                  <span>The "One-Way River" Rebalancing Bridge</span>
                </div>
                <p className="text-xs text-[#53635a] leading-relaxed">
                  When heavy trade in one direction (NGN &rarr; GHS) drains your Ghana MoMo float, request instant liquidity injection from diaspora partners in the Syndicates module.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#f9faf7] border border-[#e3ece1] flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-[#53635a] block">Depletion Threshold Alert:</span>
                  <span className="text-xs font-mono font-bold text-[#10261d]">Triggers below GH₵ 30,000</span>
                </div>
                <button
                  onClick={() => alert('Triggered liquidity rebalance request to Float Syndicate partners.')}
                  className="rounded-full bg-[#10261d] px-4 py-2 text-xs font-bold text-white hover:bg-[#175b3b] transition-all cursor-pointer"
                >
                  Request Float Top-Up
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </OperatorShell>
  );
}
