/**
 * Guards the per-run MCP socket root.
 *
 * This runs in a WORKER, which is the point: it can only pass if the run id set
 * by globalSetup in the main process actually reached the worker environment.
 * Nothing else in the suite would notice if that chain broke — the fallback in
 * socketRootForRun() is deliberately silent, so a break would look like normal
 * operation right up until two concurrent runs deleted each other's sockets.
 *
 * The bug being guarded: the root was previously
 * `$TMPDIR/demo-builder-mcp-test/w<JEST_WORKER_ID>` with no per-run component,
 * and worker ids restart at 1 every run. Two concurrent runs shared w1, w2, …
 * and globalTeardown removed the whole shared tree. Measured 2026-08-13: two
 * overlapping full suites failed 4-6 suites every time.
 */

import * as path from 'path';
import { RUN_ID_ENV, socketRootBase, socketRootForRun } from './mcpTestSocketRoot';

describe('MCP test socket root', () => {
    it('receives the run id from globalSetup in the main process', () => {
        // If this fails, globalSetup did not run or its env did not reach workers.
        expect(process.env[RUN_ID_ENV]).toMatch(/^\d+$/);
    });

    it('puts this run under its own subtree, never directly in the shared base', () => {
        const runRoot = socketRootForRun();
        expect(runRoot).not.toBe(socketRootBase());
        expect(path.dirname(runRoot)).toBe(socketRootBase());
        // The segment must be the run id, not a worker id — worker ids collide
        // across runs and that is the whole defect.
        expect(path.basename(runRoot)).toBe(process.env[RUN_ID_ENV]);
    });

    it('points every worker inside this run at a per-worker dir within it', () => {
        const socketDir = process.env.DEMO_BUILDER_MCP_SOCKET_DIR ?? '';
        expect(socketDir.startsWith(socketRootForRun() + path.sep)).toBe(true);
        expect(path.basename(socketDir)).toMatch(/^w\d+$/);
    });

    it('never resolves to the shared base itself — teardown deletes what this returns', () => {
        // globalTeardown rmSync's socketRootForRun(). If that ever equals the base,
        // a single run wipes every concurrent run's sockets, which is the exact
        // regression this replaces.
        const original = process.env[RUN_ID_ENV];
        try {
            delete process.env[RUN_ID_ENV];
            expect(socketRootForRun()).not.toBe(socketRootBase());
            expect(path.basename(socketRootForRun())).toMatch(/^nosetup-\d+$/);
        } finally {
            if (original !== undefined) {
                process.env[RUN_ID_ENV] = original;
            }
        }
    });
});
