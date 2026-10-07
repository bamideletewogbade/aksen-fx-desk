// @ts-expect-error OpenNext generates this module during the Cloudflare build.
import handler from './.open-next/worker.js';

type SmsWorkerEnv = { SUSU_SMS_CRON_SECRET?: string; WORKER_SELF_REFERENCE: { fetch(request: Request): Promise<Response> } };
export default {
  fetch: handler.fetch,
  async scheduled(_event: unknown, env: SmsWorkerEnv) {
    if (!env.SUSU_SMS_CRON_SECRET) return;
    const result = await env.WORKER_SELF_REFERENCE.fetch(new Request('https://aksen-otc.bishoptewogbade.workers.dev/api/internal/susu-sms',{
      method:'POST',headers:{authorization:`Bearer ${env.SUSU_SMS_CRON_SECRET}`},
    }));
    if (!result.ok) throw new Error(`Susu SMS queue returned ${result.status}`);
  },
};
