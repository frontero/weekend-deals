import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withRetries } from './connect.mjs';

const capacity = new Error('SQLITE_UNKNOWN: Server database capacity temporarily exceeded, please try again later');

function flaky(failures, error = capacity) {
  let calls = 0;
  return {
    protocol: 'https',
    get calls() {
      return calls;
    },
    async execute(statement) {
      calls += 1;
      if (calls <= failures) throw error;
      return { rows: [statement] };
    },
    async batch() {
      return 'batched';
    },
  };
}

const noWait = { delays: [1, 1, 1], wait: async () => {} };

test('tries a request again when Turso is briefly over capacity or the connection drops', async () => {
  const client = flaky(2);
  const retried = withRetries(client, noWait);
  assert.deepEqual(await retried.execute('SELECT 1'), { rows: ['SELECT 1'] });
  assert.equal(client.calls, 3);
  assert.equal(retried.protocol, 'https');
  assert.equal(await retried.batch([]), 'batched');

  const reset = flaky(1, Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }));
  await withRetries(reset, noWait).execute('SELECT 1');
  assert.equal(reset.calls, 2);
});

test('gives up after the last pause, and at once on a real error', async () => {
  const busy = flaky(10);
  await assert.rejects(withRetries(busy, noWait).execute('SELECT 1'), /capacity/);
  assert.equal(busy.calls, 4);

  const broken = flaky(10, new Error('SQLITE_ERROR: no such table: nope'));
  await assert.rejects(withRetries(broken, noWait).execute('SELECT 1'), /no such table/);
  assert.equal(broken.calls, 1);
});
