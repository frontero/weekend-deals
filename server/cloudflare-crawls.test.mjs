import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchGooglebotCrawls } from './cloudflare-crawls.mjs';

const userAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const sample = (overrides) => ({
  dimensions: {
    clientIP: '192.0.2.1',
    clientRequestPath: '/land/duitsland',
    datetime: '2026-11-27T13:00:00Z',
    edgeResponseStatus: 200,
    userAgent,
    ...overrides,
  },
});

test('uses the latest verified Googlebot edge response and skips inspection, spoofed bots and other paths', async () => {
  const rows = [
    sample(),
    sample({ clientIP: '2001:db8::23', datetime: '2026-11-27T13:01:00Z', edgeResponseStatus: 503 }),
    sample({ datetime: '2026-11-27T13:01:00Z', edgeResponseStatus: 200 }),
    sample({ clientIP: '198.51.100.2', datetime: '2026-11-27T13:02:00Z' }),
    sample({ datetime: '2026-11-27T13:03:00Z', userAgent: 'Google-InspectionTool/1.0' }),
    sample({ clientRequestPath: '/cijfers', datetime: '2026-11-27T13:04:00Z' }),
  ];
  const send = async (url, options) => {
    if (url.endsWith('/graphql')) {
      return Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: rows }] } } });
    }
    assert.equal(options.headers, undefined);
    return Response.json({ prefixes: [{ ipv4Prefix: '192.0.2.0/24' }, { ipv6Prefix: '2001:db8::/32' }] });
  };
  assert.deepEqual(await fetchGooglebotCrawls({ token: 'test', zone: 'test', send }), [
    { path: '/land/duitsland', visitedAt: '2026-11-27T13:01:00.000Z', status: 503 },
  ]);
});
