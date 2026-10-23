import { reactive, watch } from 'vue';

const STORAGE_KEY = 'weekend-deals:home';

function load() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.origin && Number.isFinite(saved.origin.lat) && Number.isFinite(saved.origin.lng)) return saved;
  } catch {
    // Storage can be blocked or hold something unreadable; start without a home address then.
  }
  return { origin: null, maxDistanceKm: null };
}

/** The home address and search radius. Kept in this browser only: it is personal, so not in the URL. */
export function useHomeLocation() {
  const home = reactive(load());

  watch(
    () => JSON.stringify(home),
    (value) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        // Without storage the address just lasts until the page reloads.
      }
    },
  );

  return home;
}
