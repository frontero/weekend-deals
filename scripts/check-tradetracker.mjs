// Checks that TradeTracker's web service accepts the account's key. Prints counts only, never the key.
// Usage: node --env-file=.env.local scripts/check-tradetracker.mjs
import { affiliateSites, conversions, signIn, tradeTrackerAccount } from '../server/tradetracker.mjs';

try {
  const account = tradeTrackerAccount();
  if (!account) throw new Error('TRADETRACKER_CUSTOMER_ID or TRADETRACKER_PASSPHRASE is not set');
  const session = await signIn(account);
  const sites = await affiliateSites(session);
  if (!sites.length) throw new Error('het account heeft geen site');
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  let bookings = 0;
  for (const site of sites) bookings += (await conversions(session, site.id, since)).length;
  console.log(`ok: ${sites.map((site) => site.name).join(', ')}; ${bookings} boekingen in de laatste 180 dagen`);
} catch (error) {
  console.error(`mislukt: ${error.message}`);
  process.exit(1);
}
