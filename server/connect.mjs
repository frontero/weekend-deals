import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { sleep } from './http.mjs';

// Turso now and then turns a request away for a moment ("Server database capacity temporarily exceeded") or drops
// the connection. Such a request is tried again after these pauses instead of failing a whole round. The writes that
// matter are upserts, so trying one again is harmless.
const RETRY_DELAYS_MS = [2000, 5000, 15000];
const TRANSIENT = /capacity temporarily exceeded|try again later|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|\b50[234]\b/i;

const isTransient = (error) => TRANSIENT.test(`${error?.message} ${error?.code} ${error?.cause?.code} ${error?.cause?.message}`);

/** The client, with its requests tried again on a transient error. */
export function withRetries(client, { delays = RETRY_DELAYS_MS, wait = sleep } = {}) {
  const retrying = (method) => async (...args) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await client[method](...args);
      } catch (error) {
        if (attempt >= delays.length || !isTransient(error)) throw error;
        await wait(delays[attempt]);
      }
    }
  };
  const methods = { execute: retrying('execute'), batch: retrying('batch'), executeMultiple: retrying('executeMultiple') };
  return new Proxy(client, {
    get(target, property) {
      if (Object.hasOwn(methods, property)) return methods[property];
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const LOCAL_DATABASE_FILE = fileURLToPath(new URL('../data/prices.db', import.meta.url));

/**
 * Turso when both its values are in the environment (`.env.local`, see scripts/setup-turso.sh), otherwise the
 * database file in data/.
 */
export function connect(env = process.env) {
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    // Plain HTTPS like the cloud app, instead of a websocket that a long-running dev server could see dropped.
    const url = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://');
    return { client: withRetries(createClient({ url, authToken: env.TURSO_AUTH_TOKEN })), where: 'Turso' };
  }
  return { ...connectFile(LOCAL_DATABASE_FILE), where: 'data/prices.db' };
}

export function connectFile(file) {
  mkdirSync(dirname(file), { recursive: true });
  return { client: createClient({ url: `file:${file}` }) };
}
