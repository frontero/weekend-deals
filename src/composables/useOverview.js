import { onUnmounted, ref } from 'vue';
import { groupKey, partyOf, seriesFor, STANDARD_PARTIES } from '../../shared/party.mjs';
import { request } from '../lib/api.js';

const POLL_WHILE_SCANNING_MS = 3000;
// Picks up scans that the server starts on its own.
const POLL_IDLE_MS = 60_000;
// The travel party is this browser's own: every viewer can set theirs without changing anyone else's.
const PARTY_STORAGE_KEY = 'weekend-deals:party';

function loadParty() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PARTY_STORAGE_KEY) ?? 'null');
    if (Number.isFinite(saved?.adults) && Number.isFinite(saved?.children)) return partyOf(saved);
  } catch {
    // Storage can be blocked or hold something unreadable; the app's default party is used then.
  }
  return null;
}

function storeParty(party) {
  try {
    window.localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify(party));
  } catch {
    // Without storage the party lasts until the page reloads.
  }
}

/** The list shows the prices of the party size that fits this party; they are ready ahead of time. */
const sizeQuery = (party) => `?${new URLSearchParams({ party: groupKey(seriesFor(party)) })}`;

export function useOverview() {
  const overview = ref(null);
  const failed = ref(false);
  let timer = null;
  let parks = [];
  // Which size's overview the parks belong to, and from when; undefined until the first load.
  let parksOf;
  // Until this browser chose one: 2 adults, the most common party.
  let party = loadParty() ?? STANDARD_PARTIES[0];

  async function load() {
    clearTimeout(timer);
    try {
      const status = await request(`/status${sizeQuery(party)}`);
      // The park list is large and only changes after a round, so it is fetched again only then.
      const current = `${status.shownParty}|${status.overviewAt}`;
      if (current !== parksOf) {
        parks = status.shownParty ? await request(`/overview?party=${encodeURIComponent(status.shownParty)}`) : [];
        parksOf = current;
      }
      overview.value = {
        ...status,
        settings: { ...status.settings, ...party },
        // Only a size added since the last round has no prices yet.
        partyPending: !status.shownParty,
        // The party size the list's prices are for; the park panel asks the exact party's price live.
        pricedFor: seriesFor(party),
        parks,
      };
      failed.value = false;
    } catch {
      failed.value = true;
    }
    timer = setTimeout(load, overview.value?.scan.running ? POLL_WHILE_SCANNING_MS : POLL_IDLE_MS);
  }

  async function startScan() {
    await request(`/scan${sizeQuery(party)}`, { method: 'POST' });
    await load();
  }

  /** The travel party and requirements are this viewer's; how far ahead and how often are shared. */
  async function saveSettings(settings) {
    party = partyOf(settings);
    storeParty(party);
    const shared = overview.value?.settings;
    if (settings.weeksAhead !== shared?.weeksAhead || settings.rounds !== shared?.rounds) {
      const { weeksAhead, rounds } = settings;
      await request('/settings', { method: 'PUT', body: JSON.stringify({ weeksAhead, rounds }) });
    }
    await load();
  }

  onUnmounted(() => clearTimeout(timer));
  load();

  return { overview, failed, startScan, saveSettings };
}
