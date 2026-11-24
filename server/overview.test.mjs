import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { groupKey, STANDARD_PARTIES } from '../shared/party.mjs';
import { localToday, upcomingWeekends } from '../shared/weekends.mjs';
import { connectFile } from './connect.mjs';
import { openDatabase } from './db.mjs';
import { buildOverview } from './overview.mjs';

const directory = mkdtempSync(join(tmpdir(), 'weekend-deals-overview-'));
after(() => rmSync(directory, { recursive: true, force: true }));

test('the price list the app downloads carries what it shows, not the figures only the advice needed', async () => {
  const db = await openDatabase(connectFile(join(directory, 'overview.db')).client);
  const party = STANDARD_PARTIES[0];
  const [weekend] = upcomingWeekends(localToday(), 2).slice(1);
  const scanId = await db.startScan(groupKey(party));
  await db.savePrices(scanId, weekend, [{ park: { code: 'GPN', provider: 'landal', name: 'Vakantiepark Gulpen', country: 'NL' }, priceCents: 30000, accommodationCode: '4C' }]);
  await db.finishScan(scanId);

  const { parks } = await buildOverview(db, { googleEnabled: false, party });
  const [shown] = parks[0].weekends;
  assert.deepEqual(Object.keys(shown).sort(), ['accommodationCode', 'advice', 'arrival', 'bookingUrl', 'departure', 'discount', 'highestCents', 'observedAt', 'priceCents', 'weather']);
  assert.equal(shown.priceCents, 30000);
  assert.ok(shown.advice.verdict, 'the advice itself is worked out from the full figures');
  db.close();
});
