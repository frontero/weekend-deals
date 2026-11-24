// The search page (a Vue app) and the other pages (built on the server) each write their own top bar and footer.
// They are one site to a visitor, so what they hold must stay the same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pageDocument } from './pages.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = String(pageDocument({ title: 'Test', description: '', image: null, body: '' }, { url: 'https://parkjeweg.nl/parken', stylesheet: null }));
const appBar = read('../src/components/AppBar.vue');
const app = read('../src/App.vue');

/** The links of the `<nav>` with a label: where each goes and what it says. */
const navLinks = (source, label) => {
  const nav = new RegExp(`<nav aria-label="${label}"[^>]*>([^]*?)</nav>`).exec(source)?.[1] ?? '';
  return [...nav.matchAll(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => `${href} ${text.trim()}`);
};
const classesOf = (source, pattern) => new Set(pattern.exec(source)?.[1].split(/\s+/) ?? []);

test('the top bar has the same menu and logo on the search page as on the other pages', () => {
  const menu = navLinks(page, 'Hoofdmenu');
  assert.ok(menu.length >= 3, 'the pages have a menu');
  assert.deepEqual(navLinks(appBar, 'Hoofdmenu'), menu);
  // The app draws its logo from Icon.vue's `home`; the pages carry the same drawing.
  const drawing = /home: '([^']+)'/.exec(read('../src/components/Icon.vue'))[1];
  assert.match(appBar, /<Icon name="home"/);
  assert.ok(page.includes(`<path d="${drawing}"`), 'the same house in the logo');
  assert.match(page, /id="theme-toggle"/);
  assert.match(appBar, /toggleTheme/);
});

test('the footer has the same links and look on the search page as on the other pages', () => {
  const links = navLinks(page, 'Over de site');
  assert.ok(links.length >= 4, 'the pages have footer links');
  assert.deepEqual(navLinks(app, 'Over de site'), links);
  assert.deepEqual(classesOf(app, /<footer class="([^"]+)"/), classesOf(page, /<footer class="([^"]+)"/));
});
