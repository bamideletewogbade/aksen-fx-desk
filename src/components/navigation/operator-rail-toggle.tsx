'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSyncExternalStore } from 'react';

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

interface OperatorRailToggleProps {
  onToggle?: (nextCollapsed: boolean) => void;
}

export function OperatorRailToggle({ onToggle }: OperatorRailToggleProps) {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const next = collapsed ? 'expanded' : 'collapsed';
    document.documentElement.dataset.rail = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Ignored
    }
    window.dispatchEvent(new Event(EVENT));
    (e.currentTarget as HTMLElement).blur();
    onToggle?.(next === 'collapsed');
  }

  return (
    <button
      type="button"
      className="h-8 w-8 flex items-center justify-center rounded-xl text-[#8fa795] hover:text-[#c2f576] hover:bg-[#152e21] transition-all cursor-pointer flex-shrink-0"
      onClick={toggle}
      suppressHydrationWarning
      aria-pressed={collapsed}
      title={collapsed ? 'Pin the sidebar open' : 'Collapse to rail (hover to preview)'}
      aria-label={collapsed ? 'Pin the sidebar open' : 'Collapse to rail'}
    >
      {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
    </button>
  );
}
