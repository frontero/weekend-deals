// A check of the public pages (server/pages.mjs) for what search engines stumble over: titles and descriptions that
// are missing, too long or doubled, links to pages that do not exist, structured data that does not parse. Run after
// each round on the pages just built, and kept for the admin's SEO page: checking on request would cost the cloud
// app more computing than it has.
// No Node imports.

const SITE_NAME = 'Parkje weg';
// What a search result shows before it cuts off, roughly.
export const TITLE_MAX = 60;
const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

/** A page's title as its document carries it: with the site's name behind it while that still fits a search result. */
export function documentTitle(title) {
  const named = `${title} | ${SITE_NAME}`;
  return title.includes(SITE_NAME) || named.length > TITLE_MAX ? title : named;
}
const THIN_WORDS = 120;
// Pages the server makes on request rather than stores, and the app itself.
const OTHER_PATHS = new Set(['/', '/privacy', '/zo-werkt-het']);
const MAX_ISSUES = 300;

export const ISSUE_KINDS = {
  'title-missing': 'Geen titel',
  'title-long': 'Titel te lang voor een zoekresultaat',
  'title-double': 'Dezelfde titel als een andere pagina',
  'description-missing': 'Geen omschrijving',
  'description-short': 'Omschrijving erg kort',
  'description-long': 'Omschrijving te lang voor een zoekresultaat',
  'description-double': 'Dezelfde omschrijving als een andere pagina',
  'heading-count': 'Niet precies één hoofdkop',
  'link-dead': 'Link naar een pagina die niet bestaat',
  'data-invalid': 'Gegevens voor zoekmachines zijn niet leesbaar',
  'image-alt': 'Afbeelding zonder beschrijving',
  thin: 'Weinig tekst',
};

const wordsOf = (body) =>
  body
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * @param pages [{ path, title, description, body }] as buildPages gives them
 * @returns { checkedAt, pages, counts: { kind: number }, issues: [{ path, kind, detail }] }, the issues capped
 */
export function auditPages(pages, checkedAt = new Date().toISOString()) {
  const paths = new Set(pages.map((page) => page.path));
  const byTitle = Map.groupBy(pages, (page) => page.title);
  const byDescription = Map.groupBy(pages, (page) => page.description);
  const issues = [];
  const note = (page, kind, detail = '') => issues.push({ path: page.path, kind, detail });

  for (const page of pages) {
    const title = documentTitle(page.title ?? '');
    if (!page.title) note(page, 'title-missing');
    else if (title.length > TITLE_MAX) note(page, 'title-long', `${title.length} tekens: ${title}`);
    if (page.title && byTitle.get(page.title).length > 1) note(page, 'title-double', page.title);

    const description = page.description ?? '';
    if (!description) note(page, 'description-missing');
    else if (description.length < DESCRIPTION_MIN) note(page, 'description-short', `${description.length} tekens`);
    else if (description.length > DESCRIPTION_MAX) note(page, 'description-long', `${description.length} tekens`);
    if (description && byDescription.get(description).length > 1) note(page, 'description-double');

    const headings = page.body.match(/<h1[\s>]/g)?.length ?? 0;
    if (headings !== 1) note(page, 'heading-count', `${headings} hoofdkoppen`);

    const links = new Set([...page.body.matchAll(/href="(\/[^"#?]*)/g)].map((match) => match[1]));
    for (const link of links) {
      if (!paths.has(link) && !OTHER_PATHS.has(link) && !link.startsWith('/api/')) note(page, 'link-dead', link);
    }

    for (const [, json] of page.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        JSON.parse(json);
      } catch {
        note(page, 'data-invalid', json.slice(0, 80));
      }
    }

    const bare = [...page.body.matchAll(/<img\b[^>]*>/g)].filter(([tag]) => !/\balt="[^"]+"/.test(tag)).length;
    if (bare) note(page, 'image-alt', `${bare} afbeeldingen`);
    if (wordsOf(page.body) < THIN_WORDS) note(page, 'thin', `${wordsOf(page.body)} woorden`);
  }

  const counts = Object.fromEntries([...Map.groupBy(issues, (issue) => issue.kind)].map(([kind, list]) => [kind, list.length]));
  return { checkedAt, pages: pages.length, counts, issues: issues.slice(0, MAX_ISSUES) };
}
