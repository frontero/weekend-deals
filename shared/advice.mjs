// "Book now or wait?" for one park and weekend, from how its price and the weekend's availability developed.
// Deliberately simple and explainable: every verdict comes with the reasons behind it.

const DAY_MS = 24 * 60 * 60 * 1000;
// Price moves smaller than this are day-to-day noise.
const TREND_SHARE = 0.03;
// A weekend counts as filling up once this share of the parks that offered it no longer do.
const SELLING_OUT_SHARE = 0.15;
// Changes are only meaningful over at least this many days.
const MIN_SPAN_DAYS = 3;
const LEAVING_SOON_DAYS = 7;
// With a falling price, waiting is only worth it while the weekend is this far away.
const WAIT_MIN_DAYS = 21;

const round = (value) => Math.round(value * 1000) / 1000;

/** @param rows parks offered per provider, weekend and scan, oldest scan first */
export function availabilityTrends(rows) {
  const trends = new Map();
  for (const { provider, arrival, observedAt, parkCount } of rows) {
    const key = `${provider}|${arrival}`;
    const trend = trends.get(key);
    if (trend) trend.latestCount = parkCount;
    else trends.set(key, { firstCount: parkCount, latestCount: parkCount, firstAt: observedAt });
  }
  return trends;
}
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * @param referenceCents the price at the latest observation at least a few days old (null when there is none yet)
 * @param availability parks offering this weekend at its provider: { firstCount, latestCount, firstAt }
 * @returns { verdict: 'book' | 'wait' | 'neutral', trend: 'up' | 'down' | 'flat' | null, reasons: [{ code, … }] }
 */
export function bookingAdvice({
  today,
  arrival,
  priceCents,
  lowestCents,
  highestCents,
  observations,
  firstObservedAt,
  referenceCents,
  referenceAt,
  availability,
}) {
  const daysLeft = daysBetween(`${today}T00:00:00Z`, `${arrival}T00:00:00Z`);
  const reasons = [];

  if (daysLeft <= LEAVING_SOON_DAYS) reasons.push({ code: 'leaving-soon', days: daysLeft });

  const filledShare = availability?.firstCount
    ? round(1 - availability.latestCount / availability.firstCount)
    : 0;
  const sellingOut =
    filledShare >= SELLING_OUT_SHARE && daysBetween(availability.firstAt, `${today}T23:59:59Z`) >= MIN_SPAN_DAYS;
  if (sellingOut) reasons.push({ code: 'selling-out', share: filledShare, since: availability.firstAt });

  if (!referenceCents) {
    // Without a few days of history only the calendar and availability can speak.
    const verdict = reasons.length ? 'book' : 'neutral';
    if (!reasons.length) reasons.push({ code: 'too-new', since: firstObservedAt });
    return { verdict, trend: null, reasons };
  }

  const change = round(priceCents / referenceCents - 1);
  const trend = change >= TREND_SHARE ? 'up' : change <= -TREND_SHARE ? 'down' : 'flat';
  if (trend === 'up') reasons.push({ code: 'rising', share: change, since: referenceAt });
  if (trend === 'down') reasons.push({ code: 'falling', share: -change, since: referenceAt, daysLeft });

  const lowestYet = trend !== 'down' && observations >= 3 && priceCents <= lowestCents && priceCents < highestCents;
  if (lowestYet) reasons.push({ code: 'lowest-yet', since: firstObservedAt });

  if (!reasons.length) reasons.push({ code: 'stable', since: referenceAt });

  const bookNow = daysLeft <= LEAVING_SOON_DAYS || sellingOut || trend === 'up' || lowestYet;
  const verdict = bookNow ? 'book' : trend === 'down' && daysLeft > WAIT_MIN_DAYS ? 'wait' : 'neutral';
  return { verdict, trend, reasons };
}
