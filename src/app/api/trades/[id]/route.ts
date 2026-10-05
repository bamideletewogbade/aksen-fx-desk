import { body, deskRoute } from '@/server/http';
import { tradeAction } from '@/server/schemas';
import { notifyTradeChange } from '@/server/inbox';
import {
  acceptForCustomer,
  addNote,
  approvePayout,
  cancelTrade,
  getTrade,
  holdTrade,
  markRefundDue,
  recordFunds,
  recordPayout,
  recordRefund,
  reissueLink,
  releaseHold,
  requote,
  setBeneficiary,
} from '@/server/trades';

type P = { id: string };

export const GET = deskRoute<P>(async ({ db, ctx, params }) => ({ trade: await getTrade(db, ctx, params.id) }));

/** One endpoint for every trade command. Each carries the version the operator saw. */
export const POST = deskRoute<P>(async ({ req, db, ctx, params }) => {
  const a = await body(req, tradeAction);
  const id = params.id;
  let result: unknown = null;
  switch (a.action) {
    case 'accept': await acceptForCustomer(db, ctx, { id, version: a.version, beneficiary: a.beneficiary }); break;
    case 'beneficiary': await setBeneficiary(db, ctx, { id, version: a.version, beneficiary: a.beneficiary }); break;
    case 'requote': await requote(db, ctx, id, a.version); break;
    case 'record_funds': result = await recordFunds(db, ctx, { id, version: a.version, railId: a.railId, amountMinor: a.amount, bankReference: a.bankReference, payerName: a.payerName }); break;
    case 'approve': await approvePayout(db, ctx, { id, version: a.version, acknowledged: a.acknowledged }); break;
    case 'record_payout': await recordPayout(db, ctx, { id, version: a.version, railId: a.railId, reference: a.reference }); break;
    case 'hold': await holdTrade(db, ctx, { id, version: a.version, reason: a.reason }); break;
    case 'release': await releaseHold(db, ctx, { id, version: a.version }); break;
    case 'cancel': await cancelTrade(db, ctx, { id, version: a.version, reason: a.reason }); break;
    case 'refund_due': await markRefundDue(db, ctx, { id, version: a.version, reason: a.reason }); break;
    case 'record_refund': await recordRefund(db, ctx, { id, version: a.version, railId: a.railId, amountMinor: a.amount, reference: a.reference }); break;
    case 'note': await addNote(db, ctx, id, a.note); break;
    case 'reissue_link': result = { portalPath: `/t/${await reissueLink(db, ctx, { id, version: a.version })}` }; break;
  }
  // Trades that started in a WhatsApp/SMS chat keep the customer posted there.
  await notifyTradeChange(db, ctx, id, a.action, result);
  return { ok: true, result, trade: await getTrade(db, ctx, id) };
});
