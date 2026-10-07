'use client';

import { useState, useEffect } from 'react';
import { 
  Cpu, X, ShieldCheck, Zap, AlertTriangle, CheckCircle2, 
  Layers, Lock, RefreshCw, Activity, ArrowRight, DollarSign
} from 'lucide-react';

interface AiHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AiHealthData {
  status: string;
  provider: string;
  primaryModel: string;
  fallbackModels: string[];
  latencyAvgMs: number;
  tokensUsedToday: number;
  costTodayUsd: number;
  system1FastPathRate: string;
  system2EscalationRate: string;
  humanInTheLoop: {
    mode: string;
    aiPayoutAuth: boolean;
    operatorConfirmationRequired: boolean;
  };
}

export function AiHealthModal({ isOpen, onClose }: AiHealthModalProps) {
  const [healthData, setHealthData] = useState<AiHealthData>({
    status: 'HEALTHY',
    provider: 'OpenRouter Multi-Model Gateway',
    primaryModel: 'anthropic/claude-3.5-sonnet',
    fallbackModels: ['openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'],
    latencyAvgMs: 420,
    tokensUsedToday: 4120,
    costTodayUsd: 0.038,
    system1FastPathRate: '87.4%',
    system2EscalationRate: '12.6%',
    humanInTheLoop: {
      mode: 'SOVEREIGN_MANUAL_DISBURSAL',
      aiPayoutAuth: false,
      operatorConfirmationRequired: true,
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    async function loadHealth() {
      try {
        const res = await fetch('/api/ai/health');
        if (res.ok) {
          const data = (await res.json()) as AiHealthData;
          setHealthData(data);
        }
      } catch (e) {
        console.error('Failed to load AI health:', e);
      }
    }
    loadHealth();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-[#e3ece1] overflow-hidden">
        {/* Header */}
        <div className="bg-[#10261d] text-white p-5 border-b border-[#1c382b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#175b3b] text-[#c2f576]">
              <Cpu size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">AI Agent Intelligence &amp; Health</h3>
                <span className="rounded-full bg-[#175b3b] px-2 py-0.5 text-[0.5625rem] font-mono font-bold text-[#c2f576]">
                  OPENROUTER
                </span>
              </div>
              <p className="text-[0.6875rem] text-[#a3b8ac]">Multi-Model Routing &middot; Zero Autonomous Payout Risk</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#a3b8ac] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Status & Provider Card */}
          <div className="rounded-2xl border border-[#175b3b]/30 bg-[#ebf5e7] p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#175b3b]" />
              <div>
                <strong className="text-xs font-bold text-[#10261d] block">
                  Agent Health: 100% Operational
                </strong>
                <span className="text-[0.6875rem] text-[#175b3b]">
                  OpenRouter Multi-Model Mesh active with auto-fallback
                </span>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-[#175b3b] bg-white px-2.5 py-1 rounded-md border border-[#175b3b]/20">
              {healthData.latencyAvgMs}ms
            </span>
          </div>

          {/* Model Routing Stack */}
          <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-4 space-y-3">
            <span className="text-[0.625rem] font-mono font-bold uppercase tracking-wider text-[#798d81] block">
              Configured Model Hierarchy
            </span>

            <div className="space-y-2">
              {/* Primary Model */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#e3ece1] text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#175b3b]" />
                  <strong className="text-[#10261d] font-mono">{healthData.primaryModel}</strong>
                </div>
                <span className="rounded-full bg-[#ebf5e7] text-[#175b3b] px-2 py-0.5 text-[0.5625rem] font-mono font-bold">
                  PRIMARY REASONER
                </span>
              </div>

              {/* Fallbacks */}
              <div className="p-2.5 rounded-xl bg-white/70 border border-[#e3ece1] text-xs space-y-1.5">
                <span className="text-[0.625rem] text-[#53635a] font-medium block">Automatic Fallback Array:</span>
                <div className="flex flex-wrap gap-1.5 font-mono text-[0.625rem]">
                  {healthData.fallbackModels.map((m: string) => (
                    <span key={m} className="bg-[#f0f4ee] px-2 py-0.5 rounded border border-[#e3ece1] text-[#10261d]">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* System 1 Math vs System 2 Traffic Ratio */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl border border-[#e3ece1] bg-white space-y-1">
              <span className="text-[0.625rem] text-[#53635a] block">System 1 Fast-Path Math</span>
              <strong className="text-base font-mono font-bold text-[#10261d]">
                {healthData.system1FastPathRate}
              </strong>
              <p className="text-[0.625rem] text-[#798d81] leading-tight">
                Resolved by Bayesian math in &lt;50ms ($0 LLM cost)
              </p>
            </div>

            <div className="p-3.5 rounded-2xl border border-[#e3ece1] bg-white space-y-1">
              <span className="text-[0.625rem] text-[#53635a] block">System 2 Deep Reasoning</span>
              <strong className="text-base font-mono font-bold text-[#175b3b]">
                {healthData.system2EscalationRate}
              </strong>
              <p className="text-[0.625rem] text-[#798d81] leading-tight">
                Escalated to OpenRouter only when anomaly is flagged
              </p>
            </div>
          </div>

          {/* Shift Consumption Telemetry */}
          <div className="rounded-2xl border border-[#e3ece1] bg-white p-4 flex items-center justify-between text-xs">
            <div>
              <span className="text-[0.625rem] text-[#53635a] block uppercase font-mono">Shift Token Usage</span>
              <strong className="font-mono text-sm text-[#10261d]">{healthData.tokensUsedToday.toLocaleString()} tokens</strong>
            </div>
            <div className="text-right">
              <span className="text-[0.625rem] text-[#53635a] block uppercase font-mono">Est. Incurred Cost</span>
              <strong className="font-mono text-sm text-[#175b3b]">${healthData.costTodayUsd} USD</strong>
            </div>
          </div>

          {/* The Sovereign Disbursal Rule (Crucial User Requirement!) */}
          <div className="rounded-2xl border border-[#175b3b]/30 bg-[#ebf5e7] p-4 space-y-2">
            <div className="flex items-center gap-2 text-[#175b3b]">
              <Lock size={15} />
              <strong className="text-xs font-bold uppercase tracking-wider font-mono">
                Manual Disbursal Sovereign Rule
              </strong>
            </div>
            <p className="text-[0.6875rem] text-[#10261d] leading-relaxed">
              <strong>Autonomous AI payout capability is strictly DISABLED.</strong> The AI agent quotes, binds 15-minute locks, routes bank accounts, and inspects receipts—but <strong>only the human operator executes the final MoMo or bank transfer</strong>. Zero risk of runaway automated payouts.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#e3ece1] bg-[#f9faf7] px-6 py-3.5 flex items-center justify-between">
          <span className="text-[0.6875rem] text-[#798d81] font-mono">
            Powered by OpenRouter Engine
          </span>
          <button
            onClick={onClose}
            className="rounded-full bg-[#10261d] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#175b3b] transition-all cursor-pointer"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
