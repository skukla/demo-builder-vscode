/**
 * Run a command with a HARD wall-clock limit, and kill everything it started when the
 * limit passes.
 *
 * WHY ONE OF THESE. `mutationSweep.mjs` had its own `run()` built on `spawnSync` with a
 * timeout. That stops the process it started — `npx` — and nothing below it: Stryker
 * and its jest workers are grandchildren and kept running. It also blocks the parent,
 * so a SIGTERM sent to the sweep was not handled until the child returned. On
 * 2026-10-10 a focused measurement of nine files ran 45 minutes with nothing to end it,
 * and the fix is the same thing the sweep needed, so both use this.
 *
 * HOW. The child is started in its own process group (`detached`), and the limit kills
 * the GROUP: SIGTERM first, SIGKILL a few seconds later for anything that ignored it.
 * The promise settles on `close`, which fires only once every process holding the
 * child's output pipes has gone — so "returned" means the tree is down, not just its
 * root. If THIS process exits while a child is running, the group is killed on the way
 * out, so a caller's `process.exit()` in a signal handler cannot orphan a run.
 */
import { spawn } from 'child_process';

/** How long a group gets between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 3_000;

const active = new Set();

function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
    } catch {
        // The group is already gone, which is the outcome being asked for.
    }
}

/** Kill every run still in flight, now. Safe to call from a signal handler. */
export function killActiveRuns(signal = 'SIGKILL') {
    for (const pid of active) signalGroup(pid, signal);
}

process.on('exit', () => killActiveRuns('SIGKILL'));

/**
 * @param cmd        the program
 * @param args       its arguments
 * @param timeoutMs  the wall-clock limit; the whole process group is killed after it
 * @param options    `onOutput(chunk)` is called with each piece of output as it arrives
 * @returns `{ ok, status, timedOut, out }` — `out` is stdout and stderr together, in
 *          arrival order. Never rejects: a command that cannot start reports `ok: false`.
 */
export function runBounded(cmd, args, timeoutMs, { onOutput } = {}) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let timedOut = false;
        let settled = false;
        let escalation;

        const take = (chunk) => {
            const text = chunk.toString();
            out += text;
            onOutput?.(text);
        };
        child.stdout.on('data', take);
        child.stderr.on('data', take);

        if (child.pid) active.add(child.pid);
        const limit = setTimeout(() => {
            timedOut = true;
            signalGroup(child.pid, 'SIGTERM');
            escalation = setTimeout(() => signalGroup(child.pid, 'SIGKILL'), KILL_GRACE_MS);
        }, timeoutMs);

        const settle = (status) => {
            if (settled) return;
            settled = true;
            clearTimeout(limit);
            clearTimeout(escalation);
            active.delete(child.pid);
            resolve({ ok: status === 0 && !timedOut, status, timedOut, out });
        };
        child.on('error', (err) => {
            out += `${err.message}\n`;
            settle(null);
        });
        child.on('close', (status) => settle(status));
    });
}
