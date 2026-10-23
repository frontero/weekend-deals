/** A call to the app's own /api, as JSON both ways. */
export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(`Request to ${path} failed with ${response.status}`);
  return response.json();
}
