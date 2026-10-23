import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampSettings, groupKey } from './settings.mjs';

test('the price series key stays the same for a party without pets or accommodation features', () => {
  assert.equal(groupKey({ adults: 2, children: 0, pets: 0, accommodationFeatures: [] }), 'a2-c0');
});

test('pets and accommodation features get their own price series, independent of tick order', () => {
  const key = groupKey({ adults: 2, children: 2, pets: 1, accommodationFeatures: ['9266.16402', '9266.16393'] });
  assert.equal(key, 'a2-c2-p1-f9266.16393+9266.16402');
});

test('clamps numbers and keeps only well-formed, unique features', () => {
  const settings = clampSettings({
    adults: 40,
    children: -1,
    pets: 2,
    accommodationFeatures: ['9266.16393', '9266.16393', 'drop table', 7, '9290.16337'],
  });
  assert.equal(settings.adults, 12);
  assert.equal(settings.children, 0);
  assert.equal(settings.pets, 2);
  assert.deepEqual(settings.accommodationFeatures, ['9266.16393', '9290.16337']);
});

test('fills in defaults for settings saved before pets and features existed', () => {
  const settings = clampSettings({ adults: 2, children: 2, weeksAhead: 16, autoScanHours: 12 });
  assert.equal(settings.pets, 0);
  assert.deepEqual(settings.accommodationFeatures, []);
});

test('turns the old "every … hours" setting into a round schedule', () => {
  assert.equal(clampSettings({ autoScanHours: 12 }).rounds, 'twice-daily');
  assert.equal(clampSettings({ autoScanHours: 24 }).rounds, 'daily');
  assert.equal(clampSettings({ autoScanHours: 0 }).rounds, 'manual');
  assert.equal(clampSettings({ rounds: 'daily', autoScanHours: 0 }).rounds, 'daily');
  assert.equal(clampSettings({ rounds: 'hourly' }).rounds, 'twice-daily');
  assert.equal('autoScanHours' in clampSettings({ autoScanHours: 6 }), false);
});
