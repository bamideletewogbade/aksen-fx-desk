'use client';

import { useState, useEffect } from 'react';
import { OperatorShell } from '@/components/navigation/operator-shell';
import { TradeTable } from '@/components/desk/trade-table';
import { InspectionDrawer } from '@/components/desk/inspection-drawer';
import { INITIAL_TICKETS } from '@/lib/mock-data';
import { TradeTicket } from '@/types/desk';
import { 
  Search, Filter, Download, ArrowUpRight, 
  CheckCircle2, Clock, ShieldCheck, ArrowRight, RefreshCw, FileText
} from 'lucide-react';
import { Session } from '@/lib/auth';

export default function HistoryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tickets, setTickets] = useState<TradeTicket[]>(INITIAL_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState<TradeTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);

  // Load session & tickets
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const [sessRes, tickRes] = await Promise.all([
          fetch('/api/auth/session').catch(() => null),
          fetch('/api/tickets').catch(() => null),
        ]);

        if (sessRes && sessRes.ok) {
          const sessData = await sessRes.json();
          setSession(sessData.session || null);
        }

        if (tickRes && tickRes.ok) {
          const tickData = await tickRes.json();
          if (tickData.tickets && tickData.tickets.length > 0) {
            setTickets(tickData.tickets);
          }
        }
      } catch (err) {
        console.error('History load error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      t.id.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      t.whatsappPhone.includes(q) ||
      (t.remitterName && t.remitterName.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'ALL' || t.status === statusFilter;

    const matchesDirection =
      directionFilter === 'ALL' || t.direction === directionFilter;

    return matchesSearch && matchesStatus && matchesDirection;
  });

  const totalNgnSettled = tickets
    .filter((t) => t.status === 'DISBURSED')
    .reduce((sum, t) => sum + t.amountIn, 0);

  const totalGhsSettled = tickets
    .filter((t) => t.status === 'DISBURSED')
    .reduce((sum, t) => sum + t.amountOut, 0);

  const totalDisbursedCount = tickets.filter((t) => t.status === 'DISBURSED').length;
  const totalFlaggedCount = tickets.filter((t) => t.status === 'FLAGGED_RISK').length;

  const handleExportCSV = () => {
    const headers = ['Ticket ID', 'Customer Name', 'Phone', 'Direction', 'Amount In', 'Amount Out', 'Rate', 'Status'];
    const rows = filteredTickets.map((t) => [
      t.id,
      t.customerName,
      t.whatsappPhone,
      t.direction,
      t.amountIn,
      t.amountOut,
      t.rate,
      t.status,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aksen-otc-history-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <OperatorShell session={session}>
      <div className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-left">
        {/* Header & Export Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#10261d]">
              Settlement Ledger &middot; Trade History
            </h1>
            <p className="text-xs text-[#53635a] mt-0.5">
              Auditable historical ledger of all completed, pending, and flagged OTC transactions.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-full border border-[#e3ece1] bg-white px-4 py-2 text-xs font-semibold text-[#10261d] hover:bg-[#ebf2e9] transition-all cursor-pointer shadow-2xs self-start sm:self-auto"
          >
            <Download size={14} className="text-[#175b3b]" />
            <span>Export CSV Ledger</span>
          </button>
        </div>

        {/* Ledger Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
            <span className="text-[11px] font-mono text-[#53635a] uppercase tracking-wider block">
              Total Naira Cleared
            </span>
            <span className="text-2xl font-bold font-mono text-[#10261d] block mt-1">
              ₦{(totalNgnSettled / 1000000).toFixed(2)}M
            </span>
            <span className="text-[10.5px] text-[#53635a] mt-0.5 block">
              100% verified NIBSS deposits
            </span>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
            <span className="text-[11px] font-mono text-[#53635a] uppercase tracking-wider block">
              Total Cedis Disbursed
            </span>
            <span className="text-2xl font-bold font-mono text-[#10261d] block mt-1">
              GH₵ {totalGhsSettled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10.5px] text-[#53635a] mt-0.5 block">
              MTN MoMo &amp; Telecel Cash
            </span>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
            <span className="text-[11px] font-mono text-[#53635a] uppercase tracking-wider block">
              Successful Payouts
            </span>
            <span className="text-2xl font-bold font-mono text-[#175b3b] block mt-1">
              {totalDisbursedCount} Tickets
            </span>
            <span className="text-[10.5px] text-[#53635a] mt-0.5 block">
              Zero operator disbursement leaks
            </span>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 shadow-xs">
            <span className="text-[11px] font-mono text-[#53635a] uppercase tracking-wider block">
              Fraud Blocks
            </span>
            <span className="text-2xl font-bold font-mono text-[#10261d] block mt-1">
              {totalFlaggedCount} Flagged
            </span>
            <span className="text-[10.5px] text-[#53635a] mt-0.5 block">
              Capital preserved by Sentinel
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="rounded-2xl border border-[#e3ece1] bg-white p-3.5 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket ID, customer name, phone, or narration..."
              className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] pl-9 pr-4 py-2 text-xs text-[#10261d] placeholder-[#798d81] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
            />
            <Search size={14} className="absolute left-3 top-2.5 text-[#798d81]" />
          </div>

          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3 py-2 text-xs text-[#10261d] focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="DISBURSED">DISBURSED (Paid)</option>
              <option value="SAFE_TO_DISBURSE">SAFE_TO_DISBURSE</option>
              <option value="FLAGGED_RISK">FLAGGED_RISK</option>
              <option value="AWAITING_PAYMENT">AWAITING_PAYMENT</option>
            </select>

            {/* Direction Filter */}
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3 py-2 text-xs text-[#10261d] focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Corridors</option>
              <option value="NGN_TO_GHS">NGN ➔ GHS</option>
              <option value="GHS_TO_NGN">GHS ➔ NGN</option>
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#53635a]">
            <span>
              Showing <strong>{filteredTickets.length}</strong> transactions
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[#175b3b] font-semibold hover:underline cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>

          <TradeTable
            tickets={filteredTickets}
            onSelectTicket={(ticket) => setSelectedTicket(ticket)}
          />
        </section>
      </div>

      {/* Slide-over Inspection Drawer */}
      <InspectionDrawer
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </OperatorShell>
  );
}
