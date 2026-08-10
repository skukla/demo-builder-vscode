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
import * as os from 'os';
import * as path from 'path';

export default async function globalTeardown() {
    // Remove the isolated MCP socket tree that node.ts points every worker at.
    // The server no longer unlinks its own socket on dispose (there is no safe
    // way to — see InExtensionMcpServer.dispose), so without this the files
    // accumulate in the temp dir across runs.
    fs.rmSync(path.join(os.tmpdir(), 'demo-builder-mcp-test'), {
        recursive: true,
        force: true,
    });

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
