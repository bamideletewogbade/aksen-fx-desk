'use client';

interface TickerItem {
  pair: string;
  flag: string;
  rate: string;
  tag: string;
  isPositive?: boolean;
  isNetworkStatus?: boolean;
}

const TICKER_DATA: TickerItem[] = [
  { pair: 'NGN ⇄ GHS', flag: '🇳🇬/🇬🇭', rate: '105.06', tag: 'Aksen Desk Lock' },
  { pair: 'USD ⇄ NGN', flag: '🇺🇸/🇳🇬', rate: '₦1,645.00', tag: 'Lagos Parallel P2P' },
  { pair: 'USD ⇄ GHS', flag: '🇺🇸/🇬🇭', rate: 'GH₵ 15.68', tag: 'Accra OTC Desk' },
  { pair: 'GBP ⇄ NGN', flag: '🇬🇧/🇳🇬', rate: '₦2,145.00', tag: 'London Remittance' },
  { pair: 'EUR ⇄ NGN', flag: '🇪🇺/🇳🇬', rate: '₦1,790.00', tag: 'Euro Corridor' },
  { pair: 'USDT ⇄ NGN', flag: '💵/🇳🇬', rate: '₦1,642.50', tag: 'Binance P2P Wholesale' },
  { pair: 'USDT ⇄ GHS', flag: '💵/🇬🇭', rate: 'GH₵ 15.64', tag: 'Ghana MoMo P2P' },
  { pair: 'AED ⇄ NGN', flag: '🇦🇪/🇳🇬', rate: '₦448.20', tag: 'Dubai Cargo Trade' },
  { pair: 'CNY ⇄ NGN', flag: '🇨🇳/🇳🇬', rate: '₦232.50', tag: 'Guangzhou Sourcing' },
  { pair: 'MTN MoMo Gateway', flag: '🇬🇭', rate: '99.98% Uptime', tag: 'Instant MoMo API', isNetworkStatus: true },
  { pair: 'NIP Commercial Switch', flag: '🇳🇬', rate: '12s avg wire', tag: 'NIBSS Fast-Rail', isNetworkStatus: true },
];

export function FxTicker() {
  return (
    <div className="w-full border-t border-[#e3ece1] bg-white/80 backdrop-blur-xs py-3 overflow-hidden select-none">
      <div className="flex items-center">
        {/* Live Indicator Pill on the Left */}
        <div className="hidden md:flex items-center px-6 border-r border-[#e3ece1] flex-shrink-0 z-10 bg-white/90">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b]">
            LIVE GLOBAL CORRIDOR FEED
          </span>
        </div>

        {/* Scrolling Ticker Track */}
        <div className="overflow-hidden flex-1 relative">
          <div className="animate-marquee flex items-center gap-6 py-0.5">
            {/* First sequence */}
            {TICKER_DATA.map((item, idx) => (
              <TickerBadge key={`t1-${idx}`} item={item} />
            ))}
            {/* Duplicated sequence for seamless infinite loop */}
            {TICKER_DATA.map((item, idx) => (
              <TickerBadge key={`t2-${idx}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerBadge({ item }: { item: TickerItem }) {
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0 bg-[#f9faf7] border border-[#e3ece1] rounded-full px-3.5 py-1.5 hover:border-[#175b3b] transition-colors cursor-default shadow-2xs">
      <span className="text-xs">{item.flag}</span>
      <span className="text-xs font-bold text-[#10261d] tracking-tight">{item.pair}</span>
      <span className="font-mono text-xs font-bold text-[#175b3b]">{item.rate}</span>
      <span
        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
          item.isNetworkStatus
            ? 'bg-[#ebf5e7] text-[#175b3b]'
            : 'bg-[#f0f4ee] text-[#53635a]'
        }`}
      >
        {item.tag}
      </span>
    </div>
  );
}
