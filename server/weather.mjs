// The weather forecast per park from MET Norway (yr.no): free, also for a commercial site, with credit to MET Norway.
// It reaches about nine days ahead, so mostly the coming weekend. A page mentions the weather only when it is good:
// dry, sunny and warm enough for the season.
import { fetchWithRetry } from './http.mjs';
import { shiftDays } from '../shared/weekends.mjs';

const FORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
// MET Norway asks for a User-Agent with a way to reach whoever asks.
const USER_AGENT = 'weekend-deals/0.1 https://github.com/frontero/weekend-deals';
// Daytime, local time: what counts for a day out.
const DAY_START = 9;
const DAY_END = 18;
const SUNNY = /^(clearsky|fair|partlycloudy)/;
// Share of the daytime forecast that has to be sunny or partly cloudy.
const SUNNY_SHARE = 0.6;
const DRY_MM = 1;
// Warm enough for the season, per month from January: a dry, sunny 5 °C in December is a fine day for a walk.
const WARM_ENOUGH = [4, 4, 8, 12, 16, 19, 19, 19, 16, 12, 8, 4];

const local = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Per day: the highest daytime temperature, the daytime rain and whether the day is mostly sunny. */
export function dailyWeather(json) {
  const days = new Map();
  const dayOf = (date) => {
    if (!days.has(date)) days.set(date, { date, maxTemp: -Infinity, rainMm: 0, periods: 0, sunny: 0 });
    return days.get(date);
  };
  for (const { time, data } of json.properties?.timeseries ?? []) {
    const parts = Object.fromEntries(local.formatToParts(new Date(time)).map((part) => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour);
    if (hour >= DAY_START && hour <= DAY_END) dayOf(date).maxTemp = Math.max(dayOf(date).maxTemp, data.instant.details.air_temperature);
    // Hourly for the first days, six-hourly after: a period counts when it overlaps the daytime.
    const period = data.next_1_hours ?? data.next_6_hours;
    const hours = data.next_1_hours ? 1 : 6;
    if (!period || hour >= DAY_END || hour + hours <= DAY_START) continue;
    const day = dayOf(date);
    day.rainMm += period.details?.precipitation_amount ?? 0;
    day.periods += 1;
    if (SUNNY.test(period.summary.symbol_code)) day.sunny += 1;
  }
  return [...days.values()]
    .filter((day) => day.periods > 0 && Number.isFinite(day.maxTemp))
    .map(({ date, maxTemp, rainMm, periods, sunny }) => ({
      date,
      maxTemp: Math.round(maxTemp),
      rainMm: Math.round(rainMm * 10) / 10,
      sunny: sunny / periods >= SUNNY_SHARE,
    }));
}

/** { maxTemp } when Saturday and Sunday both look good, else null (also when the forecast does not reach them). */
export function goodWeekendWeather(days, { arrival }) {
  const [saturday, sunday] = [1, 2].map((offset) => days.find((day) => day.date === shiftDays(arrival, offset)));
  if (!saturday || !sunday) return null;
  const warmEnough = WARM_ENOUGH[Number(saturday.date.slice(5, 7)) - 1];
  const good = (day) => day.sunny && day.rainMm < DRY_MM && day.maxTemp >= warmEnough;
  return good(saturday) && good(sunday) ? { maxTemp: Math.max(saturday.maxTemp, sunday.maxTemp) } : null;
}

/** @returns the days dailyWeather makes of MET Norway's forecast for the park */
export async function fetchForecast({ lat, lng }) {
  // Coordinates to two decimals (about a kilometre): MET Norway asks for few, so its cache can answer.
  const params = new URLSearchParams({ lat: lat.toFixed(2), lon: lng.toFixed(2) });
  const response = await fetchWithRetry(`${FORECAST_URL}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  return dailyWeather(await response.json());
}
