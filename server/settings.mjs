import { DEFAULT_SCHEDULE, ROUND_SCHEDULES } from '../shared/schedule.mjs';

export const DEFAULT_SETTINGS = {
  adults: 2,
  children: 0,
  pets: 0,
  weeksAhead: 16,
  rounds: DEFAULT_SCHEDULE,
  accommodationFeatures: [],
};

// Settings from before fixed round times said every how many hours; 0 meant only on request.
const scheduleFromHours = (hours) => (Number(hours) === 0 ? 'manual' : Number(hours) >= 24 ? 'daily' : DEFAULT_SCHEDULE);

const NUMBER_LIMITS = {
  adults: [1, 12],
  children: [0, 10],
  pets: [0, 3],
  weeksAhead: [4, 26],
};

const FACILITY_ID = /^\d+\.\d+$/;
const MAX_ACCOMMODATION_FEATURES = 10;

export function clampSettings(input) {
  const settings = { ...DEFAULT_SETTINGS, accommodationFeatures: [] };

  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS)) {
    const value = Math.round(Number(input?.[key]));
    if (Number.isFinite(value)) settings[key] = Math.min(max, Math.max(min, value));
  }

  if (Object.hasOwn(ROUND_SCHEDULES, input?.rounds ?? '')) settings.rounds = input.rounds;
  else if (input?.autoScanHours !== undefined) settings.rounds = scheduleFromHours(input.autoScanHours);

  if (Array.isArray(input?.accommodationFeatures)) {
    const valid = input.accommodationFeatures.filter((id) => typeof id === 'string' && FACILITY_ID.test(id));
    settings.accommodationFeatures = [...new Set(valid)].sort().slice(0, MAX_ACCOMMODATION_FEATURES);
  }

  return settings;
}

export { groupKey } from '../shared/party.mjs';
