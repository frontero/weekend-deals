import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reasonText, verdictLabel } from './advice.js';

test('names the verdicts', () => {
  assert.equal(verdictLabel('book'), 'Nu boeken');
  assert.equal(verdictLabel('wait'), 'Wachten kan');
  assert.equal(verdictLabel('neutral'), 'Geen duidelijk advies');
});

test('explains each reason in plain Dutch', () => {
  assert.equal(reasonText({ code: 'rising', share: 0.1, since: '2026-10-28T08:00:00Z' }), 'De prijs steeg 10% sinds 28 okt.');
  assert.equal(
    reasonText({ code: 'falling', share: 0.08, since: '2026-10-28T08:00:00Z', daysLeft: 40 }),
    'De prijs daalde 8% sinds 28 okt; er zijn nog 5 weken tot vertrek.',
  );
  assert.equal(reasonText({ code: 'falling', share: 0.08, since: '2026-10-28T08:00:00Z', daysLeft: 10 }), 'De prijs daalde 8% sinds 28 okt.');
  assert.equal(
    reasonText({ code: 'selling-out', share: 0.25, since: '2026-10-22T08:00:00Z' }),
    'Dit weekend raakt vol: 25% minder parken beschikbaar dan op 22 okt.',
  );
  assert.equal(reasonText({ code: 'leaving-soon', days: 5 }), 'Vertrek over 5 dagen: wachten levert weinig op en het huisje kan weg zijn.');
  assert.equal(reasonText({ code: 'leaving-soon', days: 1 }), 'Vertrek is morgen: wachten levert niets meer op.');
  assert.equal(reasonText({ code: 'lowest-yet', since: '2026-10-22T08:00:00Z' }), 'Laagste prijs sinds we dit weekend volgen (22 okt).');
  assert.equal(
    reasonText({ code: 'too-new', since: '2026-10-22T08:00:00Z' }),
    'We volgen dit weekend pas sinds 22 okt; het advies volgt na een paar dagen meten.',
  );
});
