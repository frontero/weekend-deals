// The clock for the price rounds and the price watch. Every ten minutes Cloudflare asks GitHub to run both
// workflows, which then check for themselves whether anything is due. GitHub's own schedule starts them only every
// few hours, and the Mac sleeps when its lid is closed, which broke rounds into pieces that timed out.
const WORKFLOWS = ['rounds.yml', 'watch.yml'];

/**
 * @param env GITHUB_REPOSITORY ("owner/name") and GITHUB_DISPATCH_TOKEN, a fine-grained token with only
 *   "Actions: read and write" on that repository; without both the clock does nothing
 * @returns [{ workflow, status }]
 */
export async function startWorkflows(env, { send = fetch, log = console.log } = {}) {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) return [];
  return Promise.all(
    WORKFLOWS.map(async (workflow) => {
      const response = await send(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'weekend-deals-clock',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
      });
      if (!response.ok) log(`${workflow}: GitHub answered ${response.status}`);
      return { workflow, status: response.status };
    }),
  );
}
