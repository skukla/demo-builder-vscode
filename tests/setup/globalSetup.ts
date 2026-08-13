/**
 * Runs once in the jest MAIN process, before any worker spawns.
 *
 * Its only job is to stamp this run's id into the environment so every worker
 * inherits it. Before this existed, `node.ts` put every worker's MCP socket in
 * `$TMPDIR/demo-builder-mcp-test/w<JEST_WORKER_ID>` — a path with no per-run
 * component, and worker ids restart at 1 for every run. Two concurrent runs
 * therefore shared `w1`, `w2`, … as literally the same directories, and
 * `globalTeardown.ts` removed the whole shared tree rather than its own part of
 * it, deleting a live run's sockets mid-flight.
 *
 * Measured 2026-08-13: two overlapping full suites failed 4-6 suites every time.
 * A peer session's run died with
 *   ENOTEMPTY: directory not empty, rmdir '<tmp>/demo-builder-mcp-test/w9'
 * 16 seconds after one of those teardowns fired.
 *
 * Mutating process.env here is the supported way to reach workers: jest spawns
 * them after globalSetup returns, and they inherit the parent environment.
 */

import { RUN_ID_ENV } from './mcpTestSocketRoot';

export default async function globalSetup(): Promise<void> {
    // The main process pid — unique among live runs, and testable for liveness
    // later, which is how globalTeardown tells a crashed run's leftovers from a
    // running one's live sockets.
    process.env[RUN_ID_ENV] = String(process.pid);
}
