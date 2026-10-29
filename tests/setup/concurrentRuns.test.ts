/**
 * Detecting a concurrent jest run (2026-09-21).
 *
 * The detection is the hook's, deliberately — same `ps` shape, same exclusions —
 * because the hook's version was measured and this one only has to agree with it.
 * What it adds is the half a PreToolUse hook cannot do: saying AFTERWARDS that the
 * run had company, so a starvation timeout can be told from a real failure.
 *
 * The snapshots below are `ps -Ao pid=,command=` output, the format the hook's own
 * `DBV_JEST_PS` seam takes.
 */

import {
    contentionNotice,
    peerJestPids,
    processSnapshot,
} from './concurrentRuns';

const OWN_PID = 4242;
const ANCESTORS = new Set([OWN_PID, 99]);

/** A snapshot with one peer run, this run, and things that are not runs. */
const SNAPSHOT = [
    ' 1001 /bin/zsh -l',
    ` ${OWN_PID} node /repo/node_modules/.bin/jest --no-coverage`,
    ' 5150 node /other/node_modules/.bin/jest --no-coverage',
    ' 5151 node /repo/node_modules/jest-worker/build/workers/processChild.js',
    ' 6000 node /repo/node_modules/.bin/jest --watch',
    ' 7000 ps -Ao pid=,command=',
].join('\n');

describe('peerJestPids', () => {
    it('finds another run, and does not count this one', () => {
        expect(peerJestPids(SNAPSHOT, ANCESTORS)).toEqual([5150]);
    });

    it('does not count a worker of a run — only its parent', () => {
        // A full run has a dozen workers; counting them would report contention
        // against itself every single time.
        const workersOnly = ' 5151 node /repo/node_modules/jest-worker/build/workers/processChild.js';
        expect(peerJestPids(workersOnly, ANCESTORS)).toStrictEqual([]);
    });

    it('does not count a resident --watch parent', () => {
        // It is idle almost always, and counting it would flag every run for the
        // lifetime of an open watcher.
        const watchOnly = ' 6000 node /repo/node_modules/.bin/jest --watch';
        expect(peerJestPids(watchOnly, ANCESTORS)).toStrictEqual([]);
    });

    it('does not count a command that merely NAMES jest', () => {
        // The hook's first cut fired on `ps | grep jest` — an inspection command
        // that starts nothing, and close to the one its own message recommends.
        const inspecting = ' 7000 grep jest';
        expect(peerJestPids(inspecting, ANCESTORS)).toStrictEqual([]);
    });

    it('CONTROL: an empty snapshot claims nothing, rather than everything', () => {
        // FAILS OPEN. No snapshot means no claim — a false alarm would train
        // exactly the "ignore it" reflex this exists to prevent.
        expect(peerJestPids('', ANCESTORS)).toStrictEqual([]);
    });
});

describe('processSnapshot', () => {
    it('reads the DBV_JEST_PS override when one is set', () => {
        const file = `${__dirname}/../../package.json`;
        process.env.DBV_JEST_PS = file;
        try {
            expect(processSnapshot()).toContain('adobe-demo-builder');
        } finally {
            delete process.env.DBV_JEST_PS;
        }
    });

    it('answers empty, not a throw, when the override names nothing', () => {
        process.env.DBV_JEST_PS = '/no/such/snapshot/file';
        try {
            expect(processSnapshot()).toBe('');
        } finally {
            delete process.env.DBV_JEST_PS;
        }
    });
});

describe('contentionNotice', () => {
    it('names the pids and the suites starvation lands on', () => {
        const notice = contentionNotice([5150]);

        expect(notice).toContain('1 other jest run was in flight');
        expect(notice).toContain('pid 5150');
        // The whole point: which failures to disbelieve.
        expect(notice).toContain('inExtensionMcpServer');
        expect(notice).toContain('executor-*ComponentLoading');
    });

    it('reads as plural for several', () => {
        expect(contentionNotice([5150, 5160])).toContain('2 other jest runs were in flight');
    });
});
