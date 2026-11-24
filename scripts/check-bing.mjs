// Checks that Bing Webmaster Tools accepts the API key and knows the site. Prints counts only, never the key.
// Usage: node --env-file=.env.local scripts/check-bing.mjs
import { updateBing } from '../server/bing.mjs';

try {
  if (!process.env.BING_WEBMASTER_API_KEY) throw new Error('BING_WEBMASTER_API_KEY is not set');
  let state;
  const failed = [];
  await updateBing({ bing: async () => null, saveBing: async (next) => (state = next) }, process.env.BING_WEBMASTER_API_KEY, { log: (line) => failed.push(line) });
  if (!state) throw new Error(failed.join('; ') || 'Bing gaf niets terug');
  const shown = state.days.reduce((sum, row) => sum + row.impressions, 0);
  console.log(`ok: ${shown} keer getoond in ${state.periodDays} dagen, ${state.queries.length} zoekwoorden, ${state.crawl?.inIndex ?? 0} pagina's opgenomen${failed.length ? ` (niet gelukt: ${failed.join('; ')})` : ''}`);
} catch (error) {
  console.error(`mislukt: ${error.message}`);
  process.exit(1);
}
