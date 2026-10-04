'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Lock, 
  X, 
  ArrowRight, 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2, 
  Sparkles, 
  Mail,
  Eye,
  EyeOff
} from 'lucide-react';
import { PRESET_ACCOUNTS, Session } from '@/lib/auth';

interface OperatorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (session: Session) => void;
}

export function OperatorLoginModal({ isOpen, onClose, onSuccess }: OperatorLoginModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState('bishop@aksen.com');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handle1ClickPreset = (presetKey: string) => {
    const preset = PRESET_ACCOUNTS[presetKey];
    if (!preset) return;
    setEmail(preset.email);
    setPassword(preset.defaultPin);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid credentials.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      if (data.session && onSuccess) {
        onSuccess(data.session);
      }
      onClose();
      router.push('/desk');
      router.refresh();
    } catch (err) {
      console.error('Failed to log in:', err);
      setError('Connection failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-[#e3ece1] overflow-hidden">
        {/* Header Ribbon */}
        <div className="bg-[#10261d] text-white p-5 sm:p-6 border-b border-[#1c382b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#175b3b] text-[#c2f576]">
              <Lock size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Operator Terminal Access</h3>
                <span className="rounded-full bg-[#175b3b] px-2 py-0.5 text-[9px] font-mono font-bold text-[#c2f576]">
                  ZERO-FRICTION
                </span>
              </div>
              <p className="text-[11px] text-[#a3b8ac] font-mono">West Africa Bureau Desk &bull; Live Intake</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#a3b8ac] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Zero Friction Callout */}
          <div className="rounded-2xl border border-[#175b3b]/20 bg-[#ebf5e7] p-3.5 flex items-start gap-2.5 text-xs text-[#175b3b]">
            <Sparkles size={16} className="flex-shrink-0 mt-0.5" />
            <span className="leading-snug">
              <strong>Testing Mode:</strong> Any valid email and any 6-digit passcode is accepted instantly with zero verification delays.
            </span>
          </div>

          {/* 1-Click Fast Pass Persona Selector */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#798d81] block">
              1-Click Fast Pass (Select Test Persona)
            </span>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PRESET_ACCOUNTS).map(([key, acc]) => {
                const isSelected = email.toLowerCase() === acc.email.toLowerCase();
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handle1ClickPreset(key)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#175b3b] bg-[#f2f8f0] ring-1 ring-[#175b3b]'
                        : 'border-[#e3ece1] bg-[#f9faf7] hover:bg-[#ebf2e9]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <strong className="text-[11.5px] font-bold text-[#10261d] truncate">{acc.name.split(' ')[0]}</strong>
                      {isSelected && <CheckCircle2 size={12} className="text-[#175b3b] flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] text-[#53635a] block truncate">{acc.role.split(' ')[0]}</span>
                    <span className="text-[9px] font-mono text-[#175b3b] block mt-1">PIN: {acc.defaultPin}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-3.5 pt-1">
            <div>
              <label className="text-xs font-semibold text-[#53635a] block mb-1">
                Operator Work Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@bureau.com"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono font-bold text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                />
                <Mail size={14} className="absolute right-3.5 top-3 text-[#798d81]" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#53635a]">
                  Passcode / Security PIN
                </label>
                <span className="text-[10px] font-mono text-[#175b3b]">
                  6 digits min
                </span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter 6 digits"
                  className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-2.5 text-[#798d81] hover:text-[#10261d] cursor-pointer"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-[#175b3b] py-3 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                <span>{isLoading ? 'Verifying Session...' : 'Sign In to Live Trading Desk'}</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="text-center pt-1">
              <span className="text-[10px] font-mono text-[#798d81]">
                Signal Protocol Verified &bull; Clerk Auth Seam Ready
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
