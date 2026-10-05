'use client';

import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { formatMinor, type Currency } from '@/lib/money';
import { STATUS_META, type Tone, type TradeStatus } from '@/lib/trades';
import { remaining } from '@/lib/time';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'lime';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-deep shadow-sm',
  lime: 'bg-lime text-ink hover:bg-[#b0ec5d] shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-[#eef4ec]',
  ghost: 'text-muted hover:text-ink hover:bg-[#eef4ec]',
  danger: 'bg-white text-risk border border-[#f3c7c2] hover:bg-risk-bg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', busy, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || busy}
        className={cx(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap',
          size === 'sm' && 'px-3 py-1.5 text-xs',
          size === 'md' && 'px-4 py-2.5 text-sm',
          size === 'lg' && 'px-5 py-3 text-sm',
          VARIANT[variant],
          className,
        )}
        {...rest}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : icon}
        {children}
      </button>
    );
  },
);

// ---------- Surfaces ----------

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-line bg-white', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[0.6875rem] font-mono font-semibold uppercase tracking-wider text-subtle">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted">{children}</h2>
      {aside}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef4ec] text-brand">{icon}</div>}
      <div className="text-sm font-semibold text-ink">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-[#e9efe7]', className)} />;
}

export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'risk' | 'good'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    info: 'bg-info-bg border-[#c9d9f2] text-[#173a69]',
    warn: 'bg-amber-bg border-[#f1d4a6] text-[#6b3d00]',
    risk: 'bg-risk-bg border-[#f3c7c2] text-[#7a1a12]',
    good: 'bg-[#eaf6e8] border-[#c6e3c0] text-[#164a2f]',
  }[tone];
  return (
    <div role={tone === 'risk' ? 'alert' : undefined} className={cx('rounded-xl border px-4 py-3 text-sm', styles, className)}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cx(Boolean(title) && 'mt-0.5', 'opacity-90')}>{children}</div>}
    </div>
  );
}

// ---------- Status ----------

const TONE: Record<Tone, string> = {
  neutral: 'bg-[#eef1f5] text-[#3d4b5c] border-[#dde3ea]',
  waiting: 'bg-amber-bg text-amber border-[#f1d4a6]',
  action: 'bg-lime-soft text-brand border-[#cfeea0]',
  good: 'bg-[#eaf6e8] text-brand border-[#c6e3c0]',
  risk: 'bg-risk-bg text-risk border-[#f3c7c2]',
  done: 'bg-[#f1f3f1] text-subtle border-[#e2e6e2]',
};

export function StatusBadge({ status, customer, className }: { status: TradeStatus; customer?: boolean; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap', TONE[meta.tone], className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', meta.tone === 'risk' ? 'bg-risk' : meta.tone === 'waiting' ? 'bg-amber' : meta.tone === 'action' || meta.tone === 'good' ? 'bg-brand' : 'bg-subtle')} />
      {customer ? meta.customerLabel : meta.label}
    </span>
  );
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold', TONE[tone], className)}>{children}</span>;
}

export function Money({ minor, currency, className, compact }: { minor: number; currency: Currency; className?: string; compact?: boolean }) {
  return <span className={cx('font-mono tabular', className)}>{formatMinor(minor, currency, { compact })}</span>;
}

/** Live countdown to a deadline. */
export function Countdown({ to, label, className }: { to: string; label?: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const r = remaining(to, now);
  const overdue = r.ms < 0;
  const urgent = !overdue && r.ms < 3 * 60_000;
  return (
    <span className={cx('font-mono tabular text-xs', overdue ? 'text-risk' : urgent ? 'text-amber' : 'text-muted', className)} suppressHydrationWarning>
      {label ? `${label} ` : ''}
      {overdue ? `overdue ${r.text}` : r.text}
    </span>
  );
}

// ---------- Forms ----------

export function Field({ label, hint, error, children, htmlFor, optional }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-xs font-semibold text-ink">
        <span>{label}</span>
        {optional && <span className="font-normal text-subtle">Optional</span>}
      </label>
      {children}
      {error ? <p className="text-xs text-risk">{error}</p> : hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-[#9aaba1] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:bg-[#f3f6f2] disabled:text-subtle';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function Input({ className, mono, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, mono && 'font-mono tabular', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'min-h-[5.25rem] resize-y', className)} {...rest} />;
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" className={cx('inline-flex rounded-xl border border-line bg-[#eef4ec] p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg font-semibold transition-colors cursor-pointer',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Dialog ----------

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea')).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1a13]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx('animate-rise flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-base font-bold text-ink">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-[#eef4ec] hover:text-ink cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Copy ----------

export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied', className, variant = 'secondary', size = 'sm' }: { text: string; label?: string; copiedLabel?: string; className?: string; variant?: Variant; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      icon={done ? <Check size={14} /> : <Copy size={14} />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      <span aria-live="polite">{done ? copiedLabel : label}</span>
    </Button>
  );
}

// ---------- Toasts ----------

type ToastItem = { id: number; text: string; tone: 'good' | 'risk' | 'info' };
const listeners = new Set<(t: ToastItem[]) => void>();
let toasts: ToastItem[] = [];
let seq = 0;
export function toast(text: string, tone: ToastItem['tone'] = 'good') {
  const item = { id: ++seq, text, tone };
  toasts = [...toasts, item];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    listeners.forEach((l) => l(toasts));
  }, 4200);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cx('animate-rise rounded-xl px-4 py-3 text-sm font-medium shadow-lg', t.tone === 'good' ? 'bg-ink text-white' : t.tone === 'risk' ? 'bg-risk text-white' : 'bg-info text-white')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'brand' | 'risk' | 'amber' }) {
  return (
    <Card className="p-4">
      <div className="text-[0.6875rem] font-mono font-semibold uppercase tracking-wider text-subtle">{label}</div>
      <div className={cx('mt-1.5 text-xl font-bold tabular', tone === 'brand' ? 'text-brand' : tone === 'risk' ? 'text-risk' : tone === 'amber' ? 'text-amber' : 'text-ink')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
