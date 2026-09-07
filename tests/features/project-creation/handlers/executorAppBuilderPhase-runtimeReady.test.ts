/**
 * Executor - App Builder phase: Runtime pre-flight
 *
 * Unit tests for `ensureWorkspaceRuntimeReady` — the step that provisions an
 * Adobe I/O Runtime namespace for the deploy workspace BEFORE any App Builder
 * app or mesh is deployed (the no-orphan guarantee).
 *
 * The decisions under test are the three gates it makes before touching Adobe:
 * is there a deployable app at all, are org/project/workspace all known, and is
 * the provision callback actually threaded through `withOrgContext` into
 * `ensureWorkspaceRuntime`. Every collaborator is mocked and the assertions are
 * on the ARGUMENTS each receives, because a mock cannot see a malformed call.
 */

// ---- catalog loader (entry resolution) -------------------------------------
const mockGetAppBuilderComponentEntry = jest.fn();
const mockBuildCustomIntegrationEntry = jest.fn();
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    buildCustomIntegrationEntry: (...a: unknown[]) => mockBuildCustomIntegrationEntry(...a),
}));

// ---- org targeting ---------------------------------------------------------
const ORG_TARGET = { orgId: 'org-1@AdobeOrg', projectId: 'proj-1', workspaceId: 'ws-1' };
const mockBuildDeployOrgTarget = jest.fn(() => ORG_TARGET);
jest.mock('@/features/project-creation/handlers/executorMeshPhase', () => ({
    buildDeployOrgTarget: (...a: unknown[]) => mockBuildDeployOrgTarget(...(a as [])),
}));

// The wrapper RUNS its callback — an arrow that is never invoked would otherwise
// be indistinguishable from the real one.
const mockWithOrgContext = jest.fn(async (_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    withOrgContext: (...a: unknown[]) =>
        mockWithOrgContext(a[0], a[1] as () => Promise<unknown>),
}));

// ---- runtime provisioning --------------------------------------------------
const mockEnsureWorkspaceRuntime = jest.fn(
    async (
        _commandManager: unknown,
        _logger: unknown,
        _nodeVersion: string,
        provision: () => Promise<void>,
    ) => {
        await provision();
    },
);
jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    ensureWorkspaceRuntime: (...a: unknown[]) =>
        mockEnsureWorkspaceRuntime(
            a[0],
            a[1],
            a[2] as string,
            a[3] as () => Promise<void>,
        ),
}));

// ---- services --------------------------------------------------------------
const mockEnsureWorkspaceRuntimeNamespace = jest.fn(async () => undefined);
const mockCommandExecutor = { execute: jest.fn() };
const mockAuthService = {
    ensureWorkspaceRuntimeNamespace: mockEnsureWorkspaceRuntimeNamespace,
};
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: () => mockAuthService,
        getCommandExecutor: () => mockCommandExecutor,
    },
}));

import { ensureWorkspaceRuntimeReady } from '@/features/project-creation/handlers/executorAppBuilderPhase';
import type { AdobeConfig } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const INTEGRATION_ENTRY = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync ERP',
    kind: 'integration' as const,
    source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
};

const MESH_ENTRY = { ...INTEGRATION_ENTRY, id: 'commerce-paas-mesh', kind: 'mesh' as const };

const ADOBE: AdobeConfig = {
    organization: 'org-1@AdobeOrg',
    projectId: 'proj-1',
    workspace: 'ws-1',
};

const context = createMockHandlerContext();

function config(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    return { projectName: 'demo', adobe: ADOBE, ...overrides };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockBuildDeployOrgTarget.mockReturnValue(ORG_TARGET);
    mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
    mockBuildCustomIntegrationEntry.mockReturnValue(undefined);
});

describe('ensureWorkspaceRuntimeReady — when it does nothing', () => {
    it('skips provisioning when nothing is selected, even with a complete adobe block', async () => {
        await ensureWorkspaceRuntimeReady(context, config({ selectedAppBuilderComponents: [] }));

        expect(mockEnsureWorkspaceRuntime).not.toHaveBeenCalled();
        expect(mockWithOrgContext).not.toHaveBeenCalled();
    });

    it('treats an ABSENT selection list as empty rather than as one unnamed entry', async () => {
        // The `?? []` fallback: were it any non-empty array, this resolves to a
        // deployable entry and provisions a namespace for a project selecting nothing.
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);

        await ensureWorkspaceRuntimeReady(context, config());

        expect(mockEnsureWorkspaceRuntime).not.toHaveBeenCalled();
    });

    it('skips provisioning for a mesh-only selection (a mesh needs no Runtime namespace)', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(MESH_ENTRY);

        await ensureWorkspaceRuntimeReady(
            context,
            config({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }),
        );

        expect(mockEnsureWorkspaceRuntime).not.toHaveBeenCalled();
    });

    it('ignores an id that resolves to neither a catalog entry nor a custom source', async () => {
        await expect(
            ensureWorkspaceRuntimeReady(
                context,
                config({ selectedAppBuilderComponents: ['ghost'] }),
            ),
        ).resolves.toBeUndefined();

        expect(mockEnsureWorkspaceRuntime).not.toHaveBeenCalled();
    });

    it('skips provisioning when the config carries no adobe block at all', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);

        await expect(
            ensureWorkspaceRuntimeReady(context, {
                projectName: 'demo',
                selectedAppBuilderComponents: ['erp-sync'],
            }),
        ).resolves.toBeUndefined();

        expect(mockEnsureWorkspaceRuntime).not.toHaveBeenCalled();
    });

    it.each([
        ['organization', { projectId: 'proj-1', workspace: 'ws-1' }],
        ['projectId', { organization: 'org-1@AdobeOrg', workspace: 'ws-1' }],
        ['workspace', { organization: 'org-1@AdobeOrg', projectId: 'proj-1' }],
    ])('skips provisioning when adobe.%s is missing', async (_field, adobe) => {
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);

        await ensureWorkspaceRuntimeReady(
            context,
            config({ adobe: adobe as AdobeConfig, selectedAppBuilderComponents: ['erp-sync'] }),
        );

        expect(mockEnsureWorkspaceRuntime).not.toHaveBeenCalled();
    });
});

describe('ensureWorkspaceRuntimeReady — when a deployable app is selected', () => {
    beforeEach(() => {
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);
    });

    it('runs the namespace check inside the deploy org target', async () => {
        await ensureWorkspaceRuntimeReady(
            context,
            config({ selectedAppBuilderComponents: ['erp-sync'] }),
        );

        expect(mockBuildDeployOrgTarget).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ adobe: ADOBE }),
        );
        expect(mockWithOrgContext).toHaveBeenCalledWith(ORG_TARGET, expect.any(Function));
        expect(mockEnsureWorkspaceRuntime).toHaveBeenCalledWith(
            mockCommandExecutor,
            context.logger,
            'auto',
            expect.any(Function),
        );
    });

    it('provisions through the SDK with the workspace ids, not through the CLI target', async () => {
        await ensureWorkspaceRuntimeReady(
            context,
            config({ selectedAppBuilderComponents: ['erp-sync'] }),
        );

        expect(mockEnsureWorkspaceRuntimeNamespace).toHaveBeenCalledWith(
            'org-1@AdobeOrg',
            'proj-1',
            'ws-1',
        );
    });

    it('resolves a custom-source id and provisions for it too', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        mockBuildCustomIntegrationEntry.mockReturnValue({
            ...INTEGRATION_ENTRY,
            id: 'owner-custom-app',
        });

        await ensureWorkspaceRuntimeReady(
            context,
            config({
                selectedAppBuilderComponents: ['owner-custom-app'],
                appBuilderComponentSources: {
                    'owner-custom-app': { owner: 'owner', repo: 'custom-app' },
                },
            }),
        );

        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalledWith(
            { owner: 'owner', repo: 'custom-app' },
            'owner-custom-app',
        );
        expect(mockEnsureWorkspaceRuntimeNamespace).toHaveBeenCalledTimes(1);
    });
});
