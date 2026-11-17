// Turso's free plan blocks the whole account for the rest of the month once a monthly limit is passed. The jobs ask
// how much of this month is used and hold back before that happens; the site itself reads little and keeps working.
const LIMITS = { rowsRead: 500_000_000, rowsWritten: 10_000_000 };
// From this share of a limit, only the prices the site shows by default are collected; from STOP_SHARE, nothing is.
const ESSENTIAL_SHARE = 0.7;
const STOP_SHARE = 0.9;
// Before this part of the month has passed, one busy day says little about the pace.
const PACE_FROM = 0.1;

/** This month's use of the organisation from Turso's platform API, or null without a token. */
export async function tursoUsage({ org, token }, fetchImpl = fetch) {
  if (!org || !token) return null;
  const response = await fetchImpl(`https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Turso usage answered ${response.status}`);
  const usage = (await response.json()).organization?.usage ?? {};
  return { rowsRead: usage.rows_read ?? 0, rowsWritten: usage.rows_written ?? 0 };
}

/** The largest share of a monthly limit used so far, 0 to 1 and beyond. */
export const usedShare = (usage) => Math.max(usage.rowsRead / LIMITS.rowsRead, usage.rowsWritten / LIMITS.rowsWritten);

/**
 * 'normal', 'essential' or 'stop'. Holds back at a share of a limit, and also when this month's pace would reach the
 * stop share before the month (Turso's billing cycle) ends.
 */
export function budgetLevel(usage, now = new Date()) {
  if (!usage) return 'normal';
  const used = usedShare(usage);
  if (used >= STOP_SHARE) return 'stop';
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const elapsed = (now - start) / (Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - start);
  const tooFast = elapsed >= PACE_FROM && used / elapsed >= STOP_SHARE;
  return used >= ESSENTIAL_SHARE || tooFast ? 'essential' : 'normal';
}

/**
 * The level for a job, from TURSO_ORG and TURSO_API_TOKEN. Without them, or when Turso does not answer, the job runs
 * as usual: a missing check must not stop the prices.
 */
export async function checkBudget(env = process.env, log = console.log) {
  try {
    const usage = await tursoUsage({ org: env.TURSO_ORG, token: env.TURSO_API_TOKEN });
    if (!usage) return { level: 'normal', percent: null };
    return { level: budgetLevel(usage), percent: Math.round(usedShare(usage) * 100) };
  } catch (error) {
    log(`::warning::Turso usage unknown (${error.message}); running as usual.`);
    return { level: 'normal', percent: null };
  }
}
