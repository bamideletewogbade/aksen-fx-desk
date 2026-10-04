'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { TreasuryRibbon } from '@/components/desk/treasury-ribbon';
import { TradeTable } from '@/components/desk/trade-table';
import { InspectionDrawer } from '@/components/desk/inspection-drawer';
import { CustomerSimulator } from '@/components/desk/customer-simulator';
import { AnalyticsCharts } from '@/components/desk/analytics-charts';
import { INITIAL_TICKETS, INITIAL_FLOAT_POOLS } from '@/lib/mock-data';
import { TradeTicket } from '@/types/desk';
import { MessageSquare, SlidersHorizontal, X, BarChart3, ChevronDown, ChevronUp, TrendingUp, Bot, ArrowUpRight } from 'lucide-react';
import { AiHealthModal } from '@/components/desk/ai-health-modal';
import { Session, PRESET_ACCOUNTS, initialsOf } from '@/lib/auth';

export default function OperatorDeskPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [tickets, setTickets] = useState<TradeTicket[]>(INITIAL_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState<TradeTicket | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isAiHealthOpen, setIsAiHealthOpen] = useState(false);
  const [isAnalyticsExpanded, setIsAnalyticsExpanded] = useState(false);

  // Check auth session
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          setSession(data.session || null);
        } else {
          setSession(null);
        }
      } catch {
        setSession(null);
      } finally {
        setIsAuthChecking(false);
      }
    }
    checkAuth();
  }, []);

  const handleFastPassLogin = async (presetKey: string) => {
    const acc = PRESET_ACCOUNTS[presetKey];
    if (!acc) return;
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.defaultPin }),
      });
      const data = await res.json();
      if (res.ok && data.session) {
        setSession(data.session);
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Fetch live tickets from Neon Postgres
  useEffect(() => {
    async function loadTickets() {
      try {
        const res = await fetch('/api/tickets');
        if (res.ok) {
          const data = await res.json();
          if (data.tickets && data.tickets.length > 0) {
            setTickets(data.tickets);
            if (data.source === 'neon_postgres') {
              setIsDbConnected(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load tickets from DB:', err);
      }
    }
    loadTickets();
  }, []);

  // Treasury pools
  const [ngnPool, setNgnPool] = useState(INITIAL_FLOAT_POOLS.ngn.totalBalance);
  const [ghsPool, setGhsPool] = useState(INITIAL_FLOAT_POOLS.ghs.totalBalance);

  // Rate config
  const [baseRate, setBaseRate] = useState(102.5);
  const [spreadPct, setSpreadPct] = useState(2.5);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);

  const effectiveRate = parseFloat((baseRate * (1 + spreadPct / 100)).toFixed(2));

  // Counts
  const pendingCount = tickets.filter((t) => t.status === 'SAFE_TO_DISBURSE').length;
  const flaggedCount = tickets.filter((t) => t.status === 'FLAGGED_RISK').length;

  const handleDisburse = async (ticketId: string) => {
    const target = tickets.find((t) => t.id === ticketId);
    if (!target) return;

    // Update ticket state in UI
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: 'DISBURSED' } : t))
    );

    // Update liquidity float in real-time
    setNgnPool((prev) => prev + target.amountIn);
    setGhsPool((prev) => Math.max(0, prev - target.amountOut));

    // Update open drawer state
    setSelectedTicket((prev) => (prev ? { ...prev, status: 'DISBURSED' } : null));

    // Persist to Neon Postgres
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_STATUS', ticketId, newStatus: 'DISBURSED' }),
      });
    } catch (err) {
      console.error('Failed to update status in DB:', err);
    }
  };

  const handleBlockRisk = async (ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status: 'FLAGGED_RISK',
              whatsappTranscript: [
                ...t.whatsappTranscript,
                {
                  sender: 'operator',
                  time: 'Just now',
                  text: 'Trade rejected. Remitter identity does not match receiving MoMo account.',
                },
              ],
            }
          : t
      )
    );
    setSelectedTicket(null);

    // Persist to Neon Postgres
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_STATUS', ticketId, newStatus: 'FLAGGED_RISK' }),
      });
    } catch (err) {
      console.error('Failed to update status in DB:', err);
    }
  };

  const handleSimulateNewTicket = async (newTicket: TradeTicket) => {
    setTickets((prev) => [newTicket, ...prev]);
    setSelectedTicket(newTicket);

    // Persist to Neon Postgres
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_TICKET', ticket: newTicket }),
      });
    } catch (err) {
      console.error('Failed to persist simulated ticket in DB:', err);
    }
  };

  return (
    <OperatorShell session={session}>
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Desk Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#10261d]">
              Operator Trading Desk
            </h1>
            <p className="text-xs text-[#53635a] mt-0.5">
              Live intake from WhatsApp &middot; GEV System 1 fast-path enabled &middot; Human-in-the-loop settlement
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Walkthrough Simulator Trigger */}
            <button
              onClick={() => setIsSimulatorOpen(true)}
              className="flex items-center gap-2 rounded-full border border-[#175b3b] bg-[#ebf2e9] px-4 py-2 text-xs font-bold text-[#175b3b] hover:bg-[#d8e8d4] transition-all cursor-pointer shadow-2xs"
            >
              <MessageSquare size={14} />
              <span>Simulate Customer Intake</span>
            </button>
          </div>
        </div>

        {/* Treasury Ribbon */}
        <TreasuryRibbon
          ngnTotal={ngnPool}
          ghsTotal={ghsPool}
          rate={effectiveRate}
          pendingCount={pendingCount}
          flaggedCount={flaggedCount}
          onEditRateClick={() => setIsRateModalOpen(true)}
        />

        {/* Monthly Volume & Flow Velocity Bar */}
        <div className="rounded-2xl border border-[#e3ece1] bg-white p-3.5 sm:p-4 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ebf2e9] text-[#175b3b]">
                <BarChart3 size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#10261d] flex items-center gap-2">
                  <span>Monthly Desk Performance</span>
                  <span className="rounded-md bg-[#f0f4ee] px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-[#53635a]">
                    MAY 2026 MTD
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#53635a] mt-0.5">
                  <span>Inflow: <strong className="text-[#10261d]">₦460.0M</strong></span>
                  <span>&bull;</span>
                  <span>Outflow: <strong className="text-[#10261d]">GH₵4.38M</strong></span>
                  <span>&bull;</span>
                  <span>Orders: <strong className="text-[#175b3b]">850</strong></span>
                  <span>&bull;</span>
                  <span>Spread: <strong className="text-[#175b3b]">₦11.5M</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setIsAnalyticsExpanded(!isAnalyticsExpanded)}
                className="flex items-center gap-1.5 rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3 py-1.5 text-xs font-semibold text-[#10261d] hover:bg-[#ebf2e9] transition-all cursor-pointer shadow-2xs"
              >
                <span>{isAnalyticsExpanded ? 'Hide Chart' : 'Show Flow Chart'}</span>
                {isAnalyticsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              <Link
                href="/analytics"
                className="flex items-center gap-1 rounded-xl bg-[#175b3b] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#0f4329] transition-all shadow-2xs"
              >
                <span>Full Analytics</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>

          {/* Collapsible Chart View */}
          {isAnalyticsExpanded && (
            <div className="pt-3 border-t border-[#e3ece1] animate-in fade-in duration-200">
              <AnalyticsCharts />
            </div>
          )}
        </div>

        {/* Trade Orders Queue */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase font-bold tracking-wider text-[#53635a]">
              Incoming Counterparty Queue
            </h2>
            <span className="text-xs font-mono text-[#175b3b] font-medium">
              Auto-sync active (NIP &amp; MoMo)
            </span>
          </div>

          <TradeTable
            tickets={tickets}
            onSelectTicket={(ticket) => setSelectedTicket(ticket)}
          />
        </section>
      </div>

      {/* Slide-over Inspection Drawer */}
      <InspectionDrawer
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onDisburse={handleDisburse}
        onBlockRisk={handleBlockRisk}
      />

      {/* Customer WhatsApp Intake Simulator */}
      <CustomerSimulator
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onSimulateTicket={handleSimulateNewTicket}
      />

      {/* AI Intelligence & Health Telemetry Modal */}
      <AiHealthModal
        isOpen={isAiHealthOpen}
        onClose={() => setIsAiHealthOpen(false)}
      />

      {/* Quick Rate Adjuster Modal */}
      {isRateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-[#e3ece1] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#10261d]">Adjust Corridor Pricing</h3>
              <button
                onClick={() => setIsRateModalOpen(false)}
                className="text-[#53635a] hover:text-[#10261d] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-[#53635a] block mb-1">
                  Base Interbank Rate (1 GHS in NGN)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={baseRate}
                  onChange={(e) => setBaseRate(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[#e3ece1] p-2.5 font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-[#53635a] block mb-1">
                  Desk Spread Margin (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={spreadPct}
                  onChange={(e) => setSpreadPct(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[#e3ece1] p-2.5 font-mono text-sm"
                />
              </div>

              <div className="rounded-xl bg-[#f9faf7] p-3 text-xs text-[#53635a] font-mono">
                Quoted Customer Rate: <strong>1 GHS = {effectiveRate} NGN</strong>
              </div>
            </div>

            <button
              onClick={() => setIsRateModalOpen(false)}
              className="w-full rounded-full bg-[#175b3b] py-2.5 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer"
            >
              Save New Desk Rate
            </button>
          </div>
        </div>
      )}
    </OperatorShell>
  );
}
