// The Dutch school holidays per region, from the government's open data (free to reuse).
import { fetchWithRetry } from './http.mjs';

const URL_BASE = 'https://opendata.rijksoverheid.nl/v1/infotypes/schoolholidays/schoolyear';

/** "2026-2027" for a date from August on, else the school year that started the year before. */
export function schoolYear(isoDate) {
  const year = Number(isoDate.slice(0, 4));
  const start = Number(isoDate.slice(5, 7)) >= 8 ? year : year - 1;
  return `${start}-${start + 1}`;
}

/** @returns [{ name, region, start, end }]; region "noord", "midden", "zuid" or "heel Nederland", dates inclusive */
export function parseSchoolHolidays(json) {
  return (json.content ?? []).flatMap((year) =>
    (year.vacations ?? []).flatMap((vacation) =>
      (vacation.regions ?? []).map((region) => ({
        name: vacation.type.trim(),
        region: region.region.trim(),
        start: region.startdate.slice(0, 10),
        // The end is the last day at 23:59 Dutch time, written in UTC: still that day.
        end: region.enddate.slice(0, 10),
      })),
    ),
  );
}

/** This school year's holidays and the next one's, which the weekends ahead can reach. */
export async function fetchSchoolHolidays(today) {
  const thisYear = schoolYear(today);
  const nextYear = schoolYear(`${Number(thisYear.slice(5))}-09-01`);
  const lists = await Promise.all(
    [thisYear, nextYear].map(async (year) => {
      // The next school year is published well ahead, but not always yet: then it is simply not known.
      try {
        const response = await fetchWithRetry(`${URL_BASE}/${year}?output=json`);
        return parseSchoolHolidays(await response.json());
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}
