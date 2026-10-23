import { groupKey } from './settings.mjs';

// A round reports at least this often; a process that stopped reporting has died mid-round.
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;
// The background job on the Mac looks every ten minutes; after this long it is off, asleep or failing.
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
export const MISSED_REQUEST =
  'Ophalen aangevraagd, maar je Mac heeft het niet opgepakt. Staat hij aan, met de achtergrondtaak aan?';

const IDLE = { running: false, phase: null, done: 0, total: 0, startedAt: null, error: null };
const EMPTY_META = {
  google: { enabled: false, error: null },
  providers: [],
  facilityGroups: [],
  accommodationGroups: [],
};

/** @param collector the progress a collecting process last wrote down */
export const roundInProgress = (collector, now = Date.now()) =>
  Boolean(collector?.running) && now - Date.parse(collector.heartbeatAt) < HEARTBEAT_STALE_MS;

/**
 * Where the price round stands, from what the collecting process last wrote down.
 * @param live the progress of a round in this very process, which is fresher than the stored one
 */
export function scanStatus({ collector, scanRequestedAt, live = null, now = Date.now() }) {
  if (live?.running) return { ...IDLE, ...live };
  if (roundInProgress(collector, now)) {
    const { heartbeatAt, ...progress } = collector;
    return { ...IDLE, ...progress };
  }
  if (scanRequestedAt) {
    // Shown as running, so the screen keeps checking until the Mac has picked it up.
    if (now - Date.parse(scanRequestedAt) < REQUEST_TIMEOUT_MS) {
      return { ...IDLE, running: true, phase: 'requested', startedAt: scanRequestedAt };
    }
    return { ...IDLE, error: MISSED_REQUEST };
  }
  return { ...IDLE, startedAt: collector?.startedAt ?? null, error: collector?.error ?? null };
}

/**
 * Settings, round status and everything on screen except the park list, which is large and fetched separately
 * (only when `overviewAt` changed).
 * @param parties group keys in order of preference: the viewer's party, then the standard party that stands in
 *   until it has prices of its own. `shownParty` tells which one the overview is of.
 */
export function statusBody(
  { settings, collector, scanRequestedAt, overviews },
  { live = null, now = Date.now(), parties = [groupKey(settings)] } = {},
) {
  const shown = parties.map((key) => overviews.find((overview) => overview.groupKey === key)).find(Boolean);
  // A new party has no overview until its first round; the filters of another one still apply.
  const { lastScan = null, ...meta } = JSON.parse((shown ?? overviews[0])?.meta ?? JSON.stringify(EMPTY_META));
  return {
    settings,
    scan: { ...scanStatus({ collector, scanRequestedAt, live, now }), lastScan: shown ? lastScan : null },
    overviewAt: shown?.computedAt ?? null,
    shownParty: shown?.groupKey ?? null,
    ...meta,
  };
}
