// Tells Bing and the search engines that share IndexNow (DuckDuckGo, Ecosia, Yandex and others) which pages are new,
// so they need not wait for their crawler. Google does not take part. Node only: the rounds run it.

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'parkjeweg.nl';
// Not a secret: the engines check it against public/<key>.txt on the site.
export const INDEXNOW_KEY = '63c85ae3f208924e2fe8914be25ab916';
const MOST = 10000;

/**
 * Announces the pages that were not announced before; the first time that is every page. A page whose prices
 * changed is not announced again: that happens every round and the engines call that spam.
 * Returns how many it announced.
 */
export async function announceNewPages(db, { fetcher = fetch } = {}) {
  const known = new Set(await db.announcedPages());
  const paths = (await db.pagePaths()).map((page) => page.path ?? page);
  const fresh = paths.filter((path) => !known.has(path)).slice(0, MOST);
  if (!fresh.length) return 0;
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList: fresh.map((path) => `https://${HOST}${path}`) }),
  });
  // 202: received, the key file is checked later.
  if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow answered ${response.status}`);
  // Pages that are gone drop off the list, so one that returns is announced again.
  await db.saveAnnouncedPages(paths.filter((path) => known.has(path) || fresh.includes(path)));
  return fresh.length;
}
