/**
 * Fixtures and builders shared by the projectResetService suites.
 *
 * No `jest.mock` here — the mocks stay in each suite so hoisting is not a
 * concern. What lives here is the SHAPE work: a stack, the two catalogue
 * definitions with a decoy in front of each, and the project/context builders.
 */

import type { Project } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import type { HandlerContext } from '@/types/handlers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export const REGISTRY = { components: { marker: 'registry' } };
export const STACK = {
    id: 'headless-paas',
    name: 'Headless',
    description: '',
    frontend: 'citisignal',
    backend: 'paas',
    dependencies: ['stack-dep'],
};

export const FRONTEND_DEF = {
    id: 'citisignal',
    name: 'CitiSignal',
    type: 'frontend',
    source: { type: 'git', url: 'https://github.com/adobe/citisignal.git', branch: 'main' },
} as unknown as TransformedComponentDefinition;
// Decoys sit FIRST in each section so a lookup that stops matching on id
// (`find(() => true)`) hands the orchestrator the wrong component.
export const DECOY_FRONTEND = { ...FRONTEND_DEF, id: 'other-frontend', name: 'Other' };
export const MESH_DEF = {
    id: 'commerce-mesh',
    name: 'Mesh',
    type: 'dependency',
    source: { type: 'git', url: 'https://github.com/adobe/mesh.git', branch: 'main' },
} as unknown as TransformedComponentDefinition;
export const DECOY_DEP = { ...MESH_DEF, id: 'other-dep', name: 'Other' };

export const commandManager = createMockCommandExecutor({ execute: jest.fn() });
export const authManager = createMockAuthenticationService({
    getCachedOrganization: jest.fn().mockReturnValue(undefined),
});

export function createResetProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/projects/demo',
        status: 'ready',
        selectedStack: 'headless-paas',
        componentSelections: { dependencies: ['commerce-mesh'] },
        componentInstances: {},
        adobe: { organization: 'org-1', projectId: 'p-1', workspace: 'w-1' },
        ...overrides,
    });
}

export function createResetHandlerContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
    });
}
