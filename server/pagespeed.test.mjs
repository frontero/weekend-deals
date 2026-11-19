import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageSpeed, samplePaths, updatePageSpeed } from './pagespeed.mjs';

const audit = (id, score, title, numericValue) => ({ id, score, title, numericValue });
const answer = (performance) =>
  Response.json({
    lighthouseResult: {
      categories: {
        performance: { score: performance, auditRefs: [{ id: 'largest-contentful-paint', weight: 25 }, { id: 'total-blocking-time', weight: 30 }, { id: 'cumulative-layout-shift', weight: 25 }] },
        seo: { score: 0.92, auditRefs: [{ id: 'meta-description', weight: 1 }, { id: 'tap-targets', weight: 0 }] },
        accessibility: { score: 1, auditRefs: [] },
        'best-practices': { score: 0.96, auditRefs: [] },
      },
      audits: {
        'largest-contentful-paint': audit('largest-contentful-paint', 0.4, 'Grootste weergave duurt lang', 3412.4),
        'total-blocking-time': audit('total-blocking-time', 1, 'Blokkeertijd', 12),
        'cumulative-layout-shift': audit('cumulative-layout-shift', 1, 'Verschuiving', 0.0312),
        'meta-description': audit('meta-description', 0, 'Document heeft geen metabeschrijving'),
        'tap-targets': audit('tap-targets', 0, 'Telt niet mee'),
      },
    },
  });

test('reads a page the way a phone loads it: scores, timings and what is marked down, worst first', async () => {
  const calls = [];
  const result = await pageSpeed('https://parkjeweg.nl/parken', 'key-1', { fetcher: async (url) => (calls.push(url), answer(0.71)) });
  assert.deepEqual(result, { performance: 71, seo: 92, accessibility: 100, bestPractices: 96, paintMs: 3412, blockedMs: 12, shift: 0.031, markedDown: ['Document heeft geen metabeschrijving', 'Grootste weergave duurt lang'] });
  const asked = new URL(calls[0]).searchParams;
  assert.equal(asked.get('strategy'), 'mobile');
  assert.deepEqual(asked.getAll('category'), ['performance', 'seo', 'accessibility', 'best-practices']);
  await assert.rejects(pageSpeed('https://parkjeweg.nl/', 'bad', { fetcher: async () => Response.json({ error: { message: 'API key not valid' } }, { status: 400 }) }), /400: API key not valid/);
});

test('a daily check looks at the app and one page of each kind, once a day, and keeps the last one when Google refuses', async () => {
  assert.deepEqual(samplePaths(['/park/a', '/park/b', '/parken', '/weekend/2026-12-04', '/feestdag/kerst', '/feestdag/pasen']), ['/', '/park/a', '/parken', '/weekend/2026-12-04', '/feestdag/kerst']);
  let saved = null;
  const db = { pageSpeed: async () => saved, savePageSpeed: async (state) => (saved = state), pagePaths: async () => [{ path: '/park/a' }, { path: '/parken' }] };
  const now = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(await updatePageSpeed(db, 'key', { fetcher: async () => answer(0.8), now }), 3);
  assert.deepEqual(saved.pages.map((page) => [page.path, page.performance]), [['/', 80], ['/park/a', 80], ['/parken', 80]]);
  assert.deepEqual(saved.history, [{ day: '2026-11-19', performance: 80 }]);
  assert.equal(await updatePageSpeed(db, 'key', { fetcher: async () => answer(0.5), now: now + 60 * 60 * 1000 }), null, 'not due within the day');
  assert.equal(await updatePageSpeed(db, 'key', { fetcher: async () => Response.json({}, { status: 429 }), now: now + 24 * 60 * 60 * 1000 }), 0);
  assert.equal(saved.pages.length, 3, 'the last check stays');
  assert.equal(await updatePageSpeed(db, 'key', { fetcher: async () => answer(0.6), now: now + 24 * 60 * 60 * 1000 }), 3);
  assert.deepEqual(saved.history, [{ day: '2026-11-19', performance: 80 }, { day: '2026-11-20', performance: 60 }]);
});
