/**
 * Shared setup for the `componentManager` suite family (7 suites).
 *
 * `fs/promises` STAYS IN EACH SPEC and cannot move. Deleting it fails 41 tests, so it
 * is load-bearing — but each spec imports `fs/promises` itself, and a `jest.mock`
 * only hoists above the imports of the module it appears in. Moved to a shared file
 * it registers too late and the spec has already bound the real module. Measured in
 * the deployMesh family, where exactly that failed 23 tests on
 * `access.mockResolvedValue is not a function`.
 *
 *   A shared harness can own a mock for a module the SUBJECT imports, but not for
 *   one the SPEC imports.
 *
 * `@/core/di/serviceLocator` WAS ALSO MOCKED, in all seven — and it is gone. Probed
 * on its own it looked essential: all 70 tests fail without it. Then the wiring line
 * it existed for turned out to be dead. `ComponentManager` takes its executor by
 * CONSTRUCTOR, so pointing the mocked locator at that same executor changed nothing;
 * with the line removed, the mock had no caller either. Seven declarations and one
 * wiring line, existing to serve each other. Same shape as the meshVerifier family,
 * which is why the probe has to be run on the SET and not one line at a time.
 *
 * So what moves here is the wiring the seven suites repeated: build the three fakes,
 * construct the manager, and give the executor a default success.
 *
 * The fakes themselves are already canonical — `testHelpers.ts` beside this file
 * re-exports `createMockLogger` and `createMockCommandExecutor` from
 * `tests/helpers/`. This builds on that rather than beside it.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import {
    createComponentServiceProject,
    createMockCommandExecutor,
    createMockLogger,
    mockSuccessfulExecution,
} from './testHelpers';
import { ComponentManager } from '@/features/components/services/componentManager';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

export { ComponentManager };

/**
 * The per-test wiring all seven suites repeat.
 *
 * Call from each spec's OWN `beforeEach` — a `beforeEach` declared here would not
 * apply to a module that imports it. The spec must also carry its own
 * `jest.mock('@/core/di/serviceLocator')`; this function only USES the mock, which
 * is why it works from here.
 *
 * `mockSuccessfulExecution` gives the executor a default success result: most tests
 * here are about what the manager does with a working command, and the ones that
 * are not override it.
 */
export function setupComponentManager(): {
    componentManager: ComponentManager;
    mockLogger: Logger;
    mockProject: Project;
    mockCommandExecutor: CommandExecutor;
} {
    jest.clearAllMocks();

    const mockLogger = createMockLogger();
    const mockProject = createComponentServiceProject();
    const mockCommandExecutor = createMockCommandExecutor();

    mockSuccessfulExecution(mockCommandExecutor);

    return {
        componentManager: new ComponentManager(mockLogger, mockCommandExecutor),
        mockLogger,
        mockProject,
        mockCommandExecutor,
    };
}
