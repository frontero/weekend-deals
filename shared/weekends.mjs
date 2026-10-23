const DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;
const WEEKEND_NIGHTS = 3;

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Landal writes dates as dd-MM-yyyy.
export function toLandalDate(isoDate) {
  return isoDate.split('-').reverse().join('-');
}

export function shiftDays(isoDate, days) {
  return toIsoDate(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS));
}

export function localToday(now = new Date()) {
  return toIsoDate(new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000));
}

// Landal's weekend stay: arrive on Friday, leave on Monday.
export function upcomingWeekends(today, count) {
  const start = new Date(`${today}T00:00:00Z`);
  const daysUntilFriday = (FRIDAY - start.getUTCDay() + 7) % 7;
  const firstFriday = start.getTime() + daysUntilFriday * DAY_MS;

  return Array.from({ length: count }, (_, index) => {
    const arrival = firstFriday + index * 7 * DAY_MS;
    return {
      arrival: toIsoDate(new Date(arrival)),
      departure: toIsoDate(new Date(arrival + WEEKEND_NIGHTS * DAY_MS)),
    };
  });
}
