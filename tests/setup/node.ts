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
 * BOTH IMPORT PATHS ARE MOCKED, SHARING ONE INSTANCE. That is what makes this
 * survive PL-31. `@/core/logging` is a re-export-only index and a row in the
 * reExportIndex ledger (ADR-022, amended 2026-08-31); when PL-31 retires it, its
 * 53 importers move to `@/core/logging/debugLogger`. An earlier version of this
 * mock targeted the barrel ALONE, so that conversion would have silently stopped
 * it intercepting anything and `getLogger()` would have thrown suite-wide.
 *
 * The cost of the single-path version was already being paid before PL-31.
 * `prerequisitesCacheManager.ts` imports the deep module, so its thirteen suites
 * could not use this mock and each carried its own hand-rolled logger. Covering
 * the deep path here deleted all thirteen (2026-08-31) — they were duplicating
 * this file because it did not reach them.
 *
 * A suite that wants to ASSERT on logging still mocks the module itself — a
 * per-file `jest.mock` is registered after this one and wins — and should now mock
 * whichever path its subject imports, since both are covered here. Reach the
 * canonical builder from inside such a factory with a lazy `require`; see
 * `tests/sop/canonical-fakes.test.ts` § "a jest.mock factory reaches the builder
 * too" for the idiom and the initialization-order trap.
 *
 * `...actual` on both keeps `DebugLogger`, `ErrorLogger` and `StepLogger` REAL, so
 * the suites in tests/core/logging that test those classes are unaffected. The one
 * exception is `debugLogger-core.test.ts`, which tests the real singleton and
 * therefore calls `jest.unmock('@/core/logging/debugLogger')` with its reason.
 *
 * Measured: 976 of 978 node suites passed untouched when the barrel mock was
 * adopted; the full suite (1,200) passes with the deep path added.
 */
const mockSharedLogger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    show: jest.fn(),
    clear: jest.fn(),
};

jest.mock('@/core/logging/debugLogger', () => {
    const actual = jest.requireActual('@/core/logging/debugLogger');
    return {
        ...actual,
        getLogger: jest.fn(() => mockSharedLogger),
        initializeLogger: jest.fn(),
    };
});


