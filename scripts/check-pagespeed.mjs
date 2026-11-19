// Checks that the PageSpeed key works with one page. Prints scores only, never the key.
// Usage: node --env-file=.env.local scripts/check-pagespeed.mjs
import { pageSpeed } from '../server/pagespeed.mjs';

try {
  if (!process.env.PAGESPEED_API_KEY) throw new Error('PAGESPEED_API_KEY is not set');
  const result = await pageSpeed('https://parkjeweg.nl/weekenden', process.env.PAGESPEED_API_KEY);
  console.log(`ok: snelheid ${result.performance}, SEO ${result.seo}, toegankelijk ${result.accessibility}, techniek ${result.bestPractices} (van 100)`);
} catch (error) {
  console.error(`mislukt: ${error.message}`);
  process.exit(1);
}
