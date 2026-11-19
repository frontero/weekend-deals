// Checks that the Search Console key works: signs in and asks for the last four weeks' totals. Prints counts only,
// never the key. Usage: node --env-file=.env.local scripts/check-search-console.mjs
import { accessToken, searchAnalytics, serviceAccount } from '../server/search-console.mjs';

const day = (daysBack) => new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

try {
  const account = serviceAccount();
  if (!account) throw new Error('GSC_SERVICE_ACCOUNT is not set');
  const token = await accessToken(account);
  const rows = await searchAnalytics(token, { startDate: day(30), endDate: day(2), dimensions: ['query'], rowLimit: 5000 });
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  console.log(`ok: ${rows.length} zoekwoorden, ${sum('impressions')} keer getoond, ${sum('clicks')} klikken in de laatste vier weken`);
} catch (error) {
  console.error(`mislukt: ${error.message}`);
  process.exit(1);
}
