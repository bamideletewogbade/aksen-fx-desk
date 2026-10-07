import { after } from 'next/server';
import type { Db } from './db';
import { dispatchSusuSms } from './susu-sms';

/** Schedule only after the savings transaction has committed. Cron drains the rest. */
export function sendSusuSmsAfterResponse(db: Db, orgId: string) {
  after(async () => {
    try { await dispatchSusuSms(db, orgId); }
    catch { console.error('[susu-sms] queue dispatch failed; savings remain committed'); }
  });
}
