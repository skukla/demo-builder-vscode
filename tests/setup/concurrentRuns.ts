/**
 * Was another jest run in flight while this one ran?
 *
 * `.claude/hooks/rules/15-jest-concurrent.rule` REFUSES to start a run while one
 * is already going, because the result of a concurrent run is noise: measured
 * 2026-08-13, two overlapping full suites failed 4-6 suites every time on 10s
 * timeouts while a solo run failed none in ten attempts.
 *
 * But that hook is PreToolUse, so it sees only Claude's own tool calls. A run
 * started from a terminal, or from inside a shell script — `.githooks/pre-push`
 * runs the whole gate — is invisible to it and contends anyway. The hook says so
 * itself, and it happened three times on 2026-09-20: `inExtensionMcpServer` twice
 * and `executor-appBuilderComponentLoading` once, every one passing alone.
 *
 * What it cost was not the minutes. A starved run reports `Exceeded timeout of
 * 10000 ms`, which reads exactly like a real failure, and nothing afterwards says
 * otherwise — so the response is to re-run rather than to read, which is the
 * reflex this repo has a principle against. This module does not prevent the
 * contention. It NAMES it, so a red run can be told from a noisy one.
 *
 * Detection is the hook's, deliberately: the parent of any run is
 * `node .../node_modules/.bin/jest`, a `--watch` parent is idle almost always and
 * is skipped, and a run that is this process's own ancestor is never counted.
 * `DBV_JEST_PS` overrides the snapshot with a file in `ps -Ao pid=,command=`
 * format — the same seam the hook uses, so both can be tested without a second
 * real suite.
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

/** Env var carrying the peers seen at globalSetup through to globalTeardown. */
export const PEERS_AT_START_ENV = 'DBV_JEST_PEERS_AT_START';

/** The suites starvation lands on first, named by the hook that measured them. */
export const CONTENTION_SET = [
    'inExtensionMcpServer',
    'mcpConfigWriter',
    'extension-context',
    'executor-*ComponentLoading',
    'processCleanup.timeout',
];

/** A process snapshot in `ps -Ao pid=,command=` form, or '' when unavailable. */
export function processSnapshot(): string {
    const override = process.env.DBV_JEST_PS;
    if (override) {
        try {
            return readFileSync(override, 'utf8');
        } catch {
            return '';
        }
    }
    try {
        return execFileSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' });
    } catch {
        // FAILS OPEN, like the hook: no snapshot means no claim, never a false alarm.
        return '';
    }
}

/** This process's pid chain up to init, so a run never counts itself. */
export function ancestorPids(start = process.pid): Set<number> {
    const chain = new Set<number>();
    let pid: number | undefined = start;
    while (pid !== undefined && pid > 1 && !chain.has(pid)) {
        chain.add(pid);
        try {
            const out: string = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
                encoding: 'utf8',
            });
            const parent: number = Number(out.trim());
            pid = Number.isInteger(parent) && parent > 0 ? parent : undefined;
        } catch {
            pid = undefined;
        }
    }
    return chain;
}

/**
 * The pids of jest runs OTHER than this one, as the snapshot saw them.
 *
 * @param snapshot - `ps -Ao pid=,command=` output
 * @param ancestors - pids belonging to this run, never counted
 */
export function peerJestPids(snapshot: string, ancestors: Set<number>): number[] {
    const peers: number[] = [];
    for (const line of snapshot.split('\n')) {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line);
        if (!match) continue;
        const [, rawPid, command] = match;
        if (!command.includes('node_modules/.bin/jest')) continue;
        if (command.includes('--watch')) continue;
        const pid = Number(rawPid);
        if (ancestors.has(pid)) continue;
        peers.push(pid);
    }
    return peers;
}

/** The banner a run prints when it did not have the machine to itself. */
export function contentionNotice(pids: readonly number[]): string {
    const count = pids.length;
    const runs = count === 1 ? '1 other jest run was' : `${count} other jest runs were`;
    return [
        '',
        '  ' + '='.repeat(74),
        `  ${runs} in flight during this run (pid ${pids.join(', pid ')}).`,
        '',
        '  Results from a concurrent run are not trustworthy. Two overlapping full',
        '  suites failed 4-6 suites every time on 10s timeouts (measured 2026-08-13),',
        '  while a solo run failed none in ten attempts.',
        '',
        `  Failures in ${CONTENTION_SET.join(', ')}`,
        '  are starvation, not your change. A green result is luck; a red one is noise.',
        '  Re-run once nothing else is going.',
        '  ' + '='.repeat(74),
        '',
    ].join('\n');
}
