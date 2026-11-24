/** A call to the app's own /api, as JSON both ways. */
export async function request(path, options = {}) {
  // The page itself already asked for the first prices while this script was still loading (see index.html); each
  // such answer is used once.
  const early = !options.method && window.__early?.[path];
  if (early) delete window.__early[path];
  const response = await (early ||
    fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    }));
  if (!response.ok) throw new Error(`Request to ${path} failed with ${response.status}`);
  return response.json();
}
