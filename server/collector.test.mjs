import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCollector } from './collector.mjs';
import { DEFAULT_SETTINGS } from './settings.mjs';

const party = { adults: 2, children: 0, pets: 0, accommodationFeatures: [] };
const followed = (lastStartedAt, collected = Boolean(lastStartedAt), lastSucceededAt = collected ? lastStartedAt : null) => ({
  key: 'a2-c0',
  party,
  standard: true,
  lastStartedAt,
  lastSucceededAt,
  collected,
});

const fakeDb = ({ requestedAt = null, startedAt = null, elsewhere = null, parties = [followed(startedAt)], attempts = {} } = {}) => {
  const saved = [];
  return {
    saved,
    getSettings: async () => DEFAULT_SETTINGS,
    scanStartsSince: async () => attempts,
    scanRequestedAt: async () => requestedAt,
    followedParties: async () => parties,
    collectorStatus: async () => elsewhere,
    saveCollectorStatus: async (status) => saved.push(status),
  };
};

test('waits while the app or the background job is already collecting', async () => {
  const now = new Date().toISOString();
  const elsewhere = { running: true, phase: 'prices', heartbeatAt: now };
  assert.equal(await createCollector(fakeDb({ requestedAt: now, elsewhere })).isDue(), false);
});

test('a round is due when the cloud app asked for one, even right after the last one', async () => {
  const justNow = new Date().toISOString();
  assert.equal(await createCollector(fakeDb({ startedAt: justNow })).isDue(), false);
  assert.equal(await createCollector(fakeDb({ startedAt: justNow, requestedAt: justNow })).isDue(), true);
});

test('a round is due once the "every … hours" setting has passed', async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(await createCollector(fakeDb({ startedAt: yesterday })).isDue(), true);
});

test('a newly chosen party is due right away, also when the others were collected just now', async () => {
  const justNow = new Date().toISOString();
  const parties = [followed(justNow), { ...followed(null), key: 'a4-c2', standard: false }];
  assert.equal(await createCollector(fakeDb({ parties })).isDue(), true);
});

test('a size whose round failed or was interrupted is tried again, every half hour and three times at most', async () => {
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const failed = (startedAt) => followed(startedAt, true, minutesAgo(48 * 60));
  // Just stopped: not right away.
  assert.equal(await createCollector(fakeDb({ parties: [failed(minutesAgo(5))], attempts: { 'a2-c0': 1 } })).isDue(), false);
  // Half an hour later it may try again; an interrupted round that never finished counts the same.
  assert.equal(await createCollector(fakeDb({ parties: [failed(minutesAgo(35))], attempts: { 'a2-c0': 1 } })).isDue(), true);
  assert.equal(await createCollector(fakeDb({ parties: [followed(minutesAgo(35), false)], attempts: { 'a2-c0': 1 } })).isDue(), true);
  // After three tries it waits for the next scheduled round.
  assert.equal(await createCollector(fakeDb({ parties: [failed(minutesAgo(35))], attempts: { 'a2-c0': 3 } })).isDue(), false);
});

test('stopping mid-round leaves "interrupted" for other screens instead of a round that seems to go on', async () => {
  const db = fakeDb();
  const collector = createCollector(db);
  Object.assign(collector.progress, { running: true, phase: 'prices', done: 25, total: 48 });

  await collector.cancel();
  assert.equal(db.saved.length, 1);
  assert.equal(db.saved[0].running, false);
  assert.equal(db.saved[0].error, 'Round interrupted');

  await collector.cancel();
  assert.equal(db.saved.length, 1);
});
