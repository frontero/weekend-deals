import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isAdminEmail, teamHost, verifyAccess } from './access.mjs';

const TEAM = 'example.cloudflareaccess.com';
const env = { ACCESS_TEAM_DOMAIN: `https://${TEAM}`, ACCESS_AUD: 'aud-tag' };
const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const realFetch = globalThis.fetch;
let keys;

const base64Url = (data) => Buffer.from(data).toString('base64url');

async function token(claims, { kid = 'key-1', privateKey = keys.privateKey } = {}) {
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', kid }))}.${base64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(algorithm, privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

const claims = (overrides = {}) => ({ aud: ['aud-tag'], iss: `https://${TEAM}`, exp: Date.now() / 1000 + 600, ...overrides });
const request = (jwt) => new Request('https://weekend-deals.example.workers.dev/api/status', jwt ? { headers: { 'Cf-Access-Jwt-Assertion': jwt } } : {});

before(async () => {
  keys = await crypto.subtle.generateKey({ ...algorithm, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), `https://${TEAM}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

test('lets in a request that Access signed for this app, and tells who it is', async () => {
  const access = await verifyAccess(request(await token(claims({ email: 'robert@example.com' }))), env);
  assert.equal(access.email, 'robert@example.com');
});

test('only the listed email addresses are admin', () => {
  assert.equal(isAdminEmail('Robert@Example.com', 'robert@example.com, other@example.com'), true);
  assert.equal(isAdminEmail('guest@example.com', 'robert@example.com'), false);
  assert.equal(isAdminEmail('robert@example.com', undefined), false);
  assert.equal(isAdminEmail(undefined, 'robert@example.com'), false);
  assert.equal(isAdminEmail('', ','), false);
});

test('keeps out requests without a valid Access signature', async () => {
  const other = await crypto.subtle.generateKey({ ...algorithm, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign']);
  assert.equal(await verifyAccess(request(), env), null);
  assert.equal(await verifyAccess(request(await token(claims(), { privateKey: other.privateKey })), env), null);
  assert.equal(await verifyAccess(request(await token(claims(), { kid: 'unknown' })), env), null);
  assert.equal(await verifyAccess(request('not.a.token'), env), null);
});

test('keeps out tokens for another app, from another team, or expired', async () => {
  assert.equal(await verifyAccess(request(await token(claims({ aud: ['other-app'] }))), env), null);
  assert.equal(await verifyAccess(request(await token(claims({ iss: 'https://evil.cloudflareaccess.com' }))), env), null);
  assert.equal(await verifyAccess(request(await token(claims({ exp: Date.now() / 1000 - 1 }))), env), null);
});

test('stays closed until Access is configured', async () => {
  assert.equal(await verifyAccess(request(await token(claims())), { ACCESS_TEAM_DOMAIN: TEAM }), null);
});

test('accepts the team domain in the forms the dashboard shows it', () => {
  assert.equal(teamHost(`https://${TEAM}/cdn-cgi/access/certs`), TEAM);
  assert.equal(teamHost(` ${TEAM} `), TEAM);
});
