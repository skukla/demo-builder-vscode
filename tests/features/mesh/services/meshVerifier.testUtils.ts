/**
 * Shared harness for the `meshVerifier` suite family.
 *
 * WHAT WAS ACTUALLY DUPLICATED. 122 lines matched across the two suites, and
 * almost none of it was worth sharing. Measured 2026-08-31 by deleting each mock
 * and re-running:
 *
 *   @/core/logging               NEEDED in the main suite (9 tests fail)
 *   @/core/utils/meshConfig      DEAD in both — deleted, not moved
 *   @/core/utils/timeoutConfig   DEAD in the DI suite — deleted, not moved
 *   @/core/di                    DEAD, but only once its one caller went — below
 *
 * THE `@/core/di` CHAIN IS WORTH READING. Both suites mocked it and both then
 * repeated three lines to install their command executor on the mocked
 * `ServiceLocator`. Deleting that wiring changed nothing: 25 tests still pass,
 * because both suites hand the executor DIRECTLY to the function or constructor
 * they are testing, which is the whole point of the DI suite. And with the
 * wiring gone the mock had no caller either — the only thing that had "needed"
 * it was the dead line itself. Six lines and a mock, existing to serve each
 * other.
 *
 * That is why "does this mock do anything?" has to be asked about the SET, not
 * one line at a time: probed individually, `@/core/di` looked load-bearing.
 *
 * What genuinely was duplicated: a hand-rolled `createMockProject` in each file,
 * a hand-rolled logger in each, and the executor fake. Those are here.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';


// `getLogger()` throws when the logger is uninitialised, and the non-DI entry
// points call it. The DI suite exists precisely to prove the service takes its
// logger by injection instead; this mock is what lets the OTHER suite run at all.
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

// Below the factories on purpose: they hoist above it, so the subject binds to
// the mocked modules. `import/first` is not a registered eslint rule here.
export {
    MeshVerifierService,
    verifyMeshDeployment,
    syncMeshStatus,
} from '@/features/mesh/services/meshVerifier';

/**
 * The executor type these suites hand in.
 *
 * My first version of this was `{ execute: jest.Mock }` — the shape both suites
 * actually used — and `tsc` rejected it at every call site, because the real
 * parameter is `CommandExecutor`. The old suites got away with it by typing the
 * local fake `any`. That is ADR-016 rule 2 in one incident: the cast was hiding a
 * fake that did not resemble the thing it stood for, and the canonical builder
 * exists precisely so nobody has to guess the ten-method surface.
 */
export type MeshCommandExecutorFake = ReturnType<typeof createMockCommandExecutor>;

/**
 * The canonical `Project` fixture, re-exported so both suites reach one shape.
 *
 * CONTENT over a canonical SHAPE (ADR-016 rule 3b). Both suites hand-rolled a
 * five-field `createMockProject` — the same name PL-16 measured as defined eight
 * times across three return types — and both got the shape wrong in the same
 * way: `created`/`lastModified` as Date OBJECTS, where a real manifest stores ISO
 * strings. Re-exported rather than wrapped, so every call site keeps its
 * signature and only the shape underneath changes.
 *
 * Each test still passes its own `componentInstances`, because what varies here
 * IS the mesh instance: present, absent, deployed, or missing its id. Note the
 * record is keyed by component id and the mesh is found by `subType: 'mesh'`.
 */
export { createMockProject } from '../../../helpers/projectFake';

/**
 * The per-test fixtures both suites build: a fresh logger and a fresh executor.
 *
 * Call from each spec's OWN `beforeEach` — a `beforeEach` declared here would not
 * apply to a module that imports it.
 *
 * `jest.clearAllMocks()` is here as hygiene, not because a test proves it: with
 * both fixtures rebuilt each time there is nothing left to leak today. It stays
 * because every other suite in this repo starts that way and a shared setup is
 * the wrong place to be clever.
 */
export function setupMeshVerifier(): {
    mockLogger: ReturnType<typeof createMockLogger>;
    mockCommandManager: MeshCommandExecutorFake;
} {
    jest.clearAllMocks();
    const mockLogger = createMockLogger();
    const mockCommandManager = createMockCommandExecutor();
    return { mockLogger, mockCommandManager };
}
