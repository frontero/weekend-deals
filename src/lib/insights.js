import { median } from '../../shared/analysis.mjs';

// A price this far from its reference (middle weekend price, or the park's normal price) counts as low or high.
const LEVEL_SHARE = 0.1;
// Fewer weekends than this give no meaningful price band.
const MIN_WEEKENDS_FOR_INSIGHT = 4;

const round = (value) => Math.round(value * 1000) / 1000;

function quantile(sorted, q) {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
}

/** Each market weekend with its `share` against the middle weekend price and a low/typical/high `level`. */
export function weekendLevels(market) {
  const middle = median(market.map((weekend) => weekend.medianCents));
  return market.map((weekend) => {
    const share = round(weekend.medianCents / middle - 1);
    const level = share <= -LEVEL_SHARE ? 'low' : share >= LEVEL_SHARE ? 'high' : 'typical';
    return { ...weekend, share, level };
  });
}

/**
 * Where a weekend price sits among the park's weekend prices, like Google Flights' price insight.
 * The verdict compares with the park's normal price, so it never contradicts the deal badge; the band
 * (middle half of the weekend prices) and `position` (between cheapest and dearest weekend) show the spread.
 */
export function priceInsight(park, weekend) {
  const prices = park.weekends.map((item) => item.priceCents).sort((a, b) => a - b);
  if (prices.length < MIN_WEEKENDS_FOR_INSIGHT) return null;

  const typicalLowCents = quantile(prices, 0.25);
  const typicalHighCents = quantile(prices, 0.75);
  const minCents = prices[0];
  const maxCents = prices.at(-1);
  const share = weekend.priceCents / (park.baselineCents ?? median(prices)) - 1;
  const level = share <= -LEVEL_SHARE ? 'low' : share >= LEVEL_SHARE ? 'high' : 'typical';

  return {
    level,
    typicalLowCents,
    typicalHighCents,
    minCents,
    maxCents,
    position: maxCents === minCents ? 0.5 : round((weekend.priceCents - minCents) / (maxCents - minCents)),
  };
}
