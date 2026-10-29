// Shared by every provider: an honest User-Agent, a timeout, and a few patient retries.
const RETRY_PAUSES_MS = [2000, 6000];
const USER_AGENT = 'Mozilla/5.0 (personal weekend price tracker)';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ENTITIES = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>' };

/** The readable text of a piece of HTML: tags out, entities decoded, whitespace collapsed. */
export function textOf(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&([a-z]+);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param options fetch's options, plus `timeoutMs` per attempt (20 seconds unless given) */
export async function fetchWithRetry(url, { timeoutMs = 20_000, ...options } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
      return response;
    } catch (error) {
      if (attempt >= RETRY_PAUSES_MS.length) throw error;
      await sleep(RETRY_PAUSES_MS[attempt]);
    }
  }
}
