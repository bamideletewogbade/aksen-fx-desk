'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Lock, 
  ArrowRight, 
  KeyRound, 
  UserCheck, 
  CheckCircle2, 
  ArrowLeft,
  Mail,
  Eye,
  EyeOff,
  UserCog
} from 'lucide-react';
import { PRESET_ACCOUNTS } from '@/lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/desk';

  const [email, setEmail] = useState('bishop@aksen.com');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle1ClickPreset = (presetKey: string) => {
    const preset = PRESET_ACCOUNTS[presetKey];
    if (!preset) return;
    setEmail(preset.email);
    setPassword(preset.defaultPin);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed. Please verify credentials.');
        setLoading(false);
        return;
      }

      // Successful login -> route to desk
      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      console.error('Auth error:', err);
      setError('Network communication failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9faf7] text-[#10261d] flex flex-col justify-between selection:bg-[#c2f576] selection:text-[#10261d]">
      {/* Top Header */}
      <header className="border-b border-[#e3ece1] bg-white/80 backdrop-blur-md px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group text-decoration-none">
          <div className="h-2.5 w-2.5 rotate-45 rounded-[1px] bg-[#175b3b]" />
          <span className="font-bold text-sm tracking-tight text-[#10261d] group-hover:text-[#175b3b] transition-colors">
            AKSEN <span className="font-normal text-xs text-[#798d81]">OTC</span>
          </span>
          <span className="hidden sm:inline-block text-[10px] font-mono uppercase bg-[#ebf5e7] border border-[#175b3b]/20 px-2 py-0.5 rounded-full text-[#175b3b] font-semibold">
            OPERATOR DESK ACCESS
          </span>
        </Link>

        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-[#53635a] hover:text-[#10261d] transition-colors font-medium"
        >
          <ArrowLeft size={13} />
          <span>Back to Landing</span>
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-xl space-y-6">
          {/* Master Admin Notice Card */}
          <div className="rounded-2xl border border-[#175b3b]/20 bg-[#ebf5e7] p-4 flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#175b3b] text-[#c2f576] flex-shrink-0 mt-0.5">
              <UserCog size={16} />
            </div>
            <div className="space-y-0.5 text-left">
              <h4 className="text-xs font-bold text-[#10261d]">
                Master Admin Provisioning Model
              </h4>
              <p className="text-[11.5px] text-[#2e473b] leading-relaxed">
                Public self-registration is closed. Master Admins provision operator accounts and assign role-based permissions (Chief Dealer, Settlement Officer, Auditor) from the desk management console.
              </p>
            </div>
          </div>

          {/* 1-Click Fast Pass Presets */}
          <div className="rounded-3xl border border-[#e3ece1] bg-white p-5 sm:p-6 shadow-sm space-y-3.5 text-left">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#798d81] block">
              1-Click Operator Pass (Select Role to Test)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {Object.entries(PRESET_ACCOUNTS).map(([key, acc]) => {
                const isSelected = email.toLowerCase() === acc.email.toLowerCase();
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handle1ClickPreset(key)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#175b3b] bg-[#f2f8f0] ring-1 ring-[#175b3b]'
                        : 'border-[#e3ece1] bg-[#f9faf7] hover:bg-[#ebf2e9] hover:border-[#cbd8c8]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <strong className="text-xs font-bold text-[#10261d]">{acc.name}</strong>
                        {isSelected && <CheckCircle2 size={13} className="text-[#175b3b]" />}
                      </div>
                      <span className="text-[10.5px] text-[#53635a] block line-clamp-1">{acc.role}</span>
                    </div>
                    <span className="text-[9.5px] font-mono text-[#175b3b] font-semibold mt-2 block">
                      PIN: {acc.defaultPin}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Auth Card Form */}
          <div className="rounded-3xl border border-[#e3ece1] bg-white p-6 sm:p-8 shadow-md space-y-6 text-left">
            <div className="border-b border-[#e3ece1] pb-4">
              <h2 className="text-lg font-bold text-[#10261d]">
                Operator Sign In
              </h2>
              <p className="text-xs text-[#53635a] mt-0.5">
                Sign in with your authorized work email and 6-digit access PIN.
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="bishop@aksen.com"
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                  />
                  <Mail size={14} className="absolute right-3.5 top-3 text-[#798d81]" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#53635a]">
                    6-Digit Security PIN
                  </label>
                  <span className="text-[10px] font-mono text-[#798d81]">
                    Numeric passkey
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    maxLength={10}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="123456"
                    className="w-full rounded-xl border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-2.5 text-xs font-mono tracking-widest text-[#10261d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#175b3b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-[#798d81] hover:text-[#10261d] cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-[#175b3b] py-3 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {loading ? (
                  <span>Authenticating Operator...</span>
                ) : (
                  <>
                    <Lock size={13} className="text-[#c2f576]" />
                    <span>Enter Operator Desk</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e3ece1] bg-white py-4 px-4 sm:px-8 text-center text-xs text-[#53635a]">
        <span>Aksen OTC Bureau Operating System &middot; Authorized Personnel Only</span>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f9faf7] flex items-center justify-center text-xs text-[#53635a]">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
