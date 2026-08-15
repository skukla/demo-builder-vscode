/**
 * Global test setup for Node.js tests
 *
 * This file runs after each test to ensure proper cleanup and prevent test pollution.
 * Key responsibilities:
 * - Restore fake timers to real timers
 * - Clear pending timers
 * - Restore all spies and mocks
 * - Reset ServiceLocator singletons
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { socketRootForRun } from './mcpTestSocketRoot';

// Ensure the demo-builder projects base directory exists. The real path-safety
// validator (validateProjectPath → assertPathInsideSync → fs.realpathSync)
// resolves the parent directory on disk, so canonical mock project paths
// (~/.demo-builder/projects/<name>) only validate when this base dir exists.
// Without it, handler tests pass on developer machines (where the dir exists)
// but throw on clean machines/CI. Idempotent; out-of-base paths still reject.
fs.mkdirSync(path.join(os.homedir(), '.demo-builder', 'projects'), { recursive: true });

// Keep test MCP sockets out of the real socket directory.
//
// `tests/extension-context.test.ts` and `tests/extension-activation-navigation.test.ts`
// call the REAL activate(), which starts the in-extension MCP server. Its socket
// path is derived from the projects dir, and the DEFAULT projects dir hashes to
// the exact socket a running Extension Dev Host binds — verified 2026-08-10 by
// computing both. So a plain `npx jest` renamed its own socket over the live
// window's, and the developer's MCP session died mid-run with a listener alive on
// a path no client could resolve. A worker leaked from one such run held that
// path for four days.
//
// Per RUN and then per worker. The run segment is not optional: worker ids
// restart at 1 every run, so a path keyed only on the worker id gave two
// concurrent runs the same directories, and globalTeardown then removed a live
// run's sockets along with its own. See globalSetup.ts for the measurement.
process.env.DEMO_BUILDER_MCP_SOCKET_DIR = path.join(
    socketRootForRun(),
    `w${process.env.JEST_WORKER_ID ?? '0'}`
);

afterEach(() => {
    // Reset ServiceLocator to prevent singleton pollution between tests
    ServiceLocator.reset();
    // Clear any pending timers before switching to real timers
    // Use try-catch because some tests may leave globals in an inconsistent state
    try {
        // Check if fake timers are active by testing if setTimeout exists and is mocked
        // Note: jest.spyOn(global, 'setTimeout') can leave setTimeout undefined after restore
        if (typeof setTimeout !== 'undefined' && jest.isMockFunction(setTimeout)) {
            // Run any pending timers to prevent them from leaking
            jest.runOnlyPendingTimers();
            // Clear all scheduled timers
            jest.clearAllTimers();
            // Restore real timers
            jest.useRealTimers();
        }
    } catch {
        // If timer operations fail, still try to restore real timers
        try {
            jest.useRealTimers();
        } catch {
            // Ignore - timers may already be real
        }
    }

    // Ensure all spies are restored
    // This is in addition to restoreMocks: true in jest.config.js
    // to handle edge cases where spies may not be properly cleaned up
    jest.restoreAllMocks();
});
