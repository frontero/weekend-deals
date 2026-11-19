// Anonymous counts of what visitors use, for the admin's Bezoekers page (server/events.mjs). Sent in batches every
// few seconds and when the page goes to the background. Only which control and which option: never a search text or
// an address.
const SEND_AFTER_MS = 4000;
const queue = [];
let timer = null;
const referrer = document.referrer;
const campaign = new URLSearchParams(window.location.search).get('utm_source') ?? '';
// The label of the message or advertisement a link came from, if it carries one.
const label = new URLSearchParams(window.location.search).get('utm_campaign') ?? '';
// The screen as one of three widths, never its size.
const screen = () => (window.innerWidth < 640 ? 'klein' : window.innerWidth < 1024 ? 'middel' : 'groot');

function send() {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ path: window.location.pathname, referrer, campaign, label, screen: screen(), events: queue.splice(0) });
  if (!navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) {
    fetch('/api/events', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  }
}

/** Counts one use. Using the same control again before the batch goes replaces it, so typing or sliding counts once. */
export function track(name, key = '', value = '', number = 0) {
  const earlier = queue.findIndex((event) => event.name === name && event.key === key);
  if (earlier >= 0 && name !== 'park') queue.splice(earlier, 1);
  queue.push({ name, key: String(key), value: String(value ?? '').slice(0, 64), number });
  timer ??= setTimeout(send, SEND_AFTER_MS);
}

// How fast the page came: when it had loaded, and when its largest piece was on screen.
let largestPaint = 0;
try {
  new PerformanceObserver((list) => {
    largestPaint = list.getEntries().at(-1)?.startTime ?? largestPaint;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
} catch {
  // A browser without this measure sends none.
}
window.addEventListener('load', () =>
  setTimeout(() => {
    const [navigation] = performance.getEntriesByType('navigation');
    if (navigation?.loadEventEnd) track('speed', 'load', '', Math.round(navigation.loadEventEnd));
  }),
);

// What broke in the browser, by its message without anything that is not a letter or number; a few per page at most.
let errors = 0;
function trackError(message) {
  errors += 1;
  if (errors <= 3) track('error', `js${errors}`, String(message ?? '').replace(/[^\p{L}\p{N} _.,:-]/gu, ' ').slice(0, 64));
}
window.addEventListener('error', (event) => trackError(event.message));
window.addEventListener('unhandledrejection', (event) => trackError(event.reason?.message ?? event.reason));

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (largestPaint) track('speed', 'paint', '', Math.round(largestPaint));
  send();
});
window.addEventListener('pagehide', send);
