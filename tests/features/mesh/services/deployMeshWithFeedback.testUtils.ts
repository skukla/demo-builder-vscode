/**
 * Shared setup for the deployMeshWithFeedback family (2 suites): the deploy's inputs.
 *
 * Both suites hand the deploy the same plain project and fakes. The mocks of
 * `deployMeshHeadless` and the panel pushes stay in each suite: a `jest.mock` only
 * hoists above the imports of the file it appears in.
 */

import type { DeployMeshWithFeedbackDeps } from '@/features/mesh/services/deployMeshWithFeedback';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/** The deploy's inputs for a plain project at `/p`, from an extension at `/ext`. */
export function deps(): DeployMeshWithFeedbackDeps {
    return {
        project: createMockProject({ name: 'p', path: '/p' }),
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
        extensionPath: '/ext',
        authManager: createMockAuthenticationService(),
        commandManager: createMockCommandExecutor(),
        secrets: undefined,
    };
}
