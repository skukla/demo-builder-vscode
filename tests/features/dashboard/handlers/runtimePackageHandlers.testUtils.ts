/**
 * The setup both runtimePackageHandlers suites share: the guard chain passing, the org
 * context running what it wraps, and the ServiceLocator handing out one command executor
 * the suites can compare against.
 *
 * IMPORT THIS BEFORE the handler under test; `jest.mock` hoists above the imports of the
 * module it appears in, not across modules. Each suite mocks the Runtime module it reads
 * itself (`runtimeNamespace` or `runtimeUndeclaredActions`), since the two answer
 * different things.
 */

import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/** The one executor the handler is given; suites assert it arrives unchanged. */
export const mockCommandExecutor = { execute: jest.fn() };

jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/core/shell/orgContextEnv', () => ({
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-stage' })),
    withOrgContext: jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn()),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => mockCommandExecutor) },
}));

/** A handler context whose state manager answers `project` as the current one. */
export function contextWith(project: Project | undefined) {
    const stateManager = createMockStateManager();
    stateManager.getCurrentProject.mockResolvedValue(project);
    return createMockHandlerContext({ stateManager });
}
