import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyWeather, goodWeekendWeather } from './weather.mjs';

const hour = (time, temperature, symbol, rain = 0, hours = 1) => ({
  time,
  data: {
    instant: { details: { air_temperature: temperature } },
    [`next_${hours}_hours`]: { summary: { symbol_code: symbol }, details: { precipitation_amount: rain } },
  },
});

test('sums up each day: warmest daytime hour, daytime rain, mostly sunny or not', () => {
  const days = dailyWeather({
    properties: {
      timeseries: [
        hour('2026-10-31T03:00:00Z', 2, 'rain', 5),
        hour('2026-10-31T09:00:00Z', 10, 'clearsky_day'),
        hour('2026-10-31T12:00:00Z', 14, 'fair_day', 0.2),
        hour('2026-10-31T15:00:00Z', 13, 'cloudy'),
        hour('2026-11-01T12:00:00Z', 9, 'rain', 3, 6),
      ],
    },
  });
  assert.deepEqual(days, [
    { date: '2026-10-31', maxTemp: 14, rainMm: 0.2, sunny: true },
    { date: '2026-11-01', maxTemp: 9, rainMm: 3, sunny: false },
  ]);
});

test('a weekend has good weather only when Saturday and Sunday are dry, sunny and warm enough', () => {
  const day = (date, maxTemp, sunny = true, rainMm = 0) => ({ date, maxTemp, sunny, rainMm });
  const weekend = { arrival: '2026-10-30' };
  assert.deepEqual(goodWeekendWeather([day('2026-10-31', 14), day('2026-11-01', 13)], weekend), { maxTemp: 14 });
  assert.equal(goodWeekendWeather([day('2026-10-31', 14), day('2026-11-01', 13, false)], weekend), null);
  assert.equal(goodWeekendWeather([day('2026-10-31', 14), day('2026-11-01', 13, true, 2)], weekend), null);
  assert.equal(goodWeekendWeather([day('2026-10-31', 9), day('2026-11-01', 13)], weekend), null);
  assert.equal(goodWeekendWeather([day('2026-10-31', 14)], weekend), null, 'the forecast does not reach Sunday');
});
