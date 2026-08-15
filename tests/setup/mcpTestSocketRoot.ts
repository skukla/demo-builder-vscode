/**
 * Where a test run's MCP sockets live.
 *
 * Shared by `globalSetup.ts` (stamps the run id), `node.ts` (per-worker dir) and
 * `globalTeardown.ts` (removes only its own run, sweeps dead ones). One home, so
 * the three cannot drift into disagreeing about the path — which is exactly the
 * failure this file exists to prevent.
 */

import * as os from 'os';
import * as path from 'path';

/** Env var carrying the run id from globalSetup down into every worker. */
export const RUN_ID_ENV = 'DEMO_BUILDER_MCP_TEST_RUN_ID';

/** Parent of all runs' socket trees. Never delete this — other runs live here. */
export function socketRootBase(): string {
    return path.join(os.tmpdir(), 'demo-builder-mcp-test');
}

/**
 * This run's own subtree.
 *
 * The run id is the jest MAIN process pid, which gives two properties at once:
 * concurrent runs cannot collide (different pids), and a leftover directory can
 * be identified as garbage by asking whether its pid is still alive.
 *
 * Falls back to this process's pid if globalSetup did not run — a wrong-but-unique
 * directory is recoverable; sharing one with another live run is what caused the
 * bug this replaces.
 */
export function socketRootForRun(): string {
    return path.join(socketRootBase(), process.env[RUN_ID_ENV] ?? `nosetup-${process.pid}`);
}
