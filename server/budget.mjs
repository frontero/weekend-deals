// Turso's free plan blocks the whole account for the rest of the billing period once a limit is passed. The jobs ask
// how much of the period is used and hold back before that happens; the site itself reads little and keeps working.
// Without an answer about the plan, the free plan's limits apply.
const FREE_LIMITS = { rowsRead: 500_000_000, rowsWritten: 10_000_000 };
// From this share of a limit, only the prices the site shows by default are collected; from STOP_SHARE, nothing is.
const ESSENTIAL_SHARE = 0.7;
const STOP_SHARE = 0.9;
// Before this part of the period has passed, one busy day says little about the pace.
const PACE_FROM = 0.1;
const API = 'https://api.turso.tech/v1/organizations';

/**
 * This billing period's use of the organisation, with its plan's limits and the period itself, from Turso's platform
 * API; null without a token.
 */
export async function tursoUsage({ org, token }, fetchImpl = fetch) {
  if (!org || !token) return null;
  const get = async (path) => {
    const response = await fetchImpl(`${API}/${encodeURIComponent(org)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Turso ${path} answered ${response.status}`);
    return response.json();
  };
  const [{ organization }, { subscription }, { plans }] = await Promise.all([get('usage'), get('subscription'), get('plans')]);
  const quotas = plans?.find((plan) => plan.name === subscription?.plan)?.quotas;
  return {
    rowsRead: organization?.usage?.rows_read ?? 0,
    rowsWritten: organization?.usage?.rows_written ?? 0,
    limits: quotas ? { rowsRead: quotas.rowsRead, rowsWritten: quotas.rowsWritten } : FREE_LIMITS,
    periodStart: subscription?.current_billing_period_start ?? null,
    periodEnd: subscription?.current_billing_period_end ?? null,
  };
}

/** The largest share of a limit used so far, 0 to 1 and beyond. */
export function usedShare(usage) {
  const limits = usage.limits ?? FREE_LIMITS;
  return Math.max(usage.rowsRead / limits.rowsRead, usage.rowsWritten / limits.rowsWritten);
}

/**
 * 'normal', 'essential' or 'stop'. Holds back at a share of a limit, and also when the pace would reach the stop share
 * before the billing period (the calendar month when Turso did not say) ends.
 */
export function budgetLevel(usage, now = new Date()) {
  if (!usage) return 'normal';
  const used = usedShare(usage);
  if (used >= STOP_SHARE) return 'stop';
  const start = usage.periodStart ? Date.parse(usage.periodStart) : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = usage.periodEnd ? Date.parse(usage.periodEnd) : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = (now - start) / (end - start);
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
