/**
 * Soft, slow-moving shapes for section backgrounds. Purely decorative,
 * behind content, and frozen for people who prefer reduced motion.
 */
const SETS = {
  light: [
    { cls: 'drift-a', style: { width: 220, height: 180, top: '8%', left: '-60px', background: 'radial-gradient(circle at 30% 30%, #e7fbc9, #d6eccb)', opacity: 0.55, filter: 'blur(2px)' } },
    { cls: 'drift-b', style: { width: 120, height: 96, top: '62%', left: '6%', background: 'radial-gradient(circle at 30% 30%, #ffffff, #e3ece1)', opacity: 0.9, boxShadow: '0 20px 40px -20px rgba(16,38,29,0.25)' } },
    { cls: 'drift-c', style: { width: 280, height: 240, top: '-70px', right: '-80px', background: 'radial-gradient(circle at 40% 40%, #eef4ec, #dfe8dc)', opacity: 0.7, filter: 'blur(1px)' } },
    { cls: 'drift-a', style: { width: 64, height: 52, bottom: '12%', right: '9%', background: 'radial-gradient(circle at 30% 30%, #c2f576, #9fd65a)', opacity: 0.45 } },
  ],
  dark: [
    { cls: 'drift-c', style: { width: 420, height: 360, top: '-140px', right: '-120px', background: 'radial-gradient(circle at 40% 40%, rgba(194,245,118,0.16), rgba(194,245,118,0))', filter: 'blur(10px)' } },
    { cls: 'drift-a', style: { width: 140, height: 112, top: '18%', left: '-40px', background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10), rgba(255,255,255,0.02))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' } },
    { cls: 'drift-b', style: { width: 72, height: 58, bottom: '14%', left: '38%', background: 'radial-gradient(circle at 30% 30%, rgba(194,245,118,0.22), rgba(194,245,118,0.04))' } },
    { cls: 'drift-a', style: { width: 300, height: 260, bottom: '-150px', left: '-90px', background: 'radial-gradient(circle at 50% 50%, rgba(74,127,193,0.14), rgba(74,127,193,0))', filter: 'blur(12px)' } },
  ],
} as const;

export function Pebbles({ tone = 'light' }: { tone?: keyof typeof SETS }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
      {SETS[tone].map((p, i) => (
        <span key={i} className={`pebble ${p.cls}`} style={{ ...p.style, animationDelay: `${i * -5}s` }} />
      ))}
    </div>
  );
}
