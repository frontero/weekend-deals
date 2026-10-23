import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

export const LOCAL_DATABASE_FILE = fileURLToPath(new URL('../data/prices.db', import.meta.url));

/**
 * Turso when both its values are in the environment (`.env.local`, see scripts/setup-turso.sh), otherwise the
 * database file in data/.
 */
export function connect(env = process.env) {
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    // Plain HTTPS like the cloud app, instead of a websocket that a long-running dev server could see dropped.
    const url = env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://');
    return { client: createClient({ url, authToken: env.TURSO_AUTH_TOKEN }), where: 'Turso' };
  }
  return { ...connectFile(LOCAL_DATABASE_FILE), where: 'data/prices.db' };
}

export function connectFile(file) {
  mkdirSync(dirname(file), { recursive: true });
  return { client: createClient({ url: `file:${file}` }) };
}
