// Opens the built app the way a visitor would, before it goes online: the page must show parks, a park must open,
// its live price must come back and the admin page must show the rounds, on a desktop and on a phone, without errors
// in the page. Unit tests check the
// calculations; this checks that the screen works. Run after `vite build`; `npm run cloud:deploy` does both.
// Uses the Chrome installed on this Mac, without a window. Usage: node scripts/smoke-test.mjs
import { chromium } from 'playwright-core';
import { preview } from 'vite';

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
const browser = await chromium.launch({ channel: 'chrome', headless: true });
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
    await page.goto(`http://localhost:${PORT}/beheer`);
    await check('the admin page shows the rounds', () =>
      page.getByRole('heading', { name: 'Prijsrondes' }).waitFor({ timeout: TIMEOUT_MS }),
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
