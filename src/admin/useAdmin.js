import { computed, ref, watch } from 'vue';
import { groupKey, STANDARD_PARTIES } from '../../shared/party.mjs';

// The admin pages' shared data: the rounds and status (/api/admin) and the charts of the chosen party size
// (/api/admin/stats). One copy for all pages, so switching pages shows what was loaded already.

const POLL_WHILE_SCANNING_MS = 5000;
const POLL_IDLE_MS = 60_000;
const SIZE_STORAGE_KEY = 'weekend-deals:admin-size';
const RANGE_STORAGE_KEY = 'weekend-deals:admin-range';

export const SIZES = STANDARD_PARTIES.map((party) => ({ key: groupKey(party), persons: party.adults }));
export const RANGES = [
  { days: 7, label: '7 dagen' },
  { days: 30, label: '30 dagen' },
  { days: 90, label: '90 dagen' },
];

function stored(key, fallback, valid) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null && valid(value)) return value;
  } catch {
    // Storage can be blocked; the default applies then.
  }
  return fallback;
}

function store(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}

const size = ref(stored(SIZE_STORAGE_KEY, SIZES[0].key, (value) => SIZES.some((item) => item.key === value)));
const range = ref(Number(stored(RANGE_STORAGE_KEY, '30', (value) => RANGES.some((item) => String(item.days) === value))));
const admin = ref(null);
// loading, forbidden, failed or ready
const state = ref('loading');
const stats = ref(null);
// loading, missing (not computed yet), failed or ready
const statsState = ref('loading');
let timer = null;
let started = false;
let statsFor = null;

watch(size, (value) => store(SIZE_STORAGE_KEY, value));
watch(range, (value) => store(RANGE_STORAGE_KEY, value));

async function loadStats() {
  const key = size.value;
  // Recomputed after each round: fetch again when a round finished or the size changed.
  const version = `${key}|${admin.value?.history?.find((round) => round.finishedAt)?.finishedAt}`;
  if (version === statsFor) return;
  if (stats.value?.groupKey !== key) statsState.value = 'loading';
  try {
    const response = await fetch(`/api/admin/stats?party=${encodeURIComponent(key)}`);
    if (key !== size.value) return;
    if (response.status === 404) {
      stats.value = null;
      statsState.value = 'missing';
    } else if (!response.ok) {
      throw new Error(`Admin stats failed with ${response.status}`);
    } else {
      stats.value = await response.json();
      statsState.value = 'ready';
    }
    statsFor = version;
  } catch {
    if (!stats.value) statsState.value = 'failed';
  }
}

async function load() {
  clearTimeout(timer);
  try {
    const response = await fetch('/api/admin');
    if (response.status === 403) {
      state.value = 'forbidden';
      return;
    }
    if (!response.ok) throw new Error(`Admin data failed with ${response.status}`);
    admin.value = await response.json();
    state.value = 'ready';
    await loadStats();
  } catch {
    // Data loaded before stays on screen; the next poll tries again.
    if (!admin.value) state.value = 'failed';
  }
  timer = setTimeout(load, admin.value?.scan.running ? POLL_WHILE_SCANNING_MS : POLL_IDLE_MS);
}

watch(size, () => {
  if (state.value === 'ready') loadStats();
});

export function useAdmin() {
  if (!started) {
    started = true;
    load();
  }
  const sizeLabel = computed(() => `${SIZES.find((item) => item.key === size.value)?.persons ?? ''} personen`);
  return { size, sizeLabel, range, admin, state, stats, statsState, reload: load };
}
