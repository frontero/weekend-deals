// Turns the background price rounds on or off: a macOS launchd agent that checks every ten minutes whether a round is
// due or the cloud app asked for one (see `npm run collect -- --if-due`), also when the app is closed.
// Usage: node scripts/background.mjs on|off|now|status
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'local.weekend-deals.collect';
const CHECK_EVERY_SECONDS = 600;

const project = fileURLToPath(new URL('..', import.meta.url));
const logFile = join(project, 'data', 'background.log');
const plistFile = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const service = `gui/${process.getuid()}/${LABEL}`;

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// The Node that runs this script; with a version manager its path changes on upgrades, so run "on" again then.
function plist() {
  const args = [process.execPath, '--env-file-if-exists=.env.local', 'server/collect-cli.mjs', '--if-due'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${escapeXml(project)}</string>
  <key>StartInterval</key><integer>${CHECK_EVERY_SECONDS}</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>${escapeXml(logFile)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(logFile)}</string>
</dict>
</plist>
`;
}

const launchctl = (...args) => execFileSync('launchctl', args, { stdio: 'pipe' }).toString();
const stop = () => {
  try {
    launchctl('bootout', service);
  } catch {
    // Not loaded: nothing to stop.
  }
};

switch (process.argv[2]) {
  case 'on':
    mkdirSync(join(project, 'data'), { recursive: true });
    writeFileSync(plistFile, plist());
    stop();
    launchctl('bootstrap', `gui/${process.getuid()}`, plistFile);
    console.log(`Background rounds on: a check every ten minutes, a round when due or asked for. Log: ${logFile}`);
    break;
  case 'off':
    stop();
    if (existsSync(plistFile)) rmSync(plistFile);
    console.log('Background rounds off.');
    break;
  case 'now':
    launchctl('kickstart', '-k', service);
    console.log(`Check started. Log: ${logFile}`);
    break;
  case 'status':
    console.log(existsSync(plistFile) ? launchctl('print', service) : 'Background rounds are off.');
    break;
  default:
    console.log('Usage: node scripts/background.mjs on|off|now|status');
}
