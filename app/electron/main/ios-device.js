import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const DEVICECTL_TIMEOUT_MS = 20 * 1000;

// Real iOS device UDIDs: 8-16 hex (iPhone XS and later) or 40 hex (older devices).
// Simulator UDIDs are standard UUIDs and are deliberately not matched.
const REAL_DEVICE_UDID = /^(?:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}|[0-9A-Fa-f]{40})$/;

// WebDriverAgent's test runner, e.g. .../WebDriverAgentRunner-Runner.app/WebDriverAgentRunner-Runner
const WDA_RUNNER_EXECUTABLE = /\/WebDriverAgentRunner[^/]*-Runner\.app\//;

export const isRealIosDeviceUdid = (udid) => typeof udid === 'string' && REAL_DEVICE_UDID.test(udid);

const devicectl = (args) => execFileAsync('xcrun', ['devicectl', ...args], {timeout: DEVICECTL_TIMEOUT_MS});

/**
 * Terminates WebDriverAgent on a real iOS device connected to this Mac.
 *
 * The XCUITest driver keeps WebDriverAgent running after a session ends (to reuse it), and with
 * recent Xcode versions its own cleanup fails, so the device keeps showing "Automation Running".
 * This finds the runner process with `devicectl` and terminates it. WebDriverAgent stays
 * installed, so the developer certificate stays trusted.
 *
 * @param {string} udid real device UDID
 * @returns {Promise<number>} how many runner processes were terminated
 */
export async function stopWebDriverAgent(udid) {
  if (process.platform !== 'darwin' || !isRealIosDeviceUdid(udid)) {
    return 0;
  }
  const dir = await mkdtemp(join(tmpdir(), 'live-inspector-'));
  try {
    const jsonPath = join(dir, 'processes.json');
    await devicectl(['device', 'info', 'processes', '--device', udid, '--quiet', '--json-output', jsonPath]);
    const {result} = JSON.parse(await readFile(jsonPath, 'utf8'));
    const runnerPids = (result?.runningProcesses ?? [])
      .filter((proc) => WDA_RUNNER_EXECUTABLE.test(proc.executable ?? ''))
      .map((proc) => String(proc.processIdentifier))
      .filter((pid) => /^\d+$/.test(pid));
    for (const pid of runnerPids) {
      await devicectl(['device', 'process', 'terminate', '--device', udid, '--pid', pid, '--quiet']);
    }
    return runnerPids.length;
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
