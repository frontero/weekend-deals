import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MISSED_REQUEST, scanStatus, statusBody } from './status.mjs';

const now = Date.parse('2026-10-22T12:00:00Z');
const minutesAgo = (minutes) => new Date(now - minutes * 60 * 1000).toISOString();

test('shows a round in this process before anything stored', () => {
  const live = { running: true, phase: 'prices', done: 3, total: 48, startedAt: minutesAgo(1), error: null };
  assert.deepEqual(scanStatus({ collector: null, scanRequestedAt: null, live, now }), live);
});

test('shows a round in another process while it keeps reporting', () => {
  const collector = { running: true, phase: 'ratings', done: 5, total: 20, startedAt: minutesAgo(8), error: null };
  assert.equal(scanStatus({ collector: { ...collector, heartbeatAt: minutesAgo(1) }, now }).phase, 'ratings');
  assert.equal(scanStatus({ collector: { ...collector, heartbeatAt: minutesAgo(30) }, now }).running, false);
});

test('a requested round counts as running until the Mac should have picked it up', () => {
  assert.equal(scanStatus({ collector: null, scanRequestedAt: minutesAgo(5), now }).running, true);
  const missed = scanStatus({ collector: null, scanRequestedAt: minutesAgo(45), now });
  assert.equal(missed.running, false);
  assert.equal(missed.error, MISSED_REQUEST);
});

test('after a round, tells its error', () => {
  const collector = { running: false, phase: null, startedAt: minutesAgo(20), error: 'landal.nl answered 503', heartbeatAt: minutesAgo(15) };
  assert.equal(scanStatus({ collector, scanRequestedAt: null, now }).error, 'landal.nl answered 503');
});

const meta = (groupKey, computedAt) => ({
  groupKey,
  computedAt,
  meta: JSON.stringify({ providers: [{ id: 'landal' }], facilityGroups: [{ name: groupKey }], lastScan: { finishedAt: computedAt } }),
});

test('takes the overview of the current settings', () => {
  const body = statusBody(
    { settings: { adults: 2, children: 0 }, collector: null, scanRequestedAt: null, overviews: [meta('a2-c2', 'b'), meta('a2-c0', 'a')] },
    { now },
  );
  assert.equal(body.overviewAt, 'a');
  assert.deepEqual(body.facilityGroups, [{ name: 'a2-c0' }]);
  assert.deepEqual(body.scan.lastScan, { finishedAt: 'a' });
});

test('new settings keep the filters of another overview but show no prices or last round yet', () => {
  const body = statusBody(
    { settings: { adults: 4, children: 0 }, collector: null, scanRequestedAt: null, overviews: [meta('a2-c0', 'a')] },
    { now },
  );
  assert.equal(body.overviewAt, null);
  assert.deepEqual(body.providers, [{ id: 'landal' }]);
  assert.equal(body.scan.lastScan, null);
});

test('takes the first party in the request that has an overview, and says which one', () => {
  const inputs = { settings: { adults: 2, children: 0 }, collector: null, scanRequestedAt: null, overviews: [meta('a6-c0', 'a')] };
  const standIn = statusBody(inputs, { now, parties: ['a4-c2', 'a6-c0'] });
  assert.equal(standIn.shownParty, 'a6-c0');
  assert.equal(standIn.overviewAt, 'a');

  const own = statusBody({ ...inputs, overviews: [meta('a6-c0', 'a'), meta('a4-c2', 'b')] }, { now, parties: ['a4-c2', 'a6-c0'] });
  assert.equal(own.shownParty, 'a4-c2');
});

test('works before the first round ever', () => {
  const body = statusBody({ settings: { adults: 2, children: 0 }, collector: null, scanRequestedAt: null, overviews: [] }, { now });
  assert.deepEqual(body.providers, []);
  assert.equal(body.google.enabled, false);
});
