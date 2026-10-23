import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanChanges } from './scan-changes.mjs';

const row = (parkCode, arrival, priceCents, accommodationCode = 'A', provider = 'landal') => ({
  parkCode,
  parkName: `Park ${parkCode}`,
  provider,
  arrival,
  priceCents,
  accommodationCode,
});

test('tells repricing apart from another accommodation becoming the cheapest', () => {
  const previous = [row('HRK', '2026-11-13', 30000), row('KWW', '2026-11-13', 40000), row('MSA', '2026-11-13', 50000)];
  const current = [row('HRK', '2026-11-13', 27000), row('KWW', '2026-11-13', 35500, 'B'), row('MSA', '2026-11-13', 50000)];
  const changes = scanChanges(current, previous);
  assert.deepEqual(
    { compared: changes.compared, unchanged: changes.unchanged, up: changes.up, down: changes.down, swapped: changes.swapped },
    { compared: 3, unchanged: 1, up: 0, down: 1, swapped: 1 },
  );
  assert.deepEqual(changes.biggest.map((move) => [move.parkCode, move.kind, move.accommodationCode]), [
    ['KWW', 'swapped', 'B'],
    ['HRK', 'repriced', 'A'],
  ]);
});

test('counts parks that became available or are no longer, on weekends both rounds measured', () => {
  const previous = [row('HRK', '2026-11-13', 30000), row('KWW', '2026-11-13', 40000), row('HRK', '2026-11-20', 30000)];
  // The round stopped before 20 November: that weekend is not compared.
  const current = [row('HRK', '2026-11-13', 30000), row('MSA', '2026-11-13', 50000)];
  const changes = scanChanges(current, previous);
  assert.equal(changes.appeared, 1);
  assert.equal(changes.gone, 1);
  assert.equal(changes.prices, 2);
});

test('a provider missing from one round is not counted as everything gone', () => {
  const previous = [row('HRK', '2026-11-13', 30000), row('topparken:1', '2026-11-13', 39000, null, 'topparken')];
  const current = [row('HRK', '2026-11-13', 30000)];
  assert.equal(scanChanges(current, previous).gone, 0);
});
