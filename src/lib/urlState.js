// Filters live in the address bar, so a search can be bookmarked or shared and the back button works.

function parse(raw, fallback) {
  if (Array.isArray(fallback)) return raw.split(',').filter(Boolean);
  if (typeof fallback === 'number' || fallback === null) {
    const number = Number(raw);
    return raw !== '' && Number.isFinite(number) ? number : fallback;
  }
  return raw;
}

const serialise = (value) => (Array.isArray(value) ? value.join(',') : String(value));

export function readQuery(search, defaults) {
  const params = new URLSearchParams(search);
  const state = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (params.has(key)) state[key] = parse(params.get(key), fallback);
  }
  return state;
}

export function writeQuery(state, defaults) {
  const params = new URLSearchParams();
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = state[key];
    if (value === null || value === '' || serialise(value) === serialise(fallback ?? '')) continue;
    params.set(key, serialise(value));
  }
  return params.toString();
}
