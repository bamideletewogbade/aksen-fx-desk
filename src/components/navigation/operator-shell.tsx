'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { OperatorSidebar } from './operator-sidebar';
import { AiHealthModal } from '@/components/desk/ai-health-modal';
import { AiReportGenerator } from '@/components/desk/ai-report-generator';
import { Session, initialsOf } from '@/lib/auth';
import { Menu, X, LogOut, ArrowUpRight, Bot } from 'lucide-react';

interface OperatorShellProps {
  children: React.ReactNode;
  session: Session | null;
}

export function OperatorShell({ children, session }: OperatorShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAiHealthOpen, setIsAiHealthOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  return (
    <div className="operator-shell bg-[#f9faf7] text-[#10261d]">
      {/* 1. Prevent Layout Jumps Before First Paint (Aksen Labs Script) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.dataset.rail=localStorage.getItem('aksen-rail')||'expanded'}catch(e){document.documentElement.dataset.rail='expanded'}`,
        }}
      />

      {/* 2. Desktop Collapsible Side Navigation */}
      <OperatorSidebar
        session={session}
        onOpenAiHealth={() => setIsAiHealthOpen(true)}
        onOpenCopilot={() => setIsCopilotOpen(true)}
      />

      {/* 3. Mobile Header (Only visible on screens <= 1024px) */}
      <div className="lg:hidden sticky top-0 z-40 bg-[#10261d] text-white border-b border-[#1c382b] px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-bold block leading-tight">AKSEN OTC DESK</span>
          <span className="text-[9.5px] font-mono text-[#c2f576]">OPERATOR CONSOLE</span>
        </div>

        <div className="flex items-center gap-2">
          {session && (
            <div className="flex items-center gap-1.5 rounded-full border border-[#274a38] bg-[#0c1f17] px-2.5 py-1 text-xs">
              <span className="text-[10px] text-white font-bold">{session.name.split(' ')[0]}</span>
            </div>
          )}

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 text-[#a3b8ac] hover:text-white"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-b border-[#1c382b] bg-[#10261d] text-white px-4 py-3 space-y-2 text-xs">
          <Link
            href="/desk"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
          >
            Trading Desk (Live)
          </Link>
          <Link
            href="/history"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
          >
            Settlement Ledger
          </Link>
          <Link
            href="/analytics"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
          >
            Cash Flow &amp; Orders
          </Link>
          <Link
            href="/treasury"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
          >
            Float &amp; Caps
          </Link>
          <Link
            href="/syndicates"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
          >
            Liquidity Syndicates
          </Link>

          <div className="pt-2 border-t border-[#1c382b] space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#7da08c] font-bold px-3 block">
              Settings
            </span>
            <Link
              href="/settings"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
            >
              Bank &amp; MoMo Accounts
            </Link>
            <Link
              href="/whatsapp"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold"
            >
              WhatsApp Gateway
            </Link>
          </div>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsCopilotOpen(true);
            }}
            className="w-full text-left py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold text-[#c2f576] flex items-center gap-2"
          >
            <Bot size={15} />
            <span>Desk Copilot Agent</span>
          </button>
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsAiHealthOpen(true);
            }}
            className="w-full text-left py-2 px-3 rounded-xl hover:bg-[#152e21] font-semibold text-[#a3b8ac]"
          >
            JEV &amp; AI Health
          </button>
          <div className="pt-2 border-t border-[#1c382b] flex items-center justify-between">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-[#a3b8ac] hover:text-white"
            >
              Exit to Public Site
            </Link>
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleLogout();
              }}
              className="text-red-400 font-bold"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* 4. Main Page Content */}
      <main className="min-w-0 flex-1 overflow-x-hidden">
        {children}
      </main>

      {/* Global AI & JEV Health Modal */}
      <AiHealthModal
        isOpen={isAiHealthOpen}
        onClose={() => setIsAiHealthOpen(false)}
      />

      {/* Global Desk Copilot Agent */}
      <AiReportGenerator
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
      />
    </div>
  );
}
