import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { accessToken, searchAnalytics, serviceAccount } from './search-console.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = { client_email: 'robot@project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

test('reads the service account from one base64 line, and tells when the key file is not one', () => {
  const env = { GSC_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString('base64') };
  assert.equal(serviceAccount(env).client_email, account.client_email);
  assert.equal(serviceAccount({}), null);
  assert.throws(() => serviceAccount({ GSC_SERVICE_ACCOUNT: Buffer.from('{}').toString('base64') }), /client_email/);
});

test('asks Google for a read-only token with a signed request, and Search Console with that token', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return url.includes('oauth2') ? Response.json({ access_token: 'token-1' }) : Response.json({ rows: [{ keys: ['vakantiepark kerst'], clicks: 3, impressions: 40, ctr: 0.075, position: 8.2 }] });
  };
  const token = await accessToken(account, { fetcher, now: Date.parse('2026-11-19T12:00:00Z') });
  assert.equal(token, 'token-1');
  const [header, claims, signature] = calls[0].init.body.get('assertion').split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url'), 'signed with the account key');
  const read = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.equal(read.iss, account.client_email);
  assert.equal(read.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(read.exp - read.iat, 3600);

  const rows = await searchAnalytics(token, { startDate: '2026-11-01', endDate: '2026-11-18', dimensions: ['query'] }, { fetcher });
  assert.equal(rows[0].keys[0], 'vakantiepark kerst');
  assert.equal(calls[1].url, 'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aparkjeweg.nl/searchAnalytics/query');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-1');
  await assert.rejects(searchAnalytics(token, { dimensions: [] }, { fetcher: async () => new Response('no access', { status: 403 }) }), /403: no access/);
});
