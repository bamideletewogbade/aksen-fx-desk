import { body, deskRoute } from '@/server/http';
import { channelSchema } from '@/server/schemas';
import { listChannels, saveChannel } from '@/server/inbox';
import { publicBaseUrl, twilioConfigured } from '@/server/twilio';

function twilioStatus() {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? '';
  return {
    configured: twilioConfigured(),
    accountSid: sid ? `${sid.slice(0, 4)}…${sid.slice(-4)}` : null,
    publicBaseUrl: publicBaseUrl(),
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? null,
    smsFrom: process.env.TWILIO_SMS_FROM ?? null,
  };
}

export const GET = deskRoute(async ({ db, ctx }) => ({ channels: await listChannels(db, ctx), twilio: twilioStatus() }));

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const input = await body(req, channelSchema);
  await saveChannel(db, ctx, input);
  return { channels: await listChannels(db, ctx), twilio: twilioStatus() };
});
