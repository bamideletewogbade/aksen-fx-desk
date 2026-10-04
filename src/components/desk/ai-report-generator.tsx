'use client';

import { useState } from 'react';
import { 
  Sparkles, Send, Copy, Check, Printer, 
  RotateCcw, ShieldCheck, ArrowRight, X, 
  Bot, Clock, FileText, ChevronRight
} from 'lucide-react';

interface AiReportGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiReportGenerator({ isOpen, onClose }: AiReportGeneratorProps) {
  const [reportType, setReportType] = useState<'MORNING_BRIEF' | 'DAILY_DIGEST' | 'LIQUIDITY_REBALANCE' | 'CUSTOM'>('MORNING_BRIEF');
  const [customQuery, setCustomQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<string>('');
  const [meta, setMeta] = useState<{ model?: string; time?: string; durationMs?: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (typeToRun?: 'MORNING_BRIEF' | 'DAILY_DIGEST' | 'LIQUIDITY_REBALANCE' | 'CUSTOM') => {
    const selected = typeToRun || reportType;
    setIsLoading(true);
    setCopied(false);

    try {
      const res = await fetch('/api/desk/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: selected,
          query: customQuery,
        }),
      });

      const data = await res.json();
      if (res.ok && data.report) {
        setReport(data.report);
        setMeta({
          model: data.model || 'qwen/qwen3.8-27b:free',
          time: data.generatedAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          durationMs: data.telemetry?.durationMs || 1200,
        });
      } else {
        throw new Error(data.error || 'Failed to generate report');
      }
    } catch (e: any) {
      console.error('Report error:', e);
      setReport('⚠️ Desk Copilot could not reach upstream inference pool. Please try again or switch to another report preset.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#e3ece1] max-h-[90vh] flex flex-col overflow-hidden text-left">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#e3ece1] pb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#175b3b] text-[#c2f576] shadow-xs">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#10261d] flex items-center gap-2">
                <span>Aksen Desk Copilot &middot; Executive Intelligence</span>
                <span className="rounded-full bg-[#ebf5e7] px-2 py-0.5 text-[9.5px] font-mono font-bold text-[#175b3b]">
                  AUTONOMOUS AGENT
                </span>
              </h3>
              <p className="text-xs text-[#53635a]">
                Generate institutional desk briefings, liquidity rebalancing directives, and settlement digests.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-[#53635a] hover:bg-neutral-100 hover:text-[#10261d] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preset Action Buttons Strip */}
        <div className="py-4 border-b border-[#e3ece1] flex flex-wrap gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setReportType('MORNING_BRIEF');
              handleGenerate('MORNING_BRIEF');
            }}
            disabled={isLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
              reportType === 'MORNING_BRIEF'
                ? 'bg-[#175b3b] text-white border-[#175b3b] shadow-xs'
                : 'bg-[#f9faf7] text-[#10261d] border-[#e3ece1] hover:bg-[#ebf2e9]'
            }`}
          >
            <Clock size={13} />
            <span>Morning Desk Brief</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportType('DAILY_DIGEST');
              handleGenerate('DAILY_DIGEST');
            }}
            disabled={isLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
              reportType === 'DAILY_DIGEST'
                ? 'bg-[#175b3b] text-white border-[#175b3b] shadow-xs'
                : 'bg-[#f9faf7] text-[#10261d] border-[#e3ece1] hover:bg-[#ebf2e9]'
            }`}
          >
            <FileText size={13} />
            <span>Daily Settlement Digest</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportType('LIQUIDITY_REBALANCE');
              handleGenerate('LIQUIDITY_REBALANCE');
            }}
            disabled={isLoading}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
              reportType === 'LIQUIDITY_REBALANCE'
                ? 'bg-[#175b3b] text-white border-[#175b3b] shadow-xs'
                : 'bg-[#f9faf7] text-[#10261d] border-[#e3ece1] hover:bg-[#ebf2e9]'
            }`}
          >
            <ShieldCheck size={13} />
            <span>Liquidity Rebalance Advice</span>
          </button>
        </div>

        {/* Report Stream Display */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 my-2 rounded-2xl bg-[#f9faf7] border border-[#e3ece1] space-y-4 font-mono text-xs text-[#20362b] leading-relaxed">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-[#53635a]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#175b3b] animate-bounce" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#175b3b] animate-bounce [animation-delay:0.2s]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#175b3b] animate-bounce [animation-delay:0.4s]" />
              </div>
              <span className="text-xs font-medium">Copilot Agent synthesizing real-time desk telemetry...</span>
            </div>
          ) : report ? (
            <div className="space-y-3 whitespace-pre-wrap">
              {report}
            </div>
          ) : (
            <div className="py-16 text-center text-[#798d81]">
              <Sparkles size={28} className="mx-auto text-[#175b3b] mb-2 opacity-60" />
              <p className="font-sans text-sm font-semibold text-[#10261d]">Ready to generate intelligence briefing</p>
              <p className="font-sans text-xs text-[#53635a] mt-0.5 max-w-sm mx-auto">
                Select a preset briefing above or type a custom question below to get instant executive recommendations.
              </p>
            </div>
          )}
        </div>

        {/* Custom Question Input Form & Footer Actions */}
        <div className="pt-3 border-t border-[#e3ece1] space-y-3 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customQuery.trim()) {
                setReportType('CUSTOM');
                handleGenerate('CUSTOM');
              }
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Ask Copilot (e.g. 'How should I allocate my ₦50M float between OPay and GTB today?')..."
              className="flex-1 rounded-2xl border border-[#e3ece1] bg-[#f9faf7] px-4 py-2.5 text-xs text-[#10261d] placeholder-[#798d81] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
            />
            <button
              type="submit"
              disabled={isLoading || !customQuery.trim()}
              className="px-4 py-2.5 rounded-2xl bg-[#175b3b] text-white hover:bg-[#0f4329] disabled:opacity-40 transition-all font-bold text-xs cursor-pointer flex items-center gap-1.5 flex-shrink-0 shadow-xs"
            >
              <span>Ask Copilot</span>
              <Send size={13} />
            </button>
          </form>

          {/* Telemetry and Action Buttons */}
          <div className="flex items-center justify-between text-xs text-[#53635a]">
            {meta ? (
              <div className="flex items-center gap-2 text-[10.5px] font-mono">
                <span className="text-[#175b3b] font-semibold">Model: {meta.model}</span>
                <span>&bull;</span>
                <span>{meta.time}</span>
                <span>&bull;</span>
                <span>{meta.durationMs}ms</span>
              </div>
            ) : (
              <span className="text-[10.5px] font-mono text-[#798d81]">Autonomous OTC Sentinel Copilot</span>
            )}

            {report && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-xl border border-[#e3ece1] bg-white px-3 py-1.5 text-xs font-semibold text-[#10261d] hover:bg-[#f9faf7] transition-all cursor-pointer shadow-2xs"
                >
                  {copied ? <Check size={13} className="text-[#175b3b]" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy Report'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1 rounded-xl border border-[#e3ece1] bg-white px-3 py-1.5 text-xs font-semibold text-[#10261d] hover:bg-[#f9faf7] transition-all cursor-pointer shadow-2xs"
                >
                  <Printer size={13} />
                  <span>Print</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
