'use client';

import { useState } from 'react';
import { 
  TrendingUp, ArrowUpRight, ArrowDownLeft, 
  Calendar, DollarSign, Filter, RefreshCw, 
  CheckCircle2, ArrowRight, BarChart2, Layers
} from 'lucide-react';

interface MonthlyDataPoint {
  month: string;
  shortMonth: string;
  orders: number;
  inflowNgnM: number;    // In millions NGN
  outflowGhsK: number;   // In thousands GHS
  spreadCapturedM: number; // In millions NGN
}

const MONTHLY_FLOWS: MonthlyDataPoint[] = [
  { month: 'November 2025', shortMonth: 'Nov', orders: 420, inflowNgnM: 210, outflowGhsK: 2000, spreadCapturedM: 5.2 },
  { month: 'December 2025', shortMonth: 'Dec', orders: 680, inflowNgnM: 350, outflowGhsK: 3330, spreadCapturedM: 8.7 },
  { month: 'January 2026', shortMonth: 'Jan', orders: 790, inflowNgnM: 420, outflowGhsK: 4000, spreadCapturedM: 10.5 },
  { month: 'February 2026', shortMonth: 'Feb', orders: 910, inflowNgnM: 490, outflowGhsK: 4660, spreadCapturedM: 12.2 },
  { month: 'March 2026', shortMonth: 'Mar', orders: 1140, inflowNgnM: 610, outflowGhsK: 5800, spreadCapturedM: 15.2 },
  { month: 'April 2026', shortMonth: 'Apr', orders: 1320, inflowNgnM: 720, outflowGhsK: 6850, spreadCapturedM: 18.0 },
  { month: 'May 2026 (MTD)', shortMonth: 'May', orders: 850, inflowNgnM: 460, outflowGhsK: 4380, spreadCapturedM: 11.5 },
];

export function AnalyticsCharts() {
  const [activeMetric, setActiveMetric] = useState<'flow' | 'orders'>('flow');
  const [selectedPoint, setSelectedPoint] = useState<MonthlyDataPoint>(MONTHLY_FLOWS[MONTHLY_FLOWS.length - 2]);

  // Max calculations for clean SVG scaling
  const maxInflow = Math.max(...MONTHLY_FLOWS.map((d) => d.inflowNgnM)) * 1.15;
  const maxOrders = Math.max(...MONTHLY_FLOWS.map((d) => d.orders)) * 1.15;

  const totalNgnCleared = MONTHLY_FLOWS.reduce((acc, curr) => acc + curr.inflowNgnM, 0);
  const totalGhsDisbursed = MONTHLY_FLOWS.reduce((acc, curr) => acc + curr.outflowGhsK, 0) / 1000;
  const totalOrders = MONTHLY_FLOWS.reduce((acc, curr) => acc + curr.orders, 0);
  const totalSpread = MONTHLY_FLOWS.reduce((acc, curr) => acc + curr.spreadCapturedM, 0);

  return (
    <div className="space-y-6">
      {/* 1. Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
        {/* Total Inflow (Naira Collected) */}
        <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#53635a]">
            <span className="font-mono uppercase tracking-wider text-[0.6875rem]">Total Cash Inflow</span>
            <span className="flex items-center text-[#175b3b] font-bold text-[0.625rem]">
              <ArrowDownLeft size={12} className="mr-0.5" /> NGN Received
            </span>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-bold font-mono text-[#10261d]">
              ₦{(totalNgnCleared).toFixed(1)}M
            </span>
          </div>
          <span className="text-[0.6875rem] text-[#53635a] block">
            Across Nigerian collection accounts
          </span>
        </div>

        {/* Total Outflow (Cedis Disbursed) */}
        <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#53635a]">
            <span className="font-mono uppercase tracking-wider text-[0.6875rem]">Total Cash Outflow</span>
            <span className="flex items-center text-[#175b3b] font-bold text-[0.625rem]">
              <ArrowUpRight size={12} className="mr-0.5" /> GHS Sent
            </span>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-bold font-mono text-[#10261d]">
              GH₵ {(totalGhsDisbursed).toFixed(2)}M
            </span>
          </div>
          <span className="text-[0.6875rem] text-[#53635a] block">
            Disbursed via MTN &amp; Telecel MoMo
          </span>
        </div>

        {/* Total Completed Orders */}
        <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#53635a]">
            <span className="font-mono uppercase tracking-wider text-[0.6875rem]">Monthly Order Run</span>
            <span className="rounded-full bg-[#ebf2e9] px-2 py-0.5 text-[0.625rem] font-mono text-[#175b3b] font-bold">
              100% CLEAR
            </span>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-bold font-mono text-[#10261d]">
              {totalOrders.toLocaleString()} Orders
            </span>
          </div>
          <span className="text-[0.6875rem] text-[#53635a] block">
            Average: 3.4 mins settlement SLA
          </span>
        </div>

        {/* Gross Spread Captured */}
        <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#53635a]">
            <span className="font-mono uppercase tracking-wider text-[0.6875rem]">Gross Spread Margin</span>
            <span className="text-[0.625rem] font-mono text-[#175b3b] font-bold">
              +2.5% AVG
            </span>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-bold font-mono text-[#175b3b]">
              ₦{(totalSpread).toFixed(1)}M
            </span>
          </div>
          <span className="text-[0.6875rem] text-[#53635a] block">
            Net captured desk arbitrage
          </span>
        </div>
      </div>

      {/* 2. Interactive Monthly Flow & Order Chart */}
      <div className="rounded-3xl border border-[#e3ece1] bg-white p-5 sm:p-6 shadow-sm space-y-5 text-left">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e3ece1] pb-4">
          <div>
            <h3 className="text-base font-bold text-[#10261d] flex items-center gap-2">
              <span>Monthly Volume &amp; Cash Flow Trends</span>
              <span className="rounded-full bg-[#ebf5e7] px-2.5 py-0.5 text-[0.625rem] font-mono font-bold text-[#175b3b]">
                HISTORICAL AUDIT
              </span>
            </h3>
            <p className="text-xs text-[#53635a] mt-0.5">
              Inspect monthly cash inflow (NGN), cash outflow (GHS), and completed ticket volume.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex p-1 rounded-full bg-[#f1f5ee] border border-[#e3ece1] text-xs">
              <button
                type="button"
                onClick={() => setActiveMetric('flow')}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  activeMetric === 'flow'
                    ? 'bg-white text-[#10261d] shadow-2xs'
                    : 'text-[#53635a] hover:text-[#10261d]'
                }`}
              >
                Inflow vs Outflow
              </button>
              <button
                type="button"
                onClick={() => setActiveMetric('orders')}
                className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  activeMetric === 'orders'
                    ? 'bg-white text-[#10261d] shadow-2xs'
                    : 'text-[#53635a] hover:text-[#10261d]'
                }`}
              >
                Order Counts
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic SVG Visualizer */}
        <div className="relative pt-4">
          <div className="h-64 w-full flex items-end gap-2 sm:gap-6 border-b border-[#e3ece1] pb-2">
            {MONTHLY_FLOWS.map((point) => {
              const isSelected = selectedPoint.month === point.month;

              if (activeMetric === 'flow') {
                const inflowHeight = (point.inflowNgnM / maxInflow) * 100;
                const outflowHeight = ((point.outflowGhsK / 10) / maxInflow) * 100;

                return (
                  <div
                    key={point.month}
                    onClick={() => setSelectedPoint(point)}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group cursor-pointer"
                  >
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-2 h-full">
                      {/* Inflow Bar (Naira) */}
                      <div
                        style={{ height: `${inflowHeight}%` }}
                        className={`w-3 sm:w-5 rounded-t-lg transition-all duration-300 ${
                          isSelected
                            ? 'bg-[#175b3b]'
                            : 'bg-[#2e7a54] group-hover:bg-[#175b3b]'
                        }`}
                        title={`${point.month} Inflow: ₦${point.inflowNgnM}M`}
                      />

                      {/* Outflow Bar (Cedis) */}
                      <div
                        style={{ height: `${outflowHeight}%` }}
                        className={`w-3 sm:w-5 rounded-t-lg transition-all duration-300 ${
                          isSelected
                            ? 'bg-[#84c441]'
                            : 'bg-[#a3db69] group-hover:bg-[#84c441]'
                        }`}
                        title={`${point.month} Outflow: GH₵ ${(point.outflowGhsK / 1000).toFixed(2)}M`}
                      />
                    </div>

                    <span
                      className={`text-[0.6875rem] font-mono transition-colors ${
                        isSelected ? 'font-bold text-[#10261d]' : 'text-[#798d81] group-hover:text-[#10261d]'
                      }`}
                    >
                      {point.shortMonth}
                    </span>
                  </div>
                );
              }

              // Orders metric view
              const orderHeight = (point.orders / maxOrders) * 100;
              return (
                <div
                  key={point.month}
                  onClick={() => setSelectedPoint(point)}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group cursor-pointer"
                >
                  <div
                    style={{ height: `${orderHeight}%` }}
                    className={`w-5 sm:w-10 rounded-t-xl transition-all duration-300 ${
                      isSelected
                        ? 'bg-[#10261d]'
                        : 'bg-[#314b3d] group-hover:bg-[#10261d]'
                    }`}
                    title={`${point.month}: ${point.orders} completed tickets`}
                  />
                  <span
                    className={`text-[0.6875rem] font-mono transition-colors ${
                      isSelected ? 'font-bold text-[#10261d]' : 'text-[#798d81] group-hover:text-[#10261d]'
                    }`}
                  >
                    {point.shortMonth}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend and Active Selected Inspection Pill */}
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              {activeMetric === 'flow' ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#175b3b]" />
                    <span className="text-[#53635a]">Inflow (₦ NGN Received)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#84c441]" />
                    <span className="text-[#53635a]">Outflow (GH₵ GHS Disbursed)</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-[#10261d]" />
                  <span className="text-[#53635a]">Completed Trade Orders</span>
                </div>
              )}
            </div>

            {/* Selected Month Detail Strip */}
            <div className="p-2.5 rounded-2xl bg-[#f9faf7] border border-[#e3ece1] flex items-center gap-3 font-mono text-[0.6875rem]">
              <span className="text-[#10261d] font-bold">{selectedPoint.month}:</span>
              <span>
                Orders: <strong className="text-[#10261d]">{selectedPoint.orders}</strong>
              </span>
              <span>
                Inflow: <strong className="text-[#175b3b]">₦{selectedPoint.inflowNgnM}M</strong>
              </span>
              <span>
                Outflow: <strong className="text-[#10261d]">GH₵ {(selectedPoint.outflowGhsK / 1000).toFixed(2)}M</strong>
              </span>
              <span>
                Spread: <strong className="text-[#175b3b]">₦{selectedPoint.spreadCapturedM}M</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
