// Opens the built app the way a visitor would, before it goes online: the page must show parks, a park must open,
// its live price must come back, and the admin pages must show their charts and the rounds, on a desktop and on a phone,
// without errors in the page. Unit tests check the
// calculations; this checks that the screen works. Run after `vite build`; `npm run cloud:deploy` does both.
// Uses the Microsoft Edge installed on this Mac, without a window. Usage: node scripts/smoke.mjs
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { axeFindings, dialogFindings, layoutFindings } from './ux-rules.mjs';

const PORT = 5299;
const TIMEOUT_MS = 20_000;
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 375, height: 812 },
];
// A missing photo on a provider's server is theirs to fix, not a broken page.
const harmless = (message) => /Failed to load resource/.test(message);

// A second server next to the app (the price data is the same); it serves the API without fetching prices.
process.env.WEEKEND_DEALS_COLLECT = 'off';
const server = await preview({ logLevel: 'error', preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures = [];

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    // The first line says what went wrong; the stack points into minified code.
    const note = (text) => errors.push(text.split('\n')[0]);
    page.on('pageerror', (error) => note(error.message));
    page.on('console', (message) => message.type() === 'error' && !harmless(message.text()) && note(message.text()));
    const check = async (what, step) => {
      try {
        await step();
        console.log(`  ✓ ${viewport.name}: ${what}`);
      } catch (error) {
        failures.push(`${viewport.name}: ${what} (${error.message.split('\n')[0]})`);
      }
    };

    await page.goto(`http://localhost:${PORT}/`);
    await check('the page shows parks', () => page.locator('article').first().waitFor({ timeout: TIMEOUT_MS }));
    if (viewport.name === 'phone') {
      await check('the first total price is visible without scrolling', async () => {
        const price = page.locator('article').first().locator('p').filter({ hasText: /^Totaalprijs\s+€/ });
        const box = await price.boundingBox();
        if (box === null || box.y < 0 || box.y + box.height > viewport.height) {
          throw new Error('the first deal price is outside the opening viewport');
        }
      });
    }
    await check('a park opens', async () => {
      await page.locator('article h3 button').first().click();
      await page.locator('dialog[open] h2').first().waitFor({ timeout: TIMEOUT_MS });
    });
    await check('the live price comes back', () =>
      page
        .locator('dialog[open]')
        .getByText(/Jouw prijs|niets meer vrij|lukte niet/)
        .first()
        .waitFor({ timeout: TIMEOUT_MS }),
    );
    // The house rules (scripts/ux-rules.mjs): nothing axe objects to, nothing too small or too wide, and every panel
    // closes the three ways a visitor tries.
    const rules = (what, findings) =>
      check(what, async () => {
        const found = await findings();
        if (found.length) throw new Error(found.join(' | '));
      });
    await page.goto(`http://localhost:${PORT}/`);
    await page.locator('article').first().waitFor({ timeout: TIMEOUT_MS });
    await rules('the search page keeps the house rules', async () => [...(await axeFindings(page)), ...(await layoutFindings(page))]);
    const panels = {
      park: () => page.locator('article h3 button').first().click(),
      'price alert': () => page.getByRole('button', { name: 'Prijsalarm' }).first().click(),
      dates: () => page.getByRole('button', { name: 'Kies datums' }).click(),
      party: () => page.getByRole('button', { name: /^Gezelschap:/ }).click(),
      ...(viewport.width < 1024 ? { filters: () => page.getByRole('button', { name: /^Filters/ }).click() } : {}),
    };
    for (const [label, open] of Object.entries(panels)) await rules(`the ${label} panel keeps the house rules`, () => dialogFindings(page, label, open));

    await page.goto(`http://localhost:${PORT}/beheer`);
    await check('the admin dashboard shows its charts', () =>
      page.locator('main canvas').first().waitFor({ timeout: TIMEOUT_MS }),
    );
    await page.goto(`http://localhost:${PORT}/beheer/wijzigingen`);
    await check('the price watch shows when prices change', () =>
      page.getByRole('heading', { name: 'Wanneer veranderen prijzen' }).waitFor({ timeout: TIMEOUT_MS }),
    );
    await page.goto(`http://localhost:${PORT}/beheer/rondes`);
    await check('the admin page shows the rounds', () =>
      page.getByRole('heading', { name: 'Prijsrondes' }).waitFor({ timeout: TIMEOUT_MS }),
    );
    await page.goto(`http://localhost:${PORT}/beheer/seo`);
    await check('the SEO page offers both comparison periods', async () => {
      const period = page.getByRole('combobox', { name: 'Vergelijkingsperiode' });
      await period.selectOption('7');
      await period.selectOption('28');
      await page.getByText('Opgenomen door Google', { exact: true }).waitFor({ timeout: TIMEOUT_MS });
    });
    await check('the SEO table shows the publication time and both crawl sources', async () => {
      const table = page.getByRole('group', { name: 'Indexeringstabel' });
      await table.getByRole('columnheader', { name: 'Googlebot (Cloudflare)' }).waitFor({ timeout: TIMEOUT_MS });
      await table.getByRole('columnheader', { name: 'Laatste crawl (Search Console)' }).waitFor({ timeout: TIMEOUT_MS });
      await table.getByRole('rowheader', { name: /Het Vennenbos.*Update/ }).locator('time[datetime]').waitFor({ timeout: TIMEOUT_MS });
    });
    await check('the SEO page shows the recovery overview for parks and regions', () =>
      page.getByRole('heading', { name: 'Herstel van park- en regiopagina’s' }).waitFor({ timeout: TIMEOUT_MS }),
    );
    if (errors.length) failures.push(`${viewport.name}: errors in the page: ${[...new Set(errors)].join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`Smoke test failed, nothing deployed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Smoke test passed.');
process.exit(0);
