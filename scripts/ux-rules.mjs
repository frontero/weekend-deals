// House rules for how the site behaves, checked on a page in a browser (see scripts/smoke.mjs): what axe finds
// against WCAG 2.2 AA, and the things no scanner sees but a visitor trips over: a panel that will not close, a close
// button scrolled out of view, a button too small to hit, a page wider than the screen.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
// WCAG 2.5.8: a target of at least 24 by 24 CSS pixels.
const MIN_TARGET = 24;

/** What axe finds on the page as it is now, one line per rule: its help text and how many elements. */
export async function axeFindings(page, { within = null } = {}) {
  await page.evaluate(axeSource);
  const results = await page.evaluate(
    (selector) => window.axe.run(selector ?? document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'], resultTypes: ['violations'] }),
    within,
  );
  return results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length}x, e.g. ${violation.nodes[0].target.join(' ')})`);
}

/** Things on the page that are wider than it, or too small to hit. */
export async function layoutFindings(page) {
  return page.evaluate((least) => {
    const findings = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) findings.push(`the page is ${document.documentElement.scrollWidth - window.innerWidth}px wider than the screen`);
    const small = [];
    for (const element of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), summary, [role=button]')) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || element.closest('[hidden], [aria-hidden=true]') || !element.checkVisibility?.()) continue;
      // A link inside a sentence is as high as its line; the rule leaves those out.
      if (element.tagName === 'A' && getComputedStyle(element).display === 'inline') continue;
      // The same choice stands next to it as a row that is large enough (the exception WCAG 2.5.8 makes).
      if (element.hasAttribute('data-also-in-list')) continue;
      // A checkbox or radio is hit through its label.
      if (element.matches('input[type=checkbox], input[type=radio]') && element.closest('label')) continue;
      if (box.width < least - 0.5 || box.height < least - 0.5) small.push(`${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent).trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    if (small.length) findings.push(`${small.length} targets under ${least}px: ${[...new Set(small)].slice(0, 6).join('; ')}`);
    return findings;
  }, MIN_TARGET);
}

/**
 * A panel opened by `open` behaves as panels do: focus goes into it, its close button stays in view when it scrolls,
 * it has nothing axe objects to, and Escape, a click beside it and the close button each close it.
 */
export async function dialogFindings(page, label, open) {
  const findings = [];
  const dialog = page.locator('dialog[open]');
  const isOpen = () => page.locator('dialog[open]').count().then((count) => count > 0);
  const settle = () => page.waitForTimeout(350);
  const reopen = async () => {
    if (!(await isOpen())) await open();
    await dialog.waitFor({ timeout: 10_000 });
    await settle();
  };

  await reopen();
  if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) findings.push(`${label}: focus does not move into the panel`);
  findings.push(...(await axeFindings(page, { within: 'dialog[open]' })).map((finding) => `${label}: ${finding}`));
  findings.push(...(await layoutFindings(page)).map((finding) => `${label}: ${finding}`));

  await dialog.evaluate((element) => {
    for (const box of [element, ...element.querySelectorAll('*')]) if (box.scrollHeight > box.clientHeight + 4 && getComputedStyle(box).overflowY !== 'visible') box.scrollTop = box.scrollHeight;
  });
  await settle();
  const close = dialog.getByRole('button', { name: 'Sluiten' }).first();
  const inView = await close.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') === element;
  }).catch(() => false);
  if (!inView) findings.push(`${label}: the close button is out of view or covered after scrolling down`);

  await page.keyboard.press('Escape');
  await settle();
  if (await isOpen()) findings.push(`${label}: Escape does not close the panel`);

  await reopen();
  const beside = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    if (box.left > 20) return { x: box.left / 2, y: window.innerHeight / 2 };
    if (box.top > 20) return { x: window.innerWidth / 2, y: box.top / 2 };
    return null;
  });
  if (beside) {
    await page.mouse.click(beside.x, beside.y);
    await settle();
    if (await isOpen()) findings.push(`${label}: a click beside the panel does not close it`);
  }

  await reopen();
  await close.click();
  await settle();
  if (await isOpen()) findings.push(`${label}: the close button does not close the panel`);
  return findings;
}
