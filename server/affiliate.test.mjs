import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affiliateUrl, parseAffiliateLinks, providerOfUrl } from './affiliate.mjs';

test('only leads to the providers own sites', () => {
  assert.equal(providerOfUrl('https://www.landal.nl/parken/hof-van-saksen'), 'landal');
  assert.equal(providerOfUrl('https://www.hofvansaksen.nl/resort/prijzen-en-beschikbaarheid'), 'landal');
  assert.equal(providerOfUrl('https://www.topparken.nl/vakantieparken/x'), 'topparken');
  assert.equal(providerOfUrl('https://www.molecaten.nl/park'), 'molecaten');
  assert.equal(providerOfUrl('https://landal.nl.evil.example/'), null);
  assert.equal(providerOfUrl('https://evil-landal.nl/'), null);
  assert.equal(providerOfUrl('http://www.landal.nl/'), null);
  assert.equal(providerOfUrl('javascript:alert(1)'), null);
  assert.equal(providerOfUrl('not a url'), null);
});

test('puts the provider page into its affiliate link, or leaves it as it is', () => {
  const page = 'https://www.landal.nl/parken/x?adults=2#filter:abc';
  const templates = parseAffiliateLinks('{"landal":"https://network.example/c/?si=1&dl={url}"}');
  assert.equal(affiliateUrl('landal', page, templates), `https://network.example/c/?si=1&dl=${encodeURIComponent(page)}`);
  assert.equal(affiliateUrl('topparken', 'https://www.topparken.nl/x', templates), 'https://www.topparken.nl/x');
  assert.deepEqual(parseAffiliateLinks('not json'), {});
  assert.deepEqual(parseAffiliateLinks(undefined), {});
});

test("a network that links on the provider's own domain gets the page's path, and a note on where the click came from", () => {
  const templates = { topparken: 'https://www.topparken.nl/tt/?tt=1_12_3_{ref}&r={path}' };
  const page = 'https://www.topparken.nl/vakantieparken/parc-de-ijsselhoeve/vakantiehuizen?startDate=2026-11-27&adults=2';
  assert.equal(
    affiliateUrl('topparken', page, templates, 'topparken:12 kaartje'),
    'https://www.topparken.nl/tt/?tt=1_12_3_topparken-12-kaartje&r=%2Fvakantieparken%2Fparc-de-ijsselhoeve%2Fvakantiehuizen%3FstartDate%3D2026-11-27%26adults%3D2',
  );
  assert.equal(affiliateUrl('topparken', page, templates), 'https://www.topparken.nl/tt/?tt=1_12_3_&r=%2Fvakantieparken%2Fparc-de-ijsselhoeve%2Fvakantiehuizen%3FstartDate%3D2026-11-27%26adults%3D2');
  assert.equal(affiliateUrl('landal', 'https://www.landal.nl/parken/x', templates, 'x'), 'https://www.landal.nl/parken/x', 'no template, no detour');
  assert.equal(affiliateUrl('topparken', page, { topparken: 'https://elsewhere.test/fixed' }), page, 'a template without a place for the page is not used');
});
