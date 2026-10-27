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
