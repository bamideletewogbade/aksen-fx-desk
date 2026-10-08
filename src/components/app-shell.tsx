'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowRightLeft,
  Inbox,
  PiggyBank,
  BarChart3,
  BookCheck,
  Landmark,
  LogOut,
  Loader2,
  Menu,
  MessageSquare,
  Search,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { ROLE_LABEL, initialsOf, type Session } from '@/lib/auth';
import { api } from '@/lib/api';
import { cx, StatusBadge, Toaster } from './ui';
import type { TradeSummary } from '@/lib/trades';
import { formatMinor } from '@/lib/money';
import { OperatorPageSkeleton } from './operator-page-skeleton';
import { OptionalUserButton, useOptionalClerk } from './optional-clerk';

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('useSession outside AppShell');
  return s;
};

const NAV: { group: string; items: { href: string; label: string; icon: typeof Activity; match?: RegExp }[] }[] = [
  {
    group: 'Daily work',
    items: [
      { href: '/desk', label: 'Desk', icon: Activity },
      { href: '/inbox', label: 'Inbox', icon: Inbox },
      { href: '/trades', label: 'Trades', icon: ArrowRightLeft, match: /^\/trades(?!\/new)/ },
      { href: '/customers', label: 'Customers', icon: UserRound, match: /^\/customers/ },
      { href: '/susu', label: 'Susu savings', icon: PiggyBank, match: /^\/susu/ },
    ],
  },
  {
    group: 'Money & review',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Landmark },
      { href: '/reconcile', label: 'Day close', icon: BookCheck },
      { href: '/rates', label: 'Rates', icon: SlidersHorizontal },
      { href: '/insights', label: 'Insights', icon: BarChart3 },
    ],
  },
  {
    group: 'Manage desk',
    items: [
      { href: '/team', label: 'Team', icon: Users },
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/whatsapp', label: 'WhatsApp & SMS', icon: MessageSquare },
    ],
  },
];

type Badges = Partial<Record<string, { n: number; urgent: boolean }>>;

/** Inbox badge: chats that need a person (urgent), otherwise unread messages. */
function useInboxBadge(): Badges {
  const [badge, setBadge] = useState<{ n: number; urgent: boolean } | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const c = await api<{ needsYou: number; unread: number }>('/api/inbox?counts=1');
        if (!stop) setBadge(c.needsYou ? { n: c.needsYou, urgent: true } : c.unread ? { n: c.unread, urgent: false } : null);
      } catch {
        /* the badge is a convenience; ignore failures */
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  return badge ? { '/inbox': badge } : {};
}

function NavLinks({ onNavigate, badges = {}, pendingHref }: { onNavigate?: (href: string) => void; badges?: Badges; pendingHref?: string | null }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="px-3 pb-1.5 text-[0.625rem] font-mono font-bold uppercase tracking-wider text-[#7da08c]">{g.group}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.match ? it.match.test(path) : path === it.href || path.startsWith(`${it.href}/`);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => onNavigate?.(it.href)}
                    aria-current={active ? 'page' : undefined}
                    aria-busy={pendingHref === it.href || undefined}
                    className={cx(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.8125rem] font-semibold transition-colors',
                      active ? 'bg-[#1b3a2a] text-lime' : 'text-[#d0ded5] hover:bg-[#152e21] hover:text-white',
                    )}
                  >
                    <Icon size={16} className={active ? 'text-lime' : 'text-[#7da08c]'} />
                    {it.label}
                    {pendingHref === it.href ? <Loader2 size={14} className="ml-auto animate-spin text-lime" aria-hidden="true" /> : badges[it.href] && (
                      <span
                        className={cx('ml-auto rounded-full px-1.5 text-[0.625rem] font-bold', badges[it.href]!.urgent ? 'bg-[#ffb35c] text-ink' : 'bg-lime text-ink')}
                        title={badges[it.href]!.urgent ? 'Chats that need a person' : 'Unread messages'}
                      >
                        {badges[it.href]!.n}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Ends the built-in session (if any) and the Clerk session (if any). */
function useSignOut() {
  const clerk = useOptionalClerk();
  return async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if (clerk.isSignedIn) await clerk.signOut();
    else window.location.href = '/login';
  };
}

/** Ctrl/Cmd+K: jump to any trade or customer by reference, name, phone or bank reference. */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TradeSummary[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const d = await api<{ trades: TradeSummary[] }>(`/api/trades?q=${encodeURIComponent(q)}&limit=8`);
        setResults(d.trades);
        setIdx(0);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const actions = useMemo(
    () => [
      { label: 'Go to desk', href: '/desk' },
      { label: 'Open the inbox', href: '/inbox' },
      { label: 'Add customer', href: '/customers?new=1' },
      { label: 'Close the day', href: '/reconcile' },
    ],
    [],
  );

  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const items = results.length ? results.map((r) => ({ key: r.id, href: `/trades/${r.id}`, r })) : [];
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-[#0b1a13]/45 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="animate-rise w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, Math.max(items.length - 1, 0))); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && items[idx]) go(items[idx].href);
            }}
            placeholder="Trade ref, customer, phone, bank reference…"
            aria-label="Search trades"
            className="w-full bg-transparent py-3.5 text-sm outline-none"
          />
          <kbd className="rounded border border-line px-1.5 text-[0.625rem] text-subtle">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {items.map((it, i) => (
            <li key={it.key}>
              <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => go(it.href)} className={cx('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer', i === idx && 'bg-[#eef4ec]')}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{it.r.customer.name}</span>
                  <span className="block font-mono text-xs text-subtle">{it.r.ref} · {formatMinor(it.r.payMinor, it.r.payCurrency)}</span>
                </span>
                <StatusBadge status={it.r.status} />
              </button>
            </li>
          ))}
          {!items.length &&
            actions.map((a) => (
              <li key={a.href}>
                <button type="button" onClick={() => go(a.href)} className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-[#eef4ec] cursor-pointer">
                  {a.label}
                </button>
              </li>
            ))}
          {q.trim().length >= 2 && !results.length && <li className="px-3 py-2 text-xs text-subtle">No trades match “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const badges = useInboxBadge();
  const signOut = useSignOut();
  const clerkUser = useOptionalClerk().isSignedIn;

  useEffect(() => { setPendingHref(null); }, [pathname]);
  const navigate = (href: string) => {
    setMobileOpen(false);
    if (href !== pathname) setPendingHref(href);
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileCloseRef.current?.focus();
    const onDrawerKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); mobileMenuRef.current?.focus(); }
      if (event.key !== 'Tab' || !mobileDrawerRef.current) return;
      const focusable = Array.from(mobileDrawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener('keydown', onDrawerKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onDrawerKey); };
  }, [mobileOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!typing && e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <SessionCtx.Provider value={session}>
      <div className="app-frame bg-paper text-ink">
        <aside className="app-rail">
          <div className="flex items-center justify-between border-b border-[#1c382b] px-4 py-4">
            <Link href="/desk" className="min-w-0">
              <span className="block text-sm font-bold tracking-tight text-white">
                AKSEN <span className="text-xs font-normal text-[#a3b8ac]">OTC</span>
              </span>
              <span className="block truncate text-[0.6875rem] font-medium text-lime">{session.orgName}</span>
            </Link>
          </div>
          <div className="space-y-3 px-3 py-4">
            <button type="button" onClick={() => setPaletteOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-[#274a38] bg-[#0c1f17] px-3 py-2 text-left text-xs text-[#a3b8ac] hover:text-white cursor-pointer">
              <Search size={14} /> Find a trade
              <kbd className="ml-auto rounded border border-[#274a38] px-1 text-[0.625rem] font-mono">Ctrl K</kbd>
            </button>
          </div>
          <div className="flex-1 px-2">
            <NavLinks badges={badges} pendingHref={pendingHref} onNavigate={navigate} />
          </div>
          <div className="space-y-2 border-t border-[#1c382b] p-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-[#0c1f17] p-2">
              {clerkUser ? <OptionalUserButton /> : <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand font-mono text-[0.6875rem] font-bold text-lime">{initialsOf(session)}</div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{session.userName}</div>
                <div className="truncate text-[0.6875rem] text-[#a3b8ac]">{ROLE_LABEL[session.role]}</div>
              </div>
              <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-lg p-1.5 text-[#7da08c] hover:bg-[#152e21] hover:text-white cursor-pointer">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {/* Mobile header */}
          <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-[#1c382b] bg-[#10261d] px-4 py-3 text-white lg:hidden">
            <Link href="/desk" className="min-w-0">
              <span className="block text-sm font-bold">AKSEN OTC</span>
              <span className="block truncate text-[0.6875rem] text-lime">{session.orgName}</span>
            </Link>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className="rounded-lg p-2 text-[#a3b8ac] hover:text-white cursor-pointer"><Search size={19} /></button>
              <button ref={mobileMenuRef} type="button" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu" aria-expanded={mobileOpen} className="rounded-lg p-2 text-[#a3b8ac] hover:text-white cursor-pointer">
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </header>
          {mobileOpen && (
            <div className="fixed inset-0 z-50 bg-[#06140d]/60 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
              <div ref={mobileDrawerRef} role="dialog" aria-modal="true" aria-label="Main navigation" className="flex h-full w-full max-w-sm flex-col bg-[#10261d] text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#1c382b] px-4 py-3">
                  <span className="min-w-0 truncate text-sm font-bold">AKSEN OTC <span className="font-normal text-[#a3b8ac]">· {session.orgName}</span></span>
                  <button ref={mobileCloseRef} type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-[#a3b8ac] hover:text-white cursor-pointer"><X size={20} /></button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                  <NavLinks badges={badges} pendingHref={pendingHref} onNavigate={navigate} />
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#1c382b] px-3 pt-3 text-xs">
                    <span className="min-w-0 truncate text-[#a3b8ac]">{session.userName} · {ROLE_LABEL[session.role]}</span>
                    <button type="button" onClick={signOut} className="shrink-0 font-semibold text-[#ffb4ab] cursor-pointer">Sign out</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {session.isDemo && (
            <div className="no-print border-b border-[#f1d4a6] bg-amber-bg px-4 py-2 text-center text-xs text-[#6b3d00]">
              <strong>Sample desk.</strong> Everything here is demo data in a real working system. No money moves and no messages are sent.
            </div>
          )}
          {pendingHref && <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-lime-soft" role="progressbar" aria-label="Loading page"><div className="h-full w-1/3 animate-[nav-progress_1.2s_ease-in-out_infinite] bg-lime" /></div>}
          <main aria-busy={Boolean(pendingHref)} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {pendingHref ? <OperatorPageSkeleton label={NAV.flatMap((g) => g.items).find((it) => it.href === pendingHref)?.label ?? 'page'} /> : children}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </SessionCtx.Provider>
  );
}
