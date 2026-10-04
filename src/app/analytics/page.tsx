'use client';

import { useState, useEffect } from 'react';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { AnalyticsCharts } from '@/components/desk/analytics-charts';
import { Session } from '@/lib/auth';
import { BarChart3, TrendingUp, DollarSign, Clock, ShieldCheck, ArrowRight, Bot } from 'lucide-react';
import { AiReportGenerator } from '@/components/desk/ai-report-generator';

export default function AnalyticsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadSession();
  }, []);

  return (
    <OperatorShell session={session}>
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-left">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#10261d]">
              Analytics &middot; Monthly Orders &amp; Cash Flow
            </h1>
            <p className="text-xs text-[#53635a] mt-0.5">
              Comprehensive monthly performance, cash inflow vs outflow, order throughput, and spread capture.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCopilotOpen(true)}
            className="flex items-center gap-2 rounded-full bg-[#175b3b] hover:bg-[#0f4329] text-white text-xs font-bold px-4 py-2.5 transition-all cursor-pointer shadow-xs self-start sm:self-auto"
          >
            <Bot size={15} />
            <span>Ask Copilot for Insights</span>
          </button>
        </div>

        {/* The Analytics Charts */}
        <AnalyticsCharts />

        {/* Performance Highlights Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="rounded-2xl border border-[#e3ece1] bg-white p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#10261d]">
              <Clock size={16} className="text-[#175b3b]" />
              <span>Settlement Turnaround SLA</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#10261d]">
              3.4 mins
            </div>
            <p className="text-xs text-[#53635a] leading-relaxed">
              98.4% of all orders are disbursed to Ghana MoMo within 5 minutes of Nigerian bank deposit confirmation.
            </p>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-white p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#10261d]">
              <ShieldCheck size={16} className="text-[#175b3b]" />
              <span>Fraud Preservation Rate</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#175b3b]">
              100.0%
            </div>
            <p className="text-xs text-[#53635a] leading-relaxed">
              Zero unauthorized disbursements. GEV System 1 caught 14 altered Canva slips, saving ₦28.5M in potential leakage.
            </p>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-white p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#10261d]">
              <TrendingUp size={16} className="text-[#175b3b]" />
              <span>Corridor Volume Dominance</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#10261d]">
              82% / 18%
            </div>
            <p className="text-xs text-[#53635a] leading-relaxed">
              82% of flow moves from Nigeria Bank to Ghana MoMo (NGN ➔ GHS). 18% moves reverse (GHS ➔ NGN) for goods import.
            </p>
          </div>
        </div>
      </div>

      <AiReportGenerator
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
      />
    </OperatorShell>
  );
}
