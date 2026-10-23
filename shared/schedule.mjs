// When price rounds run: right after Landal's morning price update (measured between 06:00 and 06:30), and again in
// the evening for what got booked during the day. Times are local time on the Mac, which runs the rounds.

export const ROUND_SCHEDULES = {
  'twice-daily': { label: 'Elke ochtend en avond (06:45 en 18:00)', times: ['06:45', '18:00'] },
  daily: { label: 'Elke ochtend (06:45)', times: ['06:45'] },
  manual: { label: 'Alleen met de knop', times: [] },
};

export const DEFAULT_SCHEDULE = 'twice-daily';

/** The latest scheduled round at or before `now`, today or yesterday; null when rounds only run on request. */
export function lastScheduledRound(schedule, now = new Date()) {
  let latest = null;
  for (const daysBack of [0, 1]) {
    for (const time of ROUND_SCHEDULES[schedule]?.times ?? []) {
      const [hours, minutes] = time.split(':').map(Number);
      const at = new Date(now);
      at.setDate(at.getDate() - daysBack);
      at.setHours(hours, minutes, 0, 0);
      if (at <= now && (!latest || at > latest)) latest = at;
    }
  }
  return latest;
}

/** The next scheduled round after `now`, today or tomorrow; null when rounds only run on request. */
export function nextScheduledRound(schedule, now = new Date()) {
  let next = null;
  for (const daysAhead of [0, 1]) {
    for (const time of ROUND_SCHEDULES[schedule]?.times ?? []) {
      const [hours, minutes] = time.split(':').map(Number);
      const at = new Date(now);
      at.setDate(at.getDate() + daysAhead);
      at.setHours(hours, minutes, 0, 0);
      if (at > now && (!next || at < next)) next = at;
    }
  }
  return next;
}
