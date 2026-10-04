import { NextResponse } from 'next/server';
import { chatComplete, ChatMessage } from '@/lib/openrouter';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reportType = 'MORNING_BRIEF', query = '', context = {} } = body;

    const deskContext = {
      activeNgnFloat: '₦84,500,000',
      activeGhsFloat: 'GH₵ 169,800',
      currentRate: '1 GHS = 105.06 NGN',
      spreadPct: '2.5%',
      todayVolumeNgn: '₦34,500,000',
      todayDisbursedGhs: 'GH₵ 328,383',
      pendingQueueCount: 3,
      flaggedRiskCount: 1,
      bankCapAlert: 'Zenith Bank is at ₦22M of ₦25M daily limit (NEAR_CAP)',
      momoLiquidityRunway: 'MTN MoMo Kumasi has GH₵ 42,300 (est. 4.2 hours runway)',
      recentFraudBlock: 'AKS-41098 (Chioma Adeleke) blocked for triangular identity mismatch',
      ...context,
    };

    let promptSystem = `You are the Aksen OTC Desk Copilot Agent, an institutional trading and liquidity risk officer for informal and wholesale currency desks across Nigeria and Ghana.
You assist the master desk operator in maximizing trade throughput, preventing bank account freezes, maintaining MoMo float, and preventing receipt forgery.
Write concise, high-impact, professional executive bulletins. Use clear markdown headers, bullet points, and actionable recommendations. Avoid fluff.`;

    let userPrompt = '';

    if (reportType === 'MORNING_BRIEF') {
      userPrompt = `Generate the official Morning Trading Desk Briefing for today.
Include:
1. Executive Liquidity Snapshot (NGN float vs GHS float)
2. Bank Routing Directives (which bank accounts to collect into, noting any near daily caps)
3. MoMo Disbursement Float Readiness in Accra & Kumasi
4. Today's Recommended Spread & Risk Stance
Context:
${JSON.stringify(deskContext, null, 2)}`;
    } else if (reportType === 'DAILY_DIGEST') {
      userPrompt = `Generate the Daily Settlement & Margin Digest.
Include:
1. Total Volume Cleared (NGN ⇄ GHS)
2. Estimated Spread / Gross Margin Captured
3. Settlement Velocity & SLA Compliance
4. Fraud Sentinel Prevention Summary (Bayesian fast-path vs manual blocks)
Context:
${JSON.stringify(deskContext, null, 2)}`;
    } else if (reportType === 'LIQUIDITY_REBALANCE') {
      userPrompt = `Analyze cross-border liquidity and provide an immediate Float Rebalancing Protocol.
Evaluate whether we need to repatriate Cedis to Naira, rotate bank collection accounts, or top up Kumasi MTN MoMo merchant lines.
Context:
${JSON.stringify(deskContext, null, 2)}`;
    } else {
      userPrompt = `The desk operator asked: "${query || 'Provide an operational status report'}"
Answer with specific, actionable OTC trading advice based on this current desk telemetry:
${JSON.stringify(deskContext, null, 2)}`;
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: promptSystem },
      { role: 'user', content: userPrompt },
    ];

    try {
      const completion = await chatComplete({
        messages,
        temperature: 0.25,
        maxTokens: 800,
        timeoutMs: 16000,
      });

      return NextResponse.json({
        report: completion.content,
        model: completion.model,
        telemetry: completion.telemetry,
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (llmError: any) {
      console.warn('OpenRouter free tier unavailable for report. Using heuristic report generator:', llmError?.message);

      // Deterministic Executive Briefing Fallback
      let fallbackReport = '';
      if (reportType === 'MORNING_BRIEF') {
        fallbackReport = `### 🌅 Morning Desk Briefing · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}

#### 1. Executive Liquidity Snapshot
- **Naira Float Available:** ${deskContext.activeNgnFloat} across 4 rotated accounts
- **Ghana MoMo Float:** ${deskContext.activeGhsFloat} across Accra & Kumasi clearing SIMs
- **Current Desk Rate:** ${deskContext.currentRate} (Spread: ${deskContext.spreadPct})

#### 2. Banking Rail Routing
- **Primary Collection:** Route incoming deposits to **GTBank** (Acc: 0123984752) & **OPay**.
- **Action Required:** ⚠️ **Zenith Bank** is at ₦22M / ₦25M. De-rotate from public intake to avoid NIP limit lock.

#### 3. MoMo Disbursement Runway
- **Accra Central:** Healthy float (GH₵ 84,500).
- **Kumasi Corridor:** GH₵ 42,300 remaining (~4.2 hours at peak velocity). Recommend scheduling GH₵ 30k top-up from partner syndicate.

#### 4. Risk Sentinel Focus
- Keep **GEV System 1 Fast-Path** active for verified repeat remitter names. 
- Strict manual review on any third-party transfers with unconfirmed NIBSS session IDs.`;
      } else if (reportType === 'DAILY_DIGEST') {
        fallbackReport = `### 📊 Daily Settlement & Margin Digest

- **Total Naira Collected:** ${deskContext.todayVolumeNgn}
- **Cedis Disbursed:** ${deskContext.todayDisbursedGhs} via instant MoMo
- **Gross Margin Captured:** ~₦862,500 (avg 2.5% corridor spread)
- **Turnaround SLA:** 3.4 minutes average lock-to-disbursal
- **Fraud Sentinel:** 1 triangular impersonation flagged and blocked (100% capital preserved).`;
      } else {
        fallbackReport = `### ⚖️ Cross-Border Liquidity Rebalance Protocol

1. **Repatriation Trigger:** Naira float is building up rapidly (₦84.5M) while Kumasi Cedis float will require replenishment by 16:00.
2. **Recommended Action:** Execute cross-border batch swap of ₦15,000,000 with Accra banking syndicate at 104.90 to reload MTN MoMo merchant lines.
3. **Safety Protocol:** Rotate collection bank to OPay for the next 4 trading hours.`;
      }

      return NextResponse.json({
        report: fallbackReport,
        model: 'heuristic_brief_synthesizer',
        telemetry: {
          model: 'heuristic_brief_synthesizer',
          requestedModels: ['qwen/qwen3.8-27b:free'],
          durationMs: 2,
          status: 'FALLBACK_USED',
        },
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
  } catch (error: any) {
    console.error('Error generating desk report:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
