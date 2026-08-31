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
import './consoleGate';

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

// Keep test PROJECT scans (and writes) out of the real projects directory.
//
// The same two activation suites run the real activate(), which fires the
// AI-bundle activation sweep — and that sweep WRITES `.mcp.json` /
// `.claude/mcp.json` / `.claude/settings.json` into every project its scanner
// finds. On 2026-08-22 it found the developer's real project and clobbered its
// MCP config with the test's mock extension path (and truncated `.mcp.json` to
// zero bytes when the run tore down mid-write). Point the projects root at a
// per-run, per-worker sandbox under the same tmp tree the socket fix uses; the
// directory is never created, so scans see a clean "no projects yet" ENOENT.
// Suites that need a specific root still override + restore it locally.
process.env.DEMO_BUILDER_PROJECTS_DIR = path.join(
    socketRootForRun(),
    `w${process.env.JEST_WORKER_ID ?? '0'}`,
    'projects'
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

/**
 * Every suite gets a working `getLogger()`, so none has to mock one to survive.
 *
 * The real `getLogger()` THROWS when no logger has been initialised, and nothing
 * in a test initialises one. So 174 suites carried a `jest.mock` of the logging
 * module for no reason of their own — 105 of the barrel and 69 of `debugLogger` —
 * and three unrelated suites broke on 2026-08-31 the moment a construction moved
 * and reached the real accessor.
 *
 * `...actual` is deliberate: only the ACCESSORS are replaced. `DebugLogger`,
 * `ErrorLogger` and `StepLogger` stay real, which is why the eleven suites in
 * tests/core/logging that test those classes directly are unaffected.
 *
 * A suite that wants to ASSERT on logging still mocks the module itself — a
 * per-file `jest.mock` is registered after this one and wins. Mock `@/core/logging`
 * when you do, because that is what production imports: 53 source files take the
 * core barrel and exactly ONE takes `@/core/logging/debugLogger`. (Core barrels are
 * the sanctioned import path — ADR-022 bans FEATURE barrels, not these.) Mocking
 * the deep module underneath this one leaves the accessor here in place, so the
 * suite asserts against a logger the code never received. That is precisely how the
 * two suites this change touched failed, and both were mocking the deep module.
 *
 * Measured before adopting: with this in place, 976 of 978 node suites passed
 * untouched.
 *
 * IT TARGETS THE BARREL, AND THE BARREL IS SCHEDULED FOR DELETION. `@/core/logging`
 * is a row in the reExportIndex ledger (ADR-022, amended 2026-08-31). When PL-31
 * retires it, all 53 importers move to `@/core/logging/debugLogger` and this mock
 * stops intercepting anything — getLogger() would throw suite-wide. That conversion
 * has to move this mock in the SAME commit.
 *
 * Not speculative: prerequisitesCacheManager.ts already imports the deep module, its
 * tests therefore cannot use this mock, and they carry their own — removing it fails
 * 14 tests with 'Logger not initialized'. Expect the ten suites under
 * tests/core/logging to need jest.unmock when the move happens; that was measured on
 * 2026-08-31, not guessed.
 */
jest.mock('@/core/logging', () => {
    const actual = jest.requireActual('@/core/logging');
    const shared = {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        show: jest.fn(),
        clear: jest.fn(),
    };
    return {
        ...actual,
        getLogger: jest.fn(() => shared),
        initializeLogger: jest.fn(),
    };
});
