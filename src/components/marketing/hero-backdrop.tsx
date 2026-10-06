'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hero backdrop: the Accra ⇄ Lagos corridor drawn as faint arcs with small
 * payments travelling along them, a dot grid that brightens around the
 * cursor, and a slow colour wash. Low contrast by design; it sits behind the
 * copy and freezes when the visitor prefers reduced motion.
 */
// Accra (bottom left) to Lagos (top right), routed through the open space
// between the copy and the quote card. Laid out in real pixels from the
// hero's measured size, so both cities stay inside the frame on any screen.
// Control points are fractions of the width and height.
const CURVES = [
  { c: [0.36, 0.92, 0.5, 0.19], dur: 12, color: '#7fbf3f', reverse: false },
  { c: [0.18, 0.58, 0.6, 0.04], dur: 15, color: '#4a7fc1', reverse: true },
  { c: [0.44, 1.0, 0.57, 0.37], dur: 10, color: '#4a7fc1', reverse: true },
  { c: [0.26, 0.71, 0.72, 0.29], dur: 18, color: '#7fbf3f', reverse: false },
];

function layout(w: number, h: number, card: { right: number; top: number } | null) {
  const A = { x: Math.max(36, w * 0.045), y: h - 118 };
  const lx = w - Math.max(36, w * 0.025);
  // Beside the quote card when there is room for the label, otherwise in the gap above it.
  const roomBeside = !card || lx - card.right > 150;
  const L = { x: lx, y: roomBeside ? 64 : Math.max(20, card!.top - 40) };
  const arcs = CURVES.map((k) => ({
    ...k,
    d: `M${A.x} ${A.y} C ${k.c[0] * w} ${k.c[1] * h}, ${k.c[2] * w} ${k.c[3] * h}, ${L.x} ${L.y}`,
  }));
  return { A, L, arcs };
}

function Node({ x, y, label, coord, align, showLabel }: { x: number; y: number; label: string; coord: string; align: 'start' | 'end'; showLabel: boolean }) {
  const tx = align === 'start' ? x + 16 : x - 16;
  const ty = y;
  return (
    <g>
      <circle cx={x} cy={y} r="5" fill="#175b3b" />
      <circle cx={x} cy={y} r="5" fill="none" stroke="#175b3b" strokeWidth="1.5">
        <animate attributeName="r" values="5;22" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="3.2s" repeatCount="indefinite" />
      </circle>
      {showLabel && (
        <>
          <text x={tx} y={ty - 6} textAnchor={align} fontSize="12" fontWeight="700" fill="#10261d" fontFamily="var(--font-geist-mono), monospace" letterSpacing="1.5">{label}</text>
          <text x={tx} y={ty + 10} textAnchor={align} fontSize="10" fill="#6f8378" fontFamily="var(--font-geist-mono), monospace">{coord}</text>
        </>
      )}
    </g>
  );
}

// Below this width the city labels collide with the stats row and the quote card.
const LABEL_MIN_WIDTH = 1400;

const SPOT = 460;

export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(true);
  const [size, setSize] = useState({ w: 1440, h: 900 });
  const [card, setCard] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width && height) setSize({ w: Math.round(width), h: Math.round(height) });
      const c = host.parentElement?.querySelector('[data-hero-card]');
      if (c) {
        const hr = host.getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        setCard({ right: Math.round(cr.right - hr.left), top: Math.round(cr.top - hr.top) });
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotion(!mq.matches);
    const host = ref.current?.parentElement;
    const el = ref.current;
    if (!host || !el) return;
    let raf = 0;
    let target = { x: 0.7, y: 0.35 };
    let cur = { ...target };
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      target = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      lastMove = performance.now();
    };
    const tick = (t: number) => {
      // With no pointer (touch, idle), the light drifts on its own.
      if (t - lastMove > 4000) target = { x: 0.55 + Math.sin(t / 9000) * 0.3, y: 0.45 + Math.cos(t / 11000) * 0.25 };
      cur = { x: cur.x + (target.x - cur.x) * 0.06, y: cur.y + (target.y - cur.y) * 0.06 };
      const spot = spotRef.current;
      if (spot) {
        // Move a small layer with transform (composited) and shift its dot
        // pattern the opposite way so its dots stay aligned with the grid.
        const px = cur.x * host.clientWidth - SPOT / 2;
        const py = cur.y * host.clientHeight - SPOT / 2;
        spot.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
        spot.style.backgroundPosition = `${(-px).toFixed(1)}px ${(-py).toFixed(1)}px, 0 0`;
      }
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    // Only animate while the hero is on screen.
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && !mq.matches) raf = requestAnimationFrame(tick);
    });
    io.observe(host);
    if (!mq.matches) {
      host.addEventListener('pointermove', onMove);
      raf = requestAnimationFrame(tick);
    }
    return () => {
      io.disconnect();
      host.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const { A, L, arcs } = layout(size.w, size.h, card);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
      {/* slow colour wash */}
      <div className="hero-wash absolute -inset-[30%] opacity-70" />
      {/* base dot grid */}
      <div className="absolute inset-0 [background-image:radial-gradient(#cbd8c8_1.1px,transparent_1.1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
      {/* a small light that follows the cursor and brightens the dots under it */}
      <div
        ref={spotRef}
        className="absolute left-0 top-0 will-change-transform [mask-image:radial-gradient(circle,black,transparent_68%)]"
        style={{
          width: SPOT,
          height: SPOT,
          transform: 'translate3d(60vw, 20vh, 0)',
          backgroundImage: 'radial-gradient(rgba(23,91,59,0.6) 1.4px, transparent 1.4px), radial-gradient(circle, rgba(194,245,118,0.35), transparent 70%)',
          backgroundSize: '28px 28px, 100% 100%',
        }}
      />

      {/* the corridor */}
      <svg className="absolute inset-0 h-full w-full opacity-35 lg:opacity-100" viewBox={`0 0 ${size.w} ${size.h}`}>
        <defs>
          <linearGradient id="arc-fade" x1="0" x2="1">
            <stop offset="0" stopColor="#175b3b" stopOpacity="0.35" />
            <stop offset="0.5" stopColor="#175b3b" stopOpacity="0.18" />
            <stop offset="1" stopColor="#175b3b" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {arcs.map((a, i) => (
          <g key={i}>
            <path id={`arc-${i}`} d={a.d} fill="none" stroke="url(#arc-fade)" strokeWidth="1.2" strokeDasharray="2 6" />
            {motion &&
              [0, 0.5].map((offset) => (
                <circle key={offset} r="3.2" fill={a.color} opacity="0.85">
                  <animateMotion dur={`${a.dur}s`} repeatCount="indefinite" begin={`${-a.dur * offset - i}s`} keyPoints={a.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear">
                    <mpath href={`#arc-${i}`} />
                  </animateMotion>
                  <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.9;1" dur={`${a.dur}s`} begin={`${-a.dur * offset - i}s`} repeatCount="indefinite" />
                </circle>
              ))}
          </g>
        ))}
        {size.w >= LABEL_MIN_WIDTH && <Node x={A.x} y={A.y} label="ACCRA · GHS" coord="5.60°N 0.19°W" align="start" showLabel />}
        <Node x={L.x} y={L.y} label="LAGOS · NGN" coord="6.52°N 3.38°E" align="end" showLabel={size.w >= LABEL_MIN_WIDTH} />
      </svg>
      {/* soften the lines right behind the headline so the copy stays easy to read */}
      <div className="absolute left-0 top-[18%] h-[55%] w-[50%] bg-[radial-gradient(ellipse_at_35%_50%,rgba(246,248,244,0.85),transparent_70%)] max-lg:hidden" />
    </div>
  );
}
