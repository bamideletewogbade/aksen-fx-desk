'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  MessageSquare,
  Building2,
  Users,
  ShieldCheck,
  Cpu,
  ArrowUpRight,
  LogOut,
  BarChart3,
  Bot,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { OperatorRailToggle } from './operator-rail-toggle';
import { Session, initialsOf } from '@/lib/auth';

const KEY = 'aksen-rail';
const EVENT = 'aksen-rail-change';

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

const read = () => {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.rail === 'collapsed';
};

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface OperatorSidebarProps {
  session: Session | null;
  onOpenAiHealth?: () => void;
  onOpenCopilot?: () => void;
}

export function OperatorSidebar({ session, onOpenAiHealth, onOpenCopilot }: OperatorSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isCollapsed = useSyncExternalStore(subscribe, read, () => false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSuppressHover, setIsSuppressHover] = useState(false);

  const isPreviewExpanded = isCollapsed && isHovered && !isSuppressHover;

  useEffect(() => {
    if (isPreviewExpanded) {
      document.documentElement.dataset.railHover = 'true';
    } else {
      delete document.documentElement.dataset.railHover;
    }
  }, [isPreviewExpanded]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const navGroups: NavGroup[] = [
    {
      label: 'Operations',
      items: [
        {
          href: '/desk',
          label: 'Trading Desk',
          icon: Activity,
          badge: 'LIVE',
        },
        {
          href: '/history',
          label: 'Settlement Ledger',
          icon: Clock,
          badge: 'AUDIT',
        },
      ],
    },
    {
      label: 'Analytics & Flows',
      items: [
        {
          href: '/analytics',
          label: 'Cash Flow & Orders',
          icon: BarChart3,
        },
      ],
    },
    {
      label: 'Treasury & Liquidity',
      items: [
        {
          href: '/treasury',
          label: 'Float & Caps',
          icon: Building2,
        },
        {
          href: '/syndicates',
          label: 'Liquidity Syndicates',
          icon: Users,
        },
      ],
    },
    {
      label: 'Settings',
      items: [
        {
          href: '/settings',
          label: 'Bank & MoMo Accounts',
          icon: SlidersHorizontal,
          badge: 'ACTIVE',
        },
        {
          href: '/whatsapp',
          label: 'WhatsApp Gateway',
          icon: MessageSquare,
          badge: 'META',
        },
        {
          href: '/desk#fraud',
          label: 'Fraud & Integrity',
          icon: ShieldCheck,
          badge: 'JEV',
        },
      ],
    },
  ];

  return (
    <aside 
      className="operator-sidebar group"
      onMouseEnter={() => {
        if (!isSuppressHover) setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsSuppressHover(false);
      }}
    >
      {/* 1. Header: Brand + Rail Toggle */}
      <div className="space-y-4">
        <div className="admin-rail-head flex items-center justify-between pb-3 border-b border-[#1c382b]">
          <Link
            href="/desk"
            className="rail-label flex flex-col text-decoration-none min-w-0"
            title="Aksen OTC Bureau Operating Desk"
          >
            <span className="text-sm font-bold tracking-tight text-white block leading-tight">
              AKSEN <span className="text-[#a3b8ac] font-normal text-xs">OTC</span>
            </span>
            <span className="text-[0.625rem] font-mono text-[#c2f576] uppercase tracking-wider block font-semibold">
              Bureau Operating Desk
            </span>
          </Link>

          <OperatorRailToggle
            onToggle={() => {
              setIsSuppressHover(true);
              setIsHovered(false);
            }}
          />
        </div>

        {/* 2. Navigation Groups */}
        <div className="space-y-4 pt-1">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <span className="rail-label text-[0.625rem] font-mono uppercase tracking-wider text-[#7da08c] font-bold px-2 block">
                {group.label}
              </span>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all group/item ${
                        isActive
                          ? 'bg-[#1b3a2a] text-[#c2f576] shadow-xs'
                          : 'text-[#d0ded5] hover:bg-[#152e21] hover:text-white'
                      }`}
                      title={item.label}
                    >
                      <Icon
                        size={17}
                        className={`flex-shrink-0 ${
                          isActive ? 'text-[#c2f576]' : 'text-[#7da08c] group-hover/item:text-white'
                        }`}
                      />
                      <span className="rail-label truncate flex-1">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`rail-label rounded px-1.5 py-0.5 text-[0.5625rem] font-mono font-bold ${
                            isActive
                              ? 'bg-[#c2f576] text-[#10261d]'
                              : 'bg-[#175b3b] text-[#c2f576]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Copilot Agent Modal Trigger */}
          {onOpenCopilot && (
            <div className="space-y-1 pt-1">
              <span className="rail-label text-[0.625rem] font-mono uppercase tracking-wider text-[#7da08c] font-bold px-2 block">
                Desk Intelligence
              </span>
              <button
                type="button"
                onClick={onOpenCopilot}
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#d0ded5] hover:bg-[#152e21] hover:text-[#c2f576] transition-all cursor-pointer text-left"
                title="Desk Copilot Agent"
              >
                <Bot size={17} className="text-[#c2f576] flex-shrink-0" />
                <span className="rail-label truncate flex-1">Desk Copilot Agent</span>
                <span className="rail-label rounded bg-[#175b3b] text-[#c2f576] px-1.5 py-0.5 text-[0.5625rem] font-mono font-bold">
                  AI
                </span>
              </button>
            </div>
          )}

          {/* AI Diagnostics Modal Trigger */}
          {onOpenAiHealth && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={onOpenAiHealth}
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#d0ded5] hover:bg-[#152e21] hover:text-white transition-all cursor-pointer text-left"
                title="AI & JEV Health"
              >
                <Cpu size={17} className="text-[#7da08c] flex-shrink-0" />
                <span className="rail-label truncate flex-1">AI Health &amp; Telemetry</span>
                <span className="rail-label rounded bg-[#175b3b] text-[#c2f576] px-1.5 py-0.5 text-[0.5625rem] font-mono font-bold">
                  FREE
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Area: DB Sync Indicator, Operator Profile & Public Link */}
      <div className="space-y-2.5 pt-3 border-t border-[#1c382b]">
        {/* Live Neon PostgreSQL Sync Status */}
        <div className="px-2.5 py-1.5 rounded-xl bg-[#0c1f17] border border-[#1c382b] flex items-center justify-between text-[0.625rem] font-mono">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c2f576] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#25d366]"></span>
            </span>
            <span className="rail-label truncate text-[#a3b8ac]">Neon Postgres</span>
          </div>
          <span className="rail-label text-[#c2f576] font-bold">SYNCED</span>
        </div>

        {/* Public Website Link */}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs text-[#a3b8ac] hover:text-white hover:bg-[#152e21] transition-all"
          title="Exit to Public Site"
        >
          <ArrowUpRight size={15} className="flex-shrink-0 text-[#7da08c]" />
          <span className="rail-label truncate">Exit to Public Site</span>
        </Link>

        {/* Operator Profile Pill */}
        {session && (
          <div className="p-2 rounded-2xl bg-[#0c1f17] border border-[#274a38] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#175b3b] text-[#c2f576] font-mono font-bold text-[0.625rem] flex-shrink-0">
                {initialsOf(session)}
              </div>
              <div className="rail-label min-w-0">
                <strong className="text-xs font-bold text-white block truncate leading-tight">
                  {session.userName}
                </strong>
                <span className="text-[0.625rem] font-mono text-[#c2f576] block truncate">
                  {session.role}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="rail-label p-1 text-[#7da08c] hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
              title="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
