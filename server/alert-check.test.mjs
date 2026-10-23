import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { after, test } from 'node:test';
import { checkAlerts } from './alert-check.mjs';
import { connectFile } from './connect.mjs';
import { openDatabase } from './db.mjs';

const directory = mkdtempSync(join(tmpdir(), 'weekend-deals-alerts-'));
after(() => rmSync(directory, { recursive: true, force: true }));

const TOPIC = 'weekendjeweg-abcdefghijklmnop';
const park = (code, priceCents) => ({
  code,
  name: `Park ${code}`,
  weekends: [{ arrival: '2026-11-13', departure: '2026-11-16', priceCents, discount: 0.3 }],
});
const saveParks = (db, parks) => db.saveOverview('a2-c0', { computedAt: new Date().toISOString(), meta: '{}', parks: gzipSync(JSON.stringify(parks)) });
const alert = (id, primed) => ({ id, topic: TOPIC, partyKey: 'a2-c0', search: { minDiscountPercent: 20 }, query: '', label: 'Alles', primed });

test('an alert tells only about what is new since it was set, and about clear price drops', async () => {
  const db = await openDatabase(connectFile(join(directory, 'primed.db')).client);
  const sent = [];
  const send = async (topic, message) => sent.push({ topic, message });

  await saveParks(db, [park('A', 40000)]);
  await db.saveAlert(alert('one', true), [{ parkCode: 'A', arrival: '2026-11-13', priceCents: 40000 }]);
  await checkAlerts(db, { send });
  assert.equal(sent.length, 0);

  await saveParks(db, [park('A', 40000), park('B', 30000)]);
  await checkAlerts(db, { send });
  await checkAlerts(db, { send });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].topic, TOPIC);
  assert.equal(sent[0].message.title, 'Buitenkansje: Park B');

  await saveParks(db, [park('A', 35000), park('B', 30000)]);
  await checkAlerts(db, { send });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].message.title, 'Buitenkansje: Park A');
  db.close();
});

test('an alert set before its party had prices first takes in what matches, silently', async () => {
  const db = await openDatabase(connectFile(join(directory, 'unprimed.db')).client);
  const sent = [];
  await db.saveAlert(alert('two', false));
  await checkAlerts(db, { send: async (...message) => sent.push(message) });

  await saveParks(db, [park('A', 40000)]);
  await checkAlerts(db, { send: async (...message) => sent.push(message) });
  assert.equal(sent.length, 0);
  assert.equal((await db.alerts())[0].primed, true);

  await saveParks(db, [park('A', 40000), park('C', 20000)]);
  await checkAlerts(db, { send: async (...message) => sent.push(message) });
  assert.equal(sent.length, 1);
  db.close();
});
