// Anonymous counts of what visitors use, for the admin's Bezoekers page (server/events.mjs). Sent in batches every
// few seconds and when the page goes to the background. Only which control and which option: never a search text or
// an address.
const SEND_AFTER_MS = 4000;
const queue = [];
let timer = null;
const referrer = document.referrer;
const campaign = new URLSearchParams(window.location.search).get('utm_source') ?? '';

function send() {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ path: window.location.pathname, referrer, campaign, events: queue.splice(0) });
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') send();
});
window.addEventListener('pagehide', send);
