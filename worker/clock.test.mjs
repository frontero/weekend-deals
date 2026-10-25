import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startWorkflows } from './clock.mjs';

test('asks GitHub to run the rounds and the price watch', async () => {
  const sent = [];
  const send = async (url, options) => {
    sent.push({ url, options });
    return new Response(null, { status: 204 });
  };
  const env = { GITHUB_REPOSITORY: 'frontero/weekend-deals', GITHUB_DISPATCH_TOKEN: 'token' };
  const results = await startWorkflows(env, { send });

  assert.deepEqual(results, [{ workflow: 'rounds.yml', status: 204 }, { workflow: 'watch.yml', status: 204 }]);
  assert.equal(sent[0].url, 'https://api.github.com/repos/frontero/weekend-deals/actions/workflows/rounds.yml/dispatches');
  assert.equal(sent[0].options.method, 'POST');
  assert.equal(sent[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(sent[0].options.body), { ref: 'main' });
});

test('does nothing until the token is set, and reports what GitHub refused', async () => {
  assert.deepEqual(await startWorkflows({ GITHUB_REPOSITORY: 'frontero/weekend-deals' }, { send: () => assert.fail() }), []);

  const logged = [];
  const env = { GITHUB_REPOSITORY: 'frontero/weekend-deals', GITHUB_DISPATCH_TOKEN: 'expired' };
  const results = await startWorkflows(env, { send: async () => new Response('', { status: 401 }), log: (line) => logged.push(line) });
  assert.deepEqual(results.map((result) => result.status), [401, 401]);
  assert.deepEqual(logged, ['rounds.yml: GitHub answered 401', 'watch.yml: GitHub answered 401']);
});
