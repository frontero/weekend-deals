import { computed, ref } from 'vue';

// Also read by the inline script in index.html, which applies the theme before the first paint.
const STORAGE_KEY = 'weekend-deals:theme';

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const prefersDark = ref(systemDark.matches);
systemDark.addEventListener('change', (event) => {
  prefersDark.value = event.matches;
});
// "light", "dark", or null to follow the system.
const chosen = ref(document.documentElement.dataset.theme ?? null);

/**
 * Light or dark. Follows the system until switched; switching back to what the system shows follows the system
 * again, so a later change of the system setting still comes through.
 */
export function useTheme() {
  const isDark = computed(() => (chosen.value ? chosen.value === 'dark' : prefersDark.value));

  function toggle() {
    const next = isDark.value ? 'light' : 'dark';
    chosen.value = next === (prefersDark.value ? 'dark' : 'light') ? null : next;
    if (chosen.value) document.documentElement.dataset.theme = chosen.value;
    else delete document.documentElement.dataset.theme;
    try {
      if (chosen.value) window.localStorage.setItem(STORAGE_KEY, chosen.value);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Without storage the choice just lasts until the page reloads.
    }
  }

  return { isDark, toggle };
}
