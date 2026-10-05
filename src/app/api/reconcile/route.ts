import { body, deskRoute, query } from '@/server/http';
import { closeDaySchema } from '@/server/schemas';
import { closeRailDay, getDay, todayIn } from '@/server/day-close';
import { getSettings } from '@/server/desk';

export const GET = deskRoute(async ({ req, db, ctx }) => {
  const settings = await getSettings(db, ctx);
  const date = query(req).get('date') || todayIn(settings.timezone);
  return { day: await getDay(db, ctx, date), today: todayIn(settings.timezone) };
});

export const POST = deskRoute(async ({ req, db, ctx }) => {
  const i = await body(req, closeDaySchema);
  await closeRailDay(db, ctx, { date: i.date, railId: i.railId, statementInMinor: i.statementIn, statementOutMinor: i.statementOut, note: i.note });
  return { day: await getDay(db, ctx, i.date) };
});
