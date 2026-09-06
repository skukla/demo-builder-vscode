/**
 * Shared mock wall and fixtures for the setProjectDestination suites.
 *
 * Extracted when the second suite arrived (payloads, unchanged-detection, what
 * the move is handed) so both drive the handler through ONE set of collaborator
 * stubs. Importing this file is what registers them — the jest.mock calls below
 * run before the handler is loaded, exactly as they did when they lived inside
 * the single suite.
 */

export const mockProgressReport = jest.fn();
export const mockWithProgress = jest.fn(async (_o: unknown, task: (p: unknown) => unknown) =>
    task({ report: mockProgressReport })
);
jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: (...a: unknown[]) =>
                (mockWithProgress as (...x: unknown[]) => unknown)(...a),
        },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true }
);

export const mockMove = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentMigration', () => ({
    moveAppBuilderComponentsToDestination: (...a: unknown[]) => mockMove(...a),
}));

export const mockRunGuards = jest.fn();
/** Typed with rest args so a suite can read the progress relay it is handed. */
export const mockBuildDefaultRunnerDeps = jest.fn((..._a: unknown[]) => ({ catalog: [] }));
export const mockBuildRunnerDepsContext = jest.fn(async (..._a: unknown[]) => ({}));
export const mockPostRowStatus = jest.fn(async () => undefined);
export const mockPostComponentsSnapshot = jest.fn(async () => undefined);
export const mockPostDestination = jest.fn(async () => undefined);
export const mockPostMeshStatus = jest.fn(async () => undefined);
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: (...a: unknown[]) => mockRunGuards(...a),
    postRowStatus: (...a: unknown[]) => mockPostRowStatus(...(a as [])),
    postComponentsSnapshot: (...a: unknown[]) => mockPostComponentsSnapshot(...(a as [])),
    postDestination: (...a: unknown[]) => mockPostDestination(...(a as [])),
    postMeshStatus: (...a: unknown[]) => mockPostMeshStatus(...(a as [])),
}));
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...(a as [])),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...(a as [])),
}));

import type { TokenManager } from '@/features/authentication/services/tokenManager';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

export const EXISTING_ADOBE = {
    organization: '285361',
    organizationName: 'Adobe Demo System',
    projectId: 'old-project-id',
    projectName: 'OldProject',
    projectTitle: 'Old Project',
    workspace: 'old-workspace-id',
    workspaceName: 'Stage',
    workspaceTitle: 'Stage',
};

export const NEW_DESTINATION = {
    project: { id: 'new-project-id', name: 'NewProject', title: 'New Project' },
    workspace: { id: 'new-workspace-id', name: 'Production', title: 'Production' },
};

/** A handler context over a project carrying the given `adobe` binding. */
export function makeContext(adobe: Record<string, unknown> | undefined = EXISTING_ADOBE) {
    const project = { name: 'demo', path: '/p/demo', adobe: adobe ? { ...adobe } : undefined };
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const context = createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
    });
    return { context, project, saveProject };
}

/** A handler context over a project whose keyed map holds the given components. */
export function makeContextWithComponents(
    components: Record<string, { kind: string; status?: string }>
) {
    const project = {
        name: 'demo',
        path: '/p/demo',
        adobe: { ...EXISTING_ADOBE },
        appBuilderComponents: components,
    };
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const context = createMockHandlerContext({
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
    });
    return { context, project, saveProject };
}

/** Every step message the progress notification was given, in order. */
export function reportedSteps(): string[] {
    return mockProgressReport.mock.calls.map((c) => (c[0] as { message: string }).message);
}

/**
 * ADR-015 (2026-08-28): this handler resolves the shared services from the REAL
 * registry when assembling runner deps (no module mock reaches these suites),
 * and the shared node setup empties it after every test — so seed per-test.
 */
export function seedServiceLocator(): void {
    ServiceLocator.setAuthenticationService(
        createMockAuthenticationService({
            getTokenManager: jest.fn(
                () =>
                    ({
                        inspectToken: jest.fn(async () => ({ valid: false })),
                    }) as unknown as TokenManager
            ),
            getCachedOrganization: jest.fn(),
            getS2SDeployCredentials: jest.fn(),
        })
    );
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
}

/** The per-suite reset every destination suite shares. */
export function resetDestinationMocks(): void {
    jest.clearAllMocks();
    mockRunGuards.mockResolvedValue(undefined);
    mockMove.mockResolvedValue({ success: true, moved: [], failed: [] });
    seedServiceLocator();
}
