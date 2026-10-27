// Price alerts: a saved search that sends a push message to a phone when a new deal matches it. Messages go
// through ntfy (https://ntfy.sh): free, no account, a phone app subscribes to a secret topic.
// No Node imports: the cloud app sends the test message from here too.
import { parseGroupKey } from '../shared/party.mjs';
import { formatEuros, formatPercent, formatWeekend } from '../src/lib/format.js';
import { providerName, trackedBookingUrl } from '../src/lib/providers.js';

export const NTFY_SERVER = 'https://ntfy.sh';
// The topic is the only secret: whoever knows it can read the messages. Long and random, made by the browser.
export const TOPIC_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
// A deal told about before counts again only once it is this much cheaper; Landal's cheapest accommodation
// flips back and forth, so the same price returning is not news.
const CHEAPER_SHARE = 0.03;
const MAX_LISTED = 5;
const MAX_SEEN = 1000;

const SEARCH_FILTERS = {
  from: 'string',
  to: 'string',
  minDiscountPercent: 'number',
  maxPriceEuros: 'number',
  minRating: 'number',
  country: 'string',
  search: 'string',
  facilities: 'array',
  brands: 'array',
  maxDistanceKm: 'number',
  // An alert on one park's weekend, set from the park panel.
  parks: 'array',
};

// About a kilometre: enough for a radius, and the stored alert does not pinpoint a home.
const roughly = (degrees) => Math.round(degrees * 100) / 100;

/** Only the known filters, in their expected types; the home address is kept as rough coordinates. */
export function cleanSearch(input = {}) {
  const search = {};
  for (const [key, type] of Object.entries(SEARCH_FILTERS)) {
    const value = input[key];
    if (type === 'string' && typeof value === 'string') search[key] = value.slice(0, 100);
    if (type === 'number' && Number.isFinite(value)) search[key] = value;
    if (type === 'array' && Array.isArray(value)) search[key] = value.filter((item) => typeof item === 'string').slice(0, 50);
  }
  const { origin } = input;
  if (Number.isFinite(origin?.lat) && Number.isFinite(origin?.lng)) {
    search.origin = { lat: roughly(origin.lat), lng: roughly(origin.lng) };
  }
  return search;
}

export const dealKey = (deal) => `${deal.parkCode}|${deal.arrival}`;

/** The deals an alert found as { parkCode, arrival, priceCents }, cheapest per park and weekend. */
export const dealRows = (deals) =>
  deals.slice(0, MAX_SEEN).map(({ park, weekend }) => ({ parkCode: park.code, arrival: weekend.arrival, priceCents: weekend.priceCents }));

/**
 * The deals worth a message: never told about, or clearly cheaper than when they were.
 * @param told park|arrival → price in cents at the last message
 */
export function newOrCheaper(deals, told) {
  return deals.filter(({ park, weekend }) => {
    const before = told.get(dealKey({ parkCode: park.code, arrival: weekend.arrival }));
    return before == null || weekend.priceCents <= before * (1 - CHEAPER_SHARE);
  });
}

/**
 * One message per alert and round, best deals first. Tapping it, or its booking button, opens the best deal at the
 * provider through the site's tracked link: someone who set an alert is ready to book.
 */
export function alertMessage(alert, deals, appUrl) {
  const lines = deals.slice(0, MAX_LISTED).map(({ park, weekend }) => {
    const discount = weekend.discount > 0 ? ` (${formatPercent(weekend.discount)} onder normaal)` : '';
    return `${park.name} · ${formatWeekend(weekend)} · ${formatEuros(weekend.priceCents)}${discount}`;
  });
  if (deals.length > MAX_LISTED) lines.push(`en nog ${deals.length - MAX_LISTED} meer`);
  const message = {
    title: deals.length === 1 ? `Buitenkansje: ${deals[0].park.name}` : `${deals.length} nieuwe buitenkansjes`,
    message: `${lines.join('\n')}\n\nAlarm: ${alert.label}`,
    tags: ['house'],
  };
  if (!appUrl) return message;
  const site = `${appUrl}/${alert.query ? `?${alert.query}` : ''}`;
  const best = deals[0];
  const party = alert.party ?? parseGroupKey(alert.partyKey ?? '');
  if (!party) return { ...message, click: site };
  const book = `${appUrl}${trackedBookingUrl(best.park, best.weekend, party, 'alarm')}`;
  return {
    ...message,
    click: deals.length === 1 ? book : site,
    actions: [
      { action: 'view', label: `Boek ${best.park.name} bij ${providerName(best.park.provider)}`.slice(0, 60), url: book, clear: true },
      ...(deals.length > 1 ? [{ action: 'view', label: 'Alle kansjes bekijken', url: site }] : []),
    ],
  };
}

export async function sendNotification(topic, notification, fetchImpl = fetch) {
  const response = await fetchImpl(NTFY_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, ...notification }),
  });
  if (!response.ok) throw new Error(`ntfy answered ${response.status}`);
}
