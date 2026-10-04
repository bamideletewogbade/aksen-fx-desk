'use client';

import { useState } from 'react';
import { TradeTicket, TicketStatus } from '@/types/desk';
import { ShieldCheck, AlertTriangle, CheckCircle2, Clock, ArrowRight, ChevronRight, Phone } from 'lucide-react';

interface TradeTableProps {
  tickets: TradeTicket[];
  onSelectTicket: (ticket: TradeTicket) => void;
}

export function TradeTable({ tickets, onSelectTicket }: TradeTableProps) {
  const [filter, setFilter] = useState<'ALL' | 'ACTION' | 'SAFE' | 'FLAGGED' | 'SETTLED'>('ALL');

  const filteredTickets = tickets.filter((t) => {
    if (filter === 'ACTION') return t.status === 'SAFE_TO_DISBURSE' || t.status === 'FLAGGED_RISK';
    if (filter === 'SAFE') return t.status === 'SAFE_TO_DISBURSE';
    if (filter === 'FLAGGED') return t.status === 'FLAGGED_RISK';
    if (filter === 'SETTLED') return t.status === 'DISBURSED';
    return true;
  });

  const countAction = tickets.filter((t) => t.status === 'SAFE_TO_DISBURSE' || t.status === 'FLAGGED_RISK').length;
  const countSafe = tickets.filter((t) => t.status === 'SAFE_TO_DISBURSE').length;
  const countFlagged = tickets.filter((t) => t.status === 'FLAGGED_RISK').length;

  return (
    <div className="rounded-2xl border border-[#e3ece1] bg-white shadow-xs overflow-hidden">
      {/* Table Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3ece1] p-4 sm:px-6 bg-[#f9faf7]/50">
        <div className="flex items-center gap-1.5 p-1 bg-[#ebf2e9] rounded-xl border border-[#e3ece1]">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'ALL'
                ? 'bg-white text-[#10261d] font-bold shadow-2xs'
                : 'text-[#53635a] hover:text-[#10261d]'
            }`}
          >
            All Trades ({tickets.length})
          </button>
          <button
            onClick={() => setFilter('ACTION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
              filter === 'ACTION'
                ? 'bg-white text-[#10261d] font-bold shadow-2xs'
                : 'text-[#53635a] hover:text-[#10261d]'
            }`}
          >
            <span>Needs Action</span>
            {countAction > 0 && (
              <span className="rounded-full bg-[#175b3b] text-white px-1.5 py-0.2 text-[10px] font-mono">
                {countAction}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('SAFE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'SAFE'
                ? 'bg-white text-[#10261d] font-bold shadow-2xs'
                : 'text-[#53635a] hover:text-[#10261d]'
            }`}
          >
            Safe to Disburse ({countSafe})
          </button>
          {countFlagged > 0 && (
            <button
              onClick={() => setFilter('FLAGGED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer text-red-700 ${
                filter === 'FLAGGED'
                  ? 'bg-red-50 text-red-800 font-bold border border-red-200'
                  : 'hover:text-red-900'
              }`}
            >
              Flagged ({countFlagged})
            </button>
          )}
          <button
            onClick={() => setFilter('SETTLED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filter === 'SETTLED'
                ? 'bg-white text-[#10261d] font-bold shadow-2xs'
                : 'text-[#53635a] hover:text-[#10261d]'
            }`}
          >
            Settled
          </button>
        </div>

        <div className="text-xs text-[#53635a] font-mono">
          Showing {filteredTickets.length} of {tickets.length} tickets
        </div>
      </div>

      {/* Spacious Order Table */}
      <div className="divide-y divide-[#e3ece1]">
        {filteredTickets.map((ticket) => {
          const isSafe = ticket.status === 'SAFE_TO_DISBURSE';
          const isFlagged = ticket.status === 'FLAGGED_RISK';
          const isDisbursed = ticket.status === 'DISBURSED';
          const isAwaiting = ticket.status === 'AWAITING_PAYMENT';

          return (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket(ticket)}
              className={`group flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:px-6 transition-all cursor-pointer ${
                isFlagged
                  ? 'bg-red-50/40 hover:bg-red-50/70 border-l-4 border-l-red-500'
                  : isSafe
                  ? 'bg-white hover:bg-[#f9faf7] border-l-4 border-l-[#175b3b]'
                  : isDisbursed
                  ? 'bg-[#fcfdfb] hover:bg-[#f9faf7] opacity-80'
                  : 'bg-white hover:bg-[#f9faf7]'
              }`}
            >
              {/* Left Column: Customer & Ticket Meta */}
              <div className="flex items-start gap-4 min-w-[280px]">
                <div
                  className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    isSafe
                      ? 'bg-[#ebf2e9] text-[#175b3b]'
                      : isFlagged
                      ? 'bg-red-100 text-red-700'
                      : isDisbursed
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {isSafe ? '⚡' : isFlagged ? '⚠️' : isDisbursed ? '✓' : '⏳'}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#10261d] group-hover:text-[#175b3b] transition-colors">
                      {ticket.customerName}
                    </span>
                    <span className="font-mono text-xs text-[#53635a]">
                      Ref: {ticket.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[#53635a]">
                    <span>{ticket.whatsappPhone}</span>
                    <span>&middot;</span>
                    <span>{ticket.createdAt}</span>
                  </div>

                  <div className="text-[11px] text-[#798d81]">
                    Via {ticket.collectionBank.name} ({ticket.collectionBank.accountNumber})
                  </div>
                </div>
              </div>

              {/* Middle Column: Exchange Corridor & Amounts */}
              <div className="flex items-center gap-6 md:px-4">
                <div>
                  <span className="text-[11px] text-[#53635a] block">Inbound Inflow</span>
                  <span className="font-mono text-base font-bold text-[#10261d]">
                    ₦{ticket.amountIn.toLocaleString()}
                  </span>
                </div>

                <div className="text-[#798d81] flex flex-col items-center">
                  <span className="text-[10px] font-mono">@{ticket.rate}</span>
                  <ArrowRight size={14} />
                </div>

                <div>
                  <span className="text-[11px] text-[#53635a] block">Outbound MoMo</span>
                  <span className="font-mono text-base font-bold text-[#175b3b]">
                    GH₵ {ticket.amountOut.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-[#53635a] block">
                    {ticket.momoRecipient.network} ({ticket.momoRecipient.phoneNumber})
                  </span>
                </div>
              </div>

              {/* Right Column: GEV Verdict & Click Action */}
              <div className="flex items-center justify-between md:justify-end gap-4 min-w-[240px]">
                <div>
                  {isSafe && (
                    <div className="flex flex-col items-end">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ebf2e9] px-3 py-1 text-xs font-semibold text-[#175b3b]">
                        <ShieldCheck size={13} />
                        <span>Fast-Path Cleared</span>
                      </span>
                      <span className="text-[10px] font-mono text-[#53635a] mt-0.5">
                        P(Fraud) = {(ticket.gevSystem1.probabilityFraud * 100).toFixed(1)}% &middot; Ready
                      </span>
                    </div>
                  )}

                  {isFlagged && (
                    <div className="flex flex-col items-end">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                        <AlertTriangle size={13} />
                        <span>Triangular Fraud Alert</span>
                      </span>
                      <span className="text-[10px] font-mono text-red-600 font-semibold mt-0.5">
                        Remitter &ne; MoMo line
                      </span>
                    </div>
                  )}

                  {isDisbursed && (
                    <div className="flex flex-col items-end">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        <CheckCircle2 size={13} />
                        <span>Disbursed & Settled</span>
                      </span>
                    </div>
                  )}

                  {isAwaiting && (
                    <div className="flex flex-col items-end">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                        <Clock size={13} />
                        <span>Awaiting Bank Credit</span>
                      </span>
                      <span className="text-[10px] font-mono text-[#53635a] mt-0.5">
                        15m Rate Lock Active
                      </span>
                    </div>
                  )}
                </div>

                <div className="h-8 w-8 rounded-full flex items-center justify-center text-[#798d81] group-hover:bg-[#ebf2e9] group-hover:text-[#175b3b] transition-all">
                  <ChevronRight size={18} />
                </div>
              </div>
            </div>
          );
        })}

        {filteredTickets.length === 0 && (
          <div className="p-12 text-center text-xs text-[#53635a]">
            No trades found matching this filter.
          </div>
        )}
      </div>
    </div>
  );
}
