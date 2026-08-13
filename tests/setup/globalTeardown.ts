/**
 * Global teardown to clean up any remaining handles and prevent Jest from hanging
 *
 * This runs once after all tests complete to ensure:
 * - All timers are cleared
 * - All services are reset
 * - No open handles remain
 *
 * Note: GlobalTeardown runs outside the Jest test context, so we can't use
 * TypeScript path aliases (@/) or most imports. Keep this file simple.
 */

import * as fs from 'fs';
import * as path from 'path';
import { socketRootBase, socketRootForRun } from './mcpTestSocketRoot';

/**
 * Is a run id still a live process?
 *
 * Signal 0 checks existence without killing. EPERM means it exists but belongs
 * to someone else, which still counts as alive — the safe direction, because
 * treating a live run as dead is what deletes its sockets.
 */
function runIsAlive(runId: string): boolean {
    const pid = Number(runId);
    if (!Number.isInteger(pid) || pid <= 0) {
        return true; // Unparseable: leave it alone rather than guess.
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
}

export default async function globalTeardown() {
    // Remove THIS RUN's MCP socket tree — never the shared parent. The server no
    // longer unlinks its own socket on dispose (there is no safe way to — see
    // InExtensionMcpServer.dispose), so without this the files accumulate.
    //
    // Removing the parent is what this used to do, and with two runs in flight it
    // deleted the other one's live worker directories mid-run. See globalSetup.ts.
    fs.rmSync(socketRootForRun(), { recursive: true, force: true });

    // Sweep runs that died without tearing themselves down. Without this, keying
    // the tree per-run would just leak a directory per crashed run instead of
    // reusing one — trading a collision for unbounded growth. A run whose pid is
    // still alive is a CONCURRENT run: leave it strictly alone.
    try {
        for (const entry of fs.readdirSync(socketRootBase())) {
            if (!runIsAlive(entry)) {
                fs.rmSync(path.join(socketRootBase(), entry), { recursive: true, force: true });
            }
        }
    } catch {
        // Base dir already gone, or unreadable. Nothing to sweep.
    }

    // ServiceLocator.reset() is called in afterEach in node.ts
    // We don't need to do it here as well

    // Clear any remaining timers
    // Note: This is a safety net - individual tests should clean up their own timers
    if (typeof global.setTimeout !== 'undefined') {
        try {
            // @ts-expect-error - accessing internal timer registry
            const timers = global.setTimeout._timers;
            if (timers && typeof timers.clear === 'function') {
                timers.clear();
            }
        } catch {
            // Ignore - timer cleanup is best-effort
        }
    }

    // Force garbage collection if available (helpful for finding leaks)
    if (global.gc) {
        global.gc();
    }

    // Give Node a moment to close any pending handles
    await new Promise((resolve) => setTimeout(resolve, 100));
}
