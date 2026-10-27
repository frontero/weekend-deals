import { createApi } from './api.mjs';
import { connect } from './connect.mjs';

async function toRequest(req) {
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = '';
    for await (const chunk of req) body += chunk;
  }
  return new Request(new URL(req.originalUrl ?? req.url, 'http://localhost'), { method: req.method, body });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Serves /api from the Vite dev and preview servers, and keeps prices fresh while they run. */
/**
 * @param appUrl the cloud app, where price alert messages lead (a phone cannot open this Mac's localhost)
 * @param collect false serves the API without fetching prices, e.g. for the smoke test before a deploy
 */
export function weekendDealsApi({ env, googleApiKey, appUrl = null, affiliateLinks = {}, collect = true }) {
  const log = (line) => console.log(`[weekend-deals] ${line}`);

  const mount = async (server) => {
    const { client, where } = connect(env);
    log(`prices in ${where}`);
    const api = await createApi({ client, googleApiKey, appUrl, affiliateLinks, autoScan: collect, log });
    server.middlewares.use('/api', async (req, res) => send(res, await api.handle(await toRequest(req))));
    server.httpServer?.once('close', api.close);
  };

  return { name: 'weekend-deals-api', configureServer: mount, configurePreviewServer: mount };
}
