import { gunzipSync } from 'node:zlib';
import { groupKey, parseGroupKey, seriesFor } from '../shared/party.mjs';
import { searchDeals } from '../src/lib/deals.js';
import { alertMessage, dealRows, newOrCheaper, sendNotification } from './alerts.mjs';

/**
 * After a round: each alert runs its search on its party's latest prices and sends one message with the deals it
 * did not tell about yet, or that got clearly cheaper. An alert set while its party had no prices of its own yet
 * first takes in what matches, without a message. Never throws: a failing alert or phone is only logged.
 */
export async function checkAlerts(db, { appUrl = null, send = sendNotification, log = () => {} } = {}) {
  const parksByParty = new Map();
  async function parksOf(key) {
    if (!parksByParty.has(key)) {
      const blob = await db.overviewParks(key);
      parksByParty.set(key, blob ? JSON.parse(gunzipSync(Buffer.from(blob)).toString()) : null);
    }
    return parksByParty.get(key);
  }

  for (const alert of await db.alerts()) {
    try {
      // Alerts set before there were fixed sizes name their exact party; they watch its size now.
      const party = parseGroupKey(alert.partyKey);
      const parks = await parksOf(party ? groupKey(seriesFor(party)) : alert.partyKey);
      if (!parks) continue;
      const deals = searchDeals(parks, alert.search);
      if (!alert.primed) {
        await db.recordDeliveries(alert.id, dealRows(deals));
        continue;
      }
      const news = newOrCheaper(deals, await db.alertDeliveries(alert.id));
      if (!news.length) continue;
      await send(alert.topic, alertMessage(alert, news, appUrl));
      await db.recordDeliveries(alert.id, dealRows(news));
      log(`alert "${alert.label}": ${news.length} deals sent`);
    } catch (error) {
      log(`alert "${alert.label}" failed: ${error.message}`);
    }
  }
}
