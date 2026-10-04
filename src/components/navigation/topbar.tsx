'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Activity, 
  Building2, 
  ArrowUpRight, 
  MessageSquare, 
  Lock, 
  LogOut, 
  Menu, 
  X,
  User,
  CheckCircle2
} from 'lucide-react';
import { OperatorLoginModal } from './operator-login-modal';
import { Session, initialsOf, DEFAULT_DEMO_OPERATOR } from '@/lib/auth';

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const isOperatorRoute = pathname.startsWith('/desk') || pathname.startsWith('/whatsapp') || pathname.startsWith('/treasury') || pathname.startsWith('/syndicates');

  // Load session from server cookie
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setSession(data.session || null);
          }
        } else if (isMounted) {
          setSession(null);
        }
      } catch (e) {
        console.error('Session load error:', e);
        if (isMounted) setSession(null);
      }
    }
    checkSession();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSession(null);
      if (isOperatorRoute) {
        router.push('/');
      } else {
        router.refresh();
      }
    } catch (e) {
      console.error('Failed to log out:', e);
    }
  };

  // Public visitor marketing links
  const publicNavItems = [
    { href: '/#how-it-works', label: 'How It Works' },
    { href: '/#forensics', label: 'Fraud Defense' },
    { href: '/#about', label: 'About' },
    { href: '/#contact', label: 'Contact Desk' },
  ];

  // Authenticated operator workspace links
  const operatorNavItems = [
    { href: '/desk', label: 'Trading Desk', icon: Activity, badge: 'LIVE' },
    { href: '/whatsapp', label: 'WhatsApp Gateway', icon: MessageSquare, badge: 'META' },
    { href: '/treasury', label: 'Float & Caps', icon: Building2 },
  ];

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors ${
          isOperatorRoute
            ? 'border-[#1c382b] bg-[#10261d]/95 text-white'
            : 'border-[#e3ece1] bg-[#f9faf7]/90 text-[#10261d]'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
          {/* Brand & Nav */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            <Link href="/" className="flex flex-col text-decoration-none group flex-shrink-0">
              <span
                className={`text-sm font-bold tracking-tight transition-colors ${
                  isOperatorRoute ? 'text-white group-hover:text-[#c2f576]' : 'text-[#10261d] group-hover:text-[#175b3b]'
                }`}
              >
                AKSEN <span className={`text-xs font-normal ${isOperatorRoute ? 'text-[#a3b8ac]' : 'text-[#798d81]'}`}>OTC</span>
              </span>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider ${
                  isOperatorRoute ? 'text-[#c2f576]' : 'text-[#175b3b] font-semibold'
                }`}
              >
                West Africa Bureau Desk
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <nav
              className={`hidden md:flex items-center gap-1 border-l pl-4 lg:pl-6 ${
                isOperatorRoute ? 'border-[#1c382b]' : 'border-[#e3ece1]'
              }`}
            >
              {isOperatorRoute ? (
                // Operator Workspace Nav
                operatorNavItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                        isActive
                          ? 'bg-[#1b3a2a] text-[#c2f576]'
                          : 'text-[#d0ded5] hover:bg-[#152e21] hover:text-white'
                      }`}
                    >
                      <Icon size={14} className={isActive ? 'text-[#c2f576]' : 'text-[#7da08c]'} />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                            isActive ? 'bg-[#c2f576] text-[#10261d]' : 'bg-[#175b3b] text-[#c2f576]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })
              ) : (
                // Public Marketing Nav
                publicNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[#53635a] hover:bg-[#ebf2e9] hover:text-[#10261d] transition-all whitespace-nowrap"
                  >
                    {item.label}
                  </Link>
                ))
              )}
            </nav>
          </div>

          {/* Right Area: Auth Action */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

            {session ? (
              // Authenticated Operator State
              <div className="flex items-center gap-2">
                {/* Operator Profile Pill */}
                <div
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    isOperatorRoute
                      ? 'border-[#274a38] bg-[#0c1f17] text-white'
                      : 'border-[#d8e3d6] bg-white text-[#10261d]'
                  }`}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#175b3b] text-[#c2f576] font-mono font-bold text-[9px]">
                    {initialsOf(session)}
                  </div>
                  <span className={`text-xs font-bold truncate max-w-[100px] ${isOperatorRoute ? 'text-white' : 'text-[#10261d]'}`}>
                    {session.name.split(' ')[0]}
                  </span>
                </div>

                {!isOperatorRoute ? (
                  <>
                    <Link
                      href="/desk"
                      className="flex items-center gap-1 rounded-full bg-[#175b3b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f4329] transition-all shadow-xs"
                    >
                      <span>Desk</span>
                      <ArrowUpRight size={13} className="text-[#c2f576]" />
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-1 rounded-full border border-[#e3ece1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#53635a] hover:text-red-700 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer"
                      title="Sign Out"
                    >
                      <LogOut size={12} />
                      <span className="hidden sm:inline">Sign Out</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 rounded-full border border-[#274a38] bg-[#12241b] px-3 py-1.5 text-xs font-medium text-[#cbd8c8] hover:text-white hover:bg-[#1a3326] transition-all cursor-pointer"
                    title="Sign Out of Desk"
                  >
                    <LogOut size={13} />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                )}
              </div>
            ) : (
              // Unauthenticated Visitor State (Direct link to /login page)
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-full bg-[#10261d] px-5 py-2 text-xs sm:text-sm font-semibold text-white transition-all hover:bg-[#175b3b] shadow-xs hover:shadow cursor-pointer"
              >
                <Lock size={13} className="text-[#c2f576]" />
                <span>Operator Sign In</span>
              </Link>
            )}

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`md:hidden rounded-full p-2 transition-colors ${
                isOperatorRoute
                  ? 'text-[#a3b8ac] hover:text-white hover:bg-[#152e21]'
                  : 'text-[#53635a] hover:text-[#10261d] hover:bg-[#ebf2e9]'
              }`}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div
            className={`md:hidden border-t px-4 py-4 space-y-3 ${
              isOperatorRoute
                ? 'border-[#1c382b] bg-[#10261d] text-white'
                : 'border-[#e3ece1] bg-white text-[#10261d]'
            }`}
          >
            {/* Mobile Auth Status */}
            {session ? (
              <div className="p-3 rounded-2xl bg-[#ebf5e7] border border-[#175b3b]/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#175b3b] text-[#c2f576] font-mono font-bold text-[10.5px]">
                    {initialsOf(session)}
                  </div>
                  <div>
                    <strong className="block text-[#10261d]">{session.name}</strong>
                    <span className="text-[10px] text-[#53635a]">{session.role}</span>
                  </div>
                </div>
                <button
                  onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                  className="text-xs text-red-700 font-bold hover:underline cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-[#175b3b] py-2.5 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                <Lock size={13} className="text-[#c2f576]" />
                <span>Operator Sign In (6-Digit PIN)</span>
              </Link>
            )}

            <div className="space-y-1">
              {isOperatorRoute ? (
                <>
                  <Link
                    href="/desk"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-semibold text-white hover:bg-[#152e21]"
                  >
                    Operator Trading Desk
                  </Link>
                  <Link
                    href="/whatsapp"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-semibold text-white hover:bg-[#152e21]"
                  >
                    WhatsApp Gateway (Meta API)
                  </Link>
                  <Link
                    href="/treasury"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-semibold text-white hover:bg-[#152e21]"
                  >
                    Float &amp; Bank Caps
                  </Link>
                  <Link
                    href="/"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-semibold text-[#a3b8ac] hover:bg-[#152e21]"
                  >
                    Exit to Public Site
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/#how-it-works"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-medium text-[#10261d] hover:bg-[#f9faf7]"
                  >
                    How It Works
                  </Link>
                  <Link
                    href="/#forensics"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-medium text-[#10261d] hover:bg-[#f9faf7]"
                  >
                    Fraud Defense
                  </Link>
                  <Link
                    href="/#about"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-medium text-[#10261d] hover:bg-[#f9faf7]"
                  >
                    About
                  </Link>
                  <Link
                    href="/#contact"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-xl px-3 py-2 text-xs font-medium text-[#10261d] hover:bg-[#f9faf7]"
                  >
                    Contact Desk
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full text-left mt-2 rounded-xl bg-[#10261d] px-3 py-2.5 text-xs font-bold text-white flex items-center justify-between"
                  >
                    <span>Operator Sign In</span>
                    <ArrowUpRight size={14} className="text-[#c2f576]" />
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Operator Login Modal */}
      <OperatorLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={(sess) => setSession(sess)}
      />
    </>
  );
}
