import { reactive, watch } from 'vue';
import { readQuery, writeQuery } from '../lib/urlState.js';

/** Reactive state mirrored in the address bar, so a search survives a reload and can be bookmarked. */
export function useQueryState(defaults) {
  const state = reactive(readQuery(window.location.search, defaults));

  watch(
    () => writeQuery(state, defaults),
    (query) => {
      window.history.replaceState(window.history.state, '', query ? `?${query}` : window.location.pathname);
    },
  );

  function reset(keys = Object.keys(defaults)) {
    for (const key of keys) {
      state[key] = Array.isArray(defaults[key]) ? [...defaults[key]] : defaults[key];
    }
  }

  return { state, reset };
}
