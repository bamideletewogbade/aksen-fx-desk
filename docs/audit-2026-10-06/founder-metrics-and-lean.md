# Aksen OTC: founder metrics and Lean Startup experiments

Prepared 6–7 October 2026. This is a measurement plan, not evidence of traction. No customer acquisition, subscription, retention, or actual cost figures were supplied or verified. Unknown values are **not measured**, not zero.

## First define the customer

The public page proposes setup plus a monthly desk fee. On that model, Aksen's paying customer is a business/desk, represented by an organization. Its staff are users. Its currency buyers and daily savers are the desk's customers. Count one contracted, paying business once; do not count its employees or individual traders as Aksen customers. A demo, signup, free pilot and paying account are different stages.

Aksen software revenue is distinct from a desk's traded currency volume, estimated spread, transfer fees, and saver contributions. Savings held for customers are liabilities, not revenue. NGN and GHS are separate amounts; do not add them without a documented reporting-currency conversion.

## The five primary numbers for this stage

Use monthly acquisition cohorts, a weekly operational review, and one explicit reporting currency. Report numerators and denominators, especially with a small pilot.

| Metric | Exact proposed definition | Evidence to collect | What a founder should decide |
|---|---|---|---|
| 1. New paying businesses acquired | Count of distinct businesses making their first non-refunded Aksen software payment in the month. Also report qualified-lead-to-paid conversion for a sufficiently mature lead cohort: first-paying businesses / qualified businesses in that cohort. | Business ID, acquisition source, qualification date, pilot start, first paid date, contract and payment reference; distinguish setup-only and recurring customers. | Which customer segment and channel brings actual buyers? Is the bottleneck discovery, walkthrough, pilot, or payment? |
| 2. Customer acquisition cost (CAC) | Fully loaded acquisition spend attributable to a channel/cohort / new paying businesses acquired from it. Show cash CAC separately from economic CAC including founder sales time. Allow for the sales-cycle lag. If no customers are acquired, CAC is undefined, not zero. | Ads, referral fees, sales labor, travel, sales tools and founder sales hours at a disclosed rate; attribution and payment evidence. Keep delivery/onboarding labor out of acquisition spend if it is classified as cost to serve. | Is the channel repeatable and affordable? Are apparently free founder-led sales actually expensive? |
| 3. Activation rate | For a qualified pilot cohort, businesses that complete the agreed first-value event within seven days / businesses whose seven-day observation window has ended. Proposed FX event: operator independently records a permitted shadow trade through customer acceptance, statement check, approval, recorded payout and day close. Synthetic demo trades do not qualify. | Pilot start, first completed workflow, first reviewed close, assisted/unassisted flag, staff training time. Record time to first value too. | Can a desk get useful work done without the founder doing it for them? Where does setup fail? |
| 4. Retained active businesses | Businesses from an activated cohort still doing the core workflow in week four / businesses in that cohort old enough to reach week four. Define active before the experiment: e.g. real work on at least three business days that week, adjusted for that desk's normal frequency. Track paid renewals separately. | Organization, activation cohort, meaningful activity dates, workflow completions, renewal payment, cancellation reason. Exclude samples and rehearsal chats. | Does the product become a habit? Are customers staying because of value, or because the founder keeps chasing them? |
| 5. Monthly contribution profit per paying business | (Recurring software revenue recognized in month − directly attributable service costs) / average active paying businesses in that month. Show contribution margin % and each customer's distribution, not only the average. Show one-time setup revenue and onboarding delivery costs separately. | Software revenue, payment fees, AI/model usage, inbound/outbound message costs, allocable database/hosting, support and account servicing labor, refunds/credits. Document shared-cost allocation; do not call this net profit. | Does each additional desk improve the business's finances? Which customers are expensive to support, and should packaging or pricing change? |

These definitions build on standard acquisition, retention and unit-economics measures described in [Stripe's SaaS metrics guide](https://stripe.com/ae/resources/more/essential-saas-metrics). The seven-day and week-four windows above are proposed experiment definitions, not universal benchmarks or evidence of product-market fit.

## Related numbers a founder should always keep nearby

- **MRR:** normalized recurring contracted software revenue for the month. Exclude setup fees and currency volume. Reconcile it with actual cash collections and unpaid invoices.
- **ARPA:** monthly recurring revenue / average paying businesses. Segment by plan and customer size.
- **Cost to serve:** monthly direct delivery/service costs / average served businesses. This answers “what does each customer cost after acquisition?” CAC answers the separate acquisition question.
- **CAC payback:** CAC / monthly contribution profit per customer, with consistent cost definitions. If contribution is zero or negative, there is no finite payback. Do not count the same sales/onboarding cost in both numerator and denominator.
- **Net cash burn and runway:** monthly operating cash outflows minus operating cash inflows; available unrestricted company cash / expected monthly net burn. Show a forward cash schedule if costs fluctuate. Exclude customer deposits, saver balances, and desk float from Aksen's spendable cash. If cash-generative, a simple burn-based runway is not applicable.
- **Renewal / churn:** paying customers lost during the period / paying customers at the start; use a defined renewal opportunity and distinguish cancellation from failed collection.
- **Lifetime value:** only estimate once retention and margins are stable enough. A simple ARPA × margin / monthly churn estimate relies on strong assumptions; early low/no churn from a tiny cohort cannot justify an enormous LTV. Prefer observed cumulative cohort contribution and payback at this stage.

Illustration only, not Aksen results: GHS3,000 acquisition spend wins three paying businesses → CAC GHS1,000. Monthly software revenue GHS1,500 per business minus GHS600 direct service cost → contribution GHS900 and 60% margin. Payback is about 1.11 months before considering any excluded onboarding cost or revenue volatility. GHS18,000 unrestricted cash with GHS3,000 monthly net burn gives six months' simple runway.

## What the source can measure today

`src/server/insights.ts` computes per-desk completed trades, volumes in both currencies, fees, reference-rate-based spread, conversion stages, median stage durations, active/new/returning traders, and attention queues. Its `REAL` condition excludes rehearsal-linked trades from the main aggregates. `src/server/leads.ts` stores enquiries.

These are useful operational records, not an Aksen founder financial dashboard. The reviewed source has no complete software subscription/invoice ledger, marketing attribution, acquisition-spend model, support time ledger, or per-organization vendor-cost allocation. No verified actual values for the five founder metrics can be calculated from this audit.

Keep these measurement cautions:

1. A completed-trade count by completion date and a funnel by quote-creation date have different denominators. Do not divide unrelated cards to claim conversion.
2. “Returning customers” means desk traders with earlier completed trades. It is not retention of businesses buying Aksen software.
3. Reference-rate spread is an estimate against a desk-entered rate, not independently reconciled realized profit.
4. The returning-customer subquery checks earlier completions without the same rehearsal exclusion used for the active cohort. Review that edge case before treating new/returning breakdown as definitive.
5. Existing cost documents are planning estimates. This review did not re-verify vendor prices or actual invoices, so their totals are not actual cost per customer.

Start with one founder ledger before building another dashboard. Minimum columns: business ID, segment, channel, first qualified date, pilot start, activation date, assisted flag, first paid date, monthly recurring fee, setup fee, renewal due/paid, cancellation date/reason, acquisition cash, sales hours, onboarding hours, support hours, vendor usage/cost, refunds, and observation-window eligibility. Keep operational bank details out of that ledger.

## Is Lean Startup still useful in the AI era?

Yes, as a method of disciplined learning. Its central ideas are validated learning, short Build–Measure–Learn loops, and accounting that distinguishes meaningful progress from activity. Those ideas come from [Eric Ries's methodology](https://theleanstartup.com/principles). They do not establish that every startup must use the same MVP or experiment.

My judgment: AI reduces the cost of producing code, copy and prototypes. It does not by itself prove willingness to pay, durable usage, trustworthy operations, affordable distribution, or an eligible delivery channel. A founder can now build the wrong product much faster. The practical advantage is cheaper tests of risky assumptions, provided results are measured in customer behavior and economics rather than feature count.

For Aksen, use the smallest safe learning product. A narrow desk/portal shadow workflow can test value while funds continue through the operator's existing process. Safety controls around authorization, liabilities and reconciliation remain part of the minimum; they are not optional polish. Interviews reveal hypotheses, observed workflow reveals friction, paid continuation reveals stronger commercial commitment. None alone proves product-market fit. [YC's product-market-fit guidance](https://www.ycombinator.com/blog/the-real-product-market-fit/) similarly emphasizes meaningful problems and actual customer pull.

AI-specific evidence belongs alongside ordinary business metrics: grounded extraction accuracy, consequential wrong-field rate, human corrections, fallback/handoff rate, latency percentiles, model and messaging cost per successful workflow, and whether an operator can recover when providers fail. Model confidence and uncalibrated risk scores are not observed success rates.

## Proposed first 30-day learning cycle

These are provisional decision rules to agree before the pilot, not industry benchmarks. Keep FX and Susu cohorts separate until discovery demonstrates that the same buyer wants both.

| Stage | Hypothesis and experiment | Evidence and proposed decision |
|---|---|---|
| Days 1–5: discovery | Interview five licensed/eligible desk owners. Ask them to reconstruct their last completed trade, a recent exception, and day close from actual records. Observe with consent; do not collect unnecessary customer identifiers. | At least three independently describe the same expensive problem and can show its operational consequence. Otherwise narrow or change the problem hypothesis. Ask who buys, budget, alternatives, and workflow frequency. |
| Days 6–10: usability | Give three design partners the same synthetic trade and exception tasks with minimal coaching. Measure completion, errors, time and help needed. | Proposed: all can distinguish uploaded evidence from confirmed funds; at least two complete the core task without founder intervention. Fix observed comprehension/control failures before a shadow pilot. |
| Days 11–24: shadow pilot | After critical fixes, compare Aksen records with the existing process at two or three eligible desks. No Aksen-controlled money movement. Choose FX or Susu for each experiment. | Predefine the baseline and paired tasks. Proposed improvement target: at least 30% less operator handling time or close effort, with no unresolved monetary mismatch. Report raw denominators, median and slow-tail time, support burden and exceptions. A small cohort is directional evidence, not a statistically reliable market estimate. |
| Days 25–30: commercial test | Present a concrete setup/monthly offer based on measured delivery cost. Ask for a real paid continuation decision. | At least two design partners willing to pay and continue gives a reason to extend learning, not to declare PMF. If use is strong but payment weak, investigate buyer/budget/packaging. If use is weak, fix the problem/value before buying traffic. |

Recommended initial learning question: **Will a licensed desk pay to reduce the work and uncertainty of taking a trade from quote to a reconciled record?** Test this independently of WhatsApp automation. The policy feasibility of an automated currency-exchange chat is a separate, critical assumption.

Susu has a different value event: record a collection round accurately, give correct change, preserve saver balances, and close/withdraw with correct fees and authority. It may be valuable for the same business, but current source breadth is not evidence that combining both improves activation or retention.

## Experiment card to reuse

Write down: customer segment; risky assumption; current baseline; smallest test; owner; start/end; cohort eligibility; success/failure thresholds; money/privacy guardrails; measured result; unexpected behavior; decision to persevere, change, or stop. Record what result would change your mind before running it. Each week choose the experiment that reduces the largest remaining business uncertainty.
