'use client';

import { Heart, Compass, Shield, Users, CheckCircle2 } from 'lucide-react';

export function OriginStory() {
  return (
    <section id="about" className="py-20 px-4 sm:px-6 lg:px-8 border-b border-[#e3ece1] bg-[#f9faf7] scroll-mt-16">
      <div className="max-w-4xl mx-auto space-y-8 text-left">
        <div className="inline-flex items-center rounded-full border border-[#e3ece1] bg-white px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider text-[#175b3b] shadow-2xs">
          <span>WHY THIS WAS BUILT</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#10261d] leading-snug">
          &ldquo;I remember first arriving in Ghana as a student. The anxiety of waiting for Cedis never leaves you.&rdquo;
        </h2>

        <div className="prose prose-sm text-[#47584e] space-y-4 text-sm sm:text-base leading-relaxed">
          <p>
            Anyone who has crossed the Nigeria–Ghana corridor knows the pit in their stomach: standing at the school finance office or the market stall, waiting for a WhatsApp money changer to confirm a Naira debit alert while tuition deadlines or consignment pickups tick away.
          </p>
          <p>
            On the operator’s side, it’s even worse. Bureau operators and changers stay awake until 1 AM reviewing blurry screenshots, terrified of paying out Cedis on a Canva-edited fake slip or having their entire GTBank or Zenith account placed on Post-No-Debit (PND) freeze because a fraudster used them as a middleman.
          </p>
          <p className="font-medium text-[#10261d]">
            We didn’t build Aksen OTC to force African traders to download another complicated consumer app. African trade already lives on WhatsApp. We built the engine behind the phone—so every quote is locked, every bank slip is verified mathematically, and honest money moves without friction.
          </p>
        </div>

        <div className="pt-4 flex items-center gap-4 text-xs font-mono text-[#53635a]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#10261d] text-[#c2f576] font-bold">
            B
          </div>
          <div>
            <strong className="text-sm font-bold text-[#10261d] block">Bishop Tewogbade</strong>
            <span>Founder &middot; Aksen Labs &middot; Accra &amp; Lagos</span>
          </div>
        </div>
      </div>
    </section>
  );
}
