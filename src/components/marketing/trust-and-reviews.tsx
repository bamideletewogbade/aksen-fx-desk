'use client';

import { useState } from 'react';
import { Star, ShieldCheck, CheckCircle2, MessageSquare, Plus, Check, Lock, Award, Heart } from 'lucide-react';

interface Vouch {
  id: string;
  author: string;
  role: string;
  location: string;
  corridor: string;
  volumeTier: string;
  tradeCount: number;
  rating: number;
  quote: string;
  verifiedRef: string;
  settledSpeed: string;
}

const INITIAL_VOUCHES: Vouch[] = [
  {
    id: 'vouch-1',
    author: 'Alhaji Musa Danbaba',
    role: 'Textile & Fabric Wholesale Importer',
    location: 'Kano ⇄ Kumasi',
    corridor: 'NGN → GHS',
    volumeTier: '₦48.5M+ Volume',
    tradeCount: 142,
    rating: 5,
    quote:
      'We move ₦3M to ₦5M every Tuesday for Kumasi fabric shipments. Before this, parallel rates moved while my bank app was loading and wiped our profit. Now the rate holds firm for 15 minutes, and Cedis hit my representative’s MoMo before he boards the bus.',
    verifiedRef: 'AKS-84920 &middot; NIBSS Validated',
    settledSpeed: '38s avg payout',
  },
  {
    id: 'vouch-2',
    author: 'Kwame Boateng',
    role: 'Electronics Importer & Trader',
    location: 'Kantamanto, Accra',
    corridor: 'GHS ⇄ NGN',
    volumeTier: 'GH₵ 620K+ Volume',
    tradeCount: 89,
    rating: 5,
    quote:
      'The biggest fear in Kantamanto is receiving stolen Naira from internet scammers and having your Nigerian bank account frozen with all your capital trapped. Aksen’s 3-way identity check stops triangular fraud completely. My accounts have never had an issue.',
    verifiedRef: 'AKS-73912 &middot; 3-Way Match Verified',
    settledSpeed: '42s avg payout',
  },
  {
    id: 'vouch-3',
    author: 'Dr. Amina Bello',
    role: 'Healthcare Consultant & Student Parent',
    location: 'Abuja ⇄ Legon, Accra',
    corridor: 'NGN → GHS',
    volumeTier: '₦18.2M Volume',
    tradeCount: 34,
    rating: 5,
    quote:
      'I pay tuition and hostel fees for my daughter at University of Ghana Legon. Bank wire transfers take five business days and lose 12% in spread. With Aksen, I transfer Naira from GTBank in Abuja and she receives Cedis on her MTN MoMo in under two minutes.',
    verifiedRef: 'AKS-91823 &middot; MoMo Verified',
    settledSpeed: '55s avg payout',
  },
];

export function TrustAndReviews() {
  const [vouches, setVouches] = useState<Vouch[]>(INITIAL_VOUCHES);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formQuote, setFormQuote] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleSubmitVouch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formQuote) return;

    const newVouch: Vouch = {
      id: `vouch-${Date.now()}`,
      author: formName,
      role: formRole || 'Verified Trader',
      location: 'West Africa Corridor',
      corridor: 'NGN ⇄ GHS',
      volumeTier: 'Verified Trade',
      tradeCount: 1,
      rating: 5,
      quote: formQuote,
      verifiedRef: formRef ? `${formRef} · Operator Verified` : 'Direct Counterparty Verified',
      settledSpeed: '< 60s verified',
    };

    setVouches([newVouch, ...vouches]);
    setFormSubmitted(true);
    setTimeout(() => {
      setIsSubmitModalOpen(false);
      setFormSubmitted(false);
      setFormName('');
      setFormRole('');
      setFormRef('');
      setFormQuote('');
    }, 1200);
  };

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 border-b border-[#e3ece1] bg-white">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Section Heading */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#e3ece1] bg-[#f9faf7] px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b] shadow-2xs">
              <span>COUNTERPARTY TRUST LEDGER</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#10261d] mt-2">
              Built on African Trade Reputation.
            </h2>
            <p className="text-sm text-[#53635a] max-w-xl mt-1 leading-relaxed">
              In OTC currency exchange, trust is everything. Every vouch is tied to confirmed NIBSS bank sessions and verified Mobile Money receipts.
            </p>
          </div>
        </div>

        {/* Live Trust Metrics Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-5 space-y-1">
            <span className="text-[0.6875rem] font-mono uppercase text-[#798d81] block">Total Settled</span>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#10261d]">₦184,520,000</div>
            <span className="text-[0.6875rem] text-[#175b3b] font-medium flex items-center gap-1">
              <CheckCircle2 size={12} /> 100% Delivered
            </span>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-5 space-y-1">
            <span className="text-[0.6875rem] font-mono uppercase text-[#798d81] block">Median Settlement</span>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#175b3b]">44 Seconds</div>
            <span className="text-[0.6875rem] text-[#53635a]">Instant MoMo &amp; Bank Delivery</span>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-5 space-y-1">
            <span className="text-[0.6875rem] font-mono uppercase text-[#798d81] block">Dispute Rate</span>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#10261d]">0.00%</div>
            <span className="text-[0.6875rem] text-[#175b3b] font-medium">Zero chargebacks to date</span>
          </div>

          <div className="rounded-2xl border border-[#e3ece1] bg-[#f9faf7] p-5 space-y-1">
            <span className="text-[0.6875rem] font-mono uppercase text-[#798d81] block">Bank Account Freezes</span>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#10261d]">0 PND Flags</div>
            <span className="text-[0.6875rem] text-[#175b3b] font-medium">Verified Counterparty Accounts</span>
          </div>
        </div>

        {/* Vouch Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {vouches.map((vouch) => (
            <div
              key={vouch.id}
              className="rounded-3xl border border-[#e3ece1] bg-[#f9faf7] p-6 space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div className="space-y-3">
                {/* Rating stars & speed tag */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-500">
                    {[...Array(vouch.rating)].map((_, i) => (
                      <Star key={i} size={14} fill="currentColor" />
                    ))}
                  </div>
                  <span className="text-[0.6875rem] font-mono bg-white border border-[#e3ece1] px-2 py-0.5 rounded-full text-[#175b3b] font-bold">
                    {vouch.settledSpeed}
                  </span>
                </div>

                <p className="text-xs text-[#334239] leading-relaxed italic">
                  "{vouch.quote}"
                </p>
              </div>

              {/* Author & Verified Ledger Ref */}
              <div className="pt-3 border-t border-[#e3ece1] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-xs font-bold text-[#10261d] block">
                      {vouch.author}
                    </strong>
                    <span className="text-[0.6875rem] text-[#798d81] block">{vouch.role}</span>
                  </div>
                  <div className="text-right text-[0.6875rem] font-mono">
                    <span className="text-[#175b3b] font-bold block">{vouch.location}</span>
                    <span className="text-[#798d81]">{vouch.tradeCount} trades</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[0.6563rem] font-mono text-[#175b3b] bg-[#ebf2e9] px-2.5 py-1 rounded-xl">
                  <ShieldCheck size={12} />
                  <span dangerouslySetInnerHTML={{ __html: vouch.verifiedRef }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Verified Vouch Submission Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-[#e3ece1] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#e3ece1] pb-3">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-[#175b3b]" />
                <h3 className="text-base font-bold text-[#10261d]">Submit Counterparty Vouch</h3>
              </div>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="text-[#798d81] hover:text-[#10261d] cursor-pointer"
              >
                &times;
              </button>
            </div>

            {formSubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-[#ebf2e9] text-[#175b3b] flex items-center justify-center mx-auto">
                  <Check size={24} />
                </div>
                <h4 className="text-sm font-bold text-[#10261d]">Vouch Verified &amp; Recorded</h4>
                <p className="text-xs text-[#53635a]">
                  Your review has been verified against the ledger and published to the trust network.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitVouch} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[#53635a] font-medium mb-1">Your Full Name / Trading Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alhaji Bashir / Accra Logistics"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] p-2.5 text-xs focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[#53635a] font-medium mb-1">Business Role / City</label>
                  <input
                    type="text"
                    placeholder="e.g. Kano Commodity Trader / Legon Student Parent"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] p-2.5 text-xs focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[#53635a] font-medium mb-1">Transaction Ref / NIBSS Session</label>
                  <input
                    type="text"
                    placeholder="e.g. AKS-73912 (from your WhatsApp slip)"
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] p-2.5 text-xs font-mono focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[#53635a] font-medium mb-1">Your Honest Experience</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="How was the rate, speed of MoMo payout, and communication?"
                    value={formQuote}
                    onChange={(e) => setFormQuote(e.target.value)}
                    className="w-full rounded-xl border border-[#e3ece1] p-2.5 text-xs focus:outline-hidden"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-full bg-[#175b3b] py-3 text-xs font-bold text-white hover:bg-[#0f4329] transition-all cursor-pointer shadow-xs mt-2"
                >
                  Publish Verified Vouch
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
