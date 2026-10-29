// What makes a weekend away special, from facts alone: a public holiday that saves a day off, Valentine's Day,
// Mother's or Father's Day, New Year's Eve, carnival, and the school holidays. Each as a short label (a chip next to
// the weekend) and a sentence (a weekend's own page).
import { shiftDays } from './weekends.mjs';

const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const weekday = (isoDate) => WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
const pad = (number) => String(number).padStart(2, '0');

/** Easter Sunday of a year (Gregorian calendar, the anonymous algorithm), as an ISO date. */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The nth Sunday of a month (1-based month), e.g. Mother's Day: the second Sunday of May. */
function nthSunday(year, month, n) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return `${year}-${pad(month)}-${pad(1 + ((7 - first) % 7) + (n - 1) * 7)}`;
}

/**
 * The year's special days. `dayOff`: most people have it off, so on a Friday or Monday the long weekend costs no
 * day off. Good Friday and Liberation Day are left out there: many work on them.
 */
export function specialDays(year) {
  const sunday = easter(year);
  const kingsDay = weekday(`${year}-04-27`) === 'zondag' ? `${year}-04-26` : `${year}-04-27`;
  return [
    { date: `${year}-01-01`, name: 'Nieuwjaarsdag', dayOff: true },
    { date: `${year}-02-14`, name: 'Valentijnsdag', label: 'Valentijnsweekend', text: 'Valentijnsdag valt in dit weekend.' },
    {
      date: shiftDays(sunday, -49),
      name: 'Carnaval',
      label: 'Carnaval',
      text: 'Het is carnaval: in Limburg en Brabant is het feest, elders is het juist rustig.',
    },
    { date: sunday, name: 'Eerste paasdag', dayOff: true, label: 'Pasen' },
    { date: shiftDays(sunday, 1), name: 'Tweede paasdag', dayOff: true, label: 'Pasen' },
    { date: kingsDay, name: 'Koningsdag', dayOff: true },
    { date: nthSunday(year, 5, 2), name: 'Moederdag', label: 'Moederdag', text: 'Zondag is het Moederdag.' },
    {
      date: shiftDays(sunday, 40),
      name: 'Hemelvaart',
      label: 'Na Hemelvaart',
      text: 'Het weekend na Hemelvaartsdag: met de vrije donderdag en één dag vrij heb je een lang weekend.',
    },
    { date: shiftDays(sunday, 49), name: 'Eerste pinksterdag', dayOff: true, label: 'Pinksteren' },
    { date: shiftDays(sunday, 50), name: 'Tweede pinksterdag', dayOff: true, label: 'Pinksteren' },
    { date: nthSunday(year, 6, 3), name: 'Vaderdag', label: 'Vaderdag', text: 'Zondag is het Vaderdag.' },
    { date: `${year}-12-25`, name: 'Eerste kerstdag', dayOff: true, label: 'Kerst' },
    { date: `${year}-12-26`, name: 'Tweede kerstdag', dayOff: true, label: 'Kerst' },
    { date: `${year}-12-31`, name: 'Oudejaarsdag', label: 'Oud en nieuw', text: 'Je viert oud en nieuw op het park.' },
  ];
}

const REGIONS = { noord: 'Noord', midden: 'Midden', zuid: 'Zuid' };

/**
 * @param weekend { arrival, departure }: Friday to Monday
 * @param schoolHolidays [{ name, region, start, end }] as Rijksoverheid lists them, see server/holidays.mjs
 * @returns [{ label, text }], each occasion once
 */
export function weekendOccasions({ arrival, departure }, schoolHolidays = []) {
  const inStay = (date) => date >= arrival && date <= departure;
  const days = [...new Set([arrival.slice(0, 4), departure.slice(0, 4)])].flatMap((year) => specialDays(Number(year)));
  const occasions = [];
  for (const day of days.filter((candidate) => inStay(candidate.date))) {
    const on = weekday(day.date);
    if (day.dayOff && (on === 'vrijdag' || on === 'maandag')) {
      occasions.push({
        label: day.label ?? `Lang weekend: ${day.name.toLowerCase()}`,
        text: `${day.name} valt op ${on}: daarvoor hoef je geen vrij te nemen.`,
      });
    } else if (day.dayOff) {
      occasions.push({ label: day.label ?? day.name, text: `${day.name} valt in dit weekend.` });
    } else {
      occasions.push({ label: day.label, text: day.text });
    }
  }

  const holidays = Map.groupBy(
    schoolHolidays.filter((holiday) => holiday.start <= departure && holiday.end >= arrival),
    (holiday) => holiday.name,
  );
  for (const [name, list] of holidays) {
    const regions = list.map((holiday) => REGIONS[holiday.region]).filter(Boolean);
    const everywhere = list.some((holiday) => !REGIONS[holiday.region]) || regions.length === 3;
    const where = everywhere ? 'heel Nederland' : `regio ${regions.join(' en ')}`;
    occasions.push({ label: `${name} ${everywhere ? '' : regions.join('/')}`.trim(), text: `Het is ${name.toLowerCase()} in ${where}.` });
  }

  // Easter or Christmas can give two days with the same label: one chip, both sentences.
  return [...Map.groupBy(occasions, (occasion) => occasion.label)].map(([label, list]) => ({
    label,
    text: list.map((occasion) => occasion.text).join(' '),
  }));
}
