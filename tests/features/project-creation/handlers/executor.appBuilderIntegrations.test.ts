/**
 * Executor - App Builder Integrations Phase
 *
 * Unit tests for `executeAppBuilderIntegrationsPhase` — the creation-flow phase
 * that deploys each selected App Builder "integration" via the SHARED Model B
 * runner (`addAppBuilderComponent`). Mesh-kind selections install through the
 * mesh phase and MUST be excluded here.
 *
 * Every external boundary is mocked (catalog loader, runner, deps factory,
 * ServiceLocator permission gate) — no live Adobe/aio/git calls. Written BEFORE
 * the phase exists (strict RED).
 */

// ---- catalog loader (entry resolution) -------------------------------------
const mockGetAppBuilderComponentEntry = jest.fn();
const mockBuildCustomIntegrationEntry = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
    buildCustomIntegrationEntry: (...a: unknown[]) => mockBuildCustomIntegrationEntry(...a),
}));

// ---- Model B runner (the live engine — fully mocked) -----------------------
const mockAddAppBuilderComponent = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    addAppBuilderComponent: (...a: unknown[]) => mockAddAppBuilderComponent(...a),
}));

// ---- runner deps factory + context builder ---------------------------------
const mockBuildDefaultRunnerDeps = jest.fn(() => ({ _deps: true }));
const mockBuildRunnerDepsContext = jest.fn(async () => ({ _ctx: true }));
jest.mock('@/features/app-builder/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...(a as [])),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...(a as [])),
}));

// ---- permission gate -------------------------------------------------------
const mockTestDeveloperPermissions = jest.fn();
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: () => ({ testDeveloperPermissions: mockTestDeveloperPermissions }),
    },
}));

import { executeAppBuilderIntegrationsPhase } from '@/features/project-creation/handlers/executor';

const INTEGRATION_ENTRY = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync ERP',
    kind: 'integration' as const,
    source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
};

const MESH_ENTRY = {
    id: 'commerce-paas-mesh',
    name: 'API Mesh',
    description: 'Mesh',
    kind: 'mesh' as const,
    source: { owner: 'adobe', repo: 'mesh', branch: 'main' },
};

const context = {} as never;
const project = { name: 'demo' } as never;
const progressTracker = jest.fn();

function config(overrides: Record<string, unknown> = {}) {
    return { projectName: 'demo', ...overrides } as never;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockAddAppBuilderComponent.mockResolvedValue({ success: true });
    mockTestDeveloperPermissions.mockResolvedValue({ hasPermissions: true });
});

describe('executeAppBuilderIntegrationsPhase', () => {
    it('is a no-op when no integration ids are selected (no permission check)', async () => {
        await executeAppBuilderIntegrationsPhase(
            context, project, config({ selectedAppBuilderComponents: [] }), progressTracker,
        );

        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockTestDeveloperPermissions).not.toHaveBeenCalled();
    });

    it('deploys a single catalog integration via addAppBuilderComponent', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);

        await executeAppBuilderIntegrationsPhase(
            context, project, config({ selectedAppBuilderComponents: ['erp-sync'] }), progressTracker,
        );

        expect(mockTestDeveloperPermissions).toHaveBeenCalledTimes(1);
        expect(mockAddAppBuilderComponent).toHaveBeenCalledTimes(1);
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(
            project, INTEGRATION_ENTRY, expect.anything(),
        );
        // The API subscribe (union reconcile, inside the runner) is communicated.
        expect(progressTracker).toHaveBeenCalledWith(
            'Deploying Integrations',
            expect.any(Number),
            'Enabling API access...',
        );
    });

    it('resolves a custom-source id via buildCustomIntegrationEntry and deploys it', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const customEntry = { ...INTEGRATION_ENTRY, id: 'owner-custom-app' };
        mockBuildCustomIntegrationEntry.mockReturnValue(customEntry);

        await executeAppBuilderIntegrationsPhase(
            context,
            project,
            config({
                selectedAppBuilderComponents: ['owner-custom-app'],
                appBuilderComponentSources: {
                    'owner-custom-app': { owner: 'owner', repo: 'custom-app' },
                },
            }),
            progressTracker,
        );

        // The sources-map key travels as the explicit instance id (shell instancing).
        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalledWith(
            { owner: 'owner', repo: 'custom-app' },
            'owner-custom-app',
        );
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(project, customEntry, expect.anything());
    });

    it('deploys TWO shell-sourced instances under distinct ids and names', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        // Pass-through mirroring the real builder's instance-identity contract.
        mockBuildCustomIntegrationEntry.mockImplementation((source, id) => ({
            id,
            name: (source as { name?: string; repo: string }).name ?? (source as { repo: string }).repo,
            description: '',
            kind: 'integration' as const,
            source,
        }));

        await executeAppBuilderIntegrationsPhase(
            context,
            project,
            config({
                selectedAppBuilderComponents: ['order-sync', 'firefly-image-gen'],
                appBuilderComponentSources: {
                    'order-sync': {
                        owner: 'skukla', repo: 'app-builder-shell', name: 'Order Sync',
                    },
                    'firefly-image-gen': {
                        owner: 'skukla', repo: 'app-builder-shell', name: 'Firefly Image Gen',
                    },
                },
            }),
            progressTracker,
        );

        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalledWith(
            { owner: 'skukla', repo: 'app-builder-shell', name: 'Order Sync' },
            'order-sync',
        );
        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalledWith(
            { owner: 'skukla', repo: 'app-builder-shell', name: 'Firefly Image Gen' },
            'firefly-image-gen',
        );
        expect(mockAddAppBuilderComponent).toHaveBeenCalledTimes(2);
        const deployedEntries = mockAddAppBuilderComponent.mock.calls.map(
            (c) => c[1] as { id: string; name: string; kind: string },
        );
        expect(deployedEntries).toEqual([
            expect.objectContaining({ id: 'order-sync', name: 'Order Sync', kind: 'integration' }),
            expect.objectContaining({
                id: 'firefly-image-gen', name: 'Firefly Image Gen', kind: 'integration',
            }),
        ]);
    });

    it('excludes a mesh-kind selection (deploys nothing)', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(MESH_ENTRY);

        await executeAppBuilderIntegrationsPhase(
            context, project, config({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }), progressTracker,
        );

        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockTestDeveloperPermissions).not.toHaveBeenCalled();
    });

    it('throws when the developer-permission gate fails (never calls the runner)', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);
        mockTestDeveloperPermissions.mockResolvedValue({ hasPermissions: false, error: 'Developer access required' });

        await expect(
            executeAppBuilderIntegrationsPhase(
                context, project, config({ selectedAppBuilderComponents: ['erp-sync'] }), progressTracker,
            ),
        ).rejects.toThrow('Developer access required');

        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('throws with the runner error when a deployment fails', async () => {
        mockGetAppBuilderComponentEntry.mockReturnValue(INTEGRATION_ENTRY);
        mockAddAppBuilderComponent.mockResolvedValue({ success: false, error: 'clone failed' });

        await expect(
            executeAppBuilderIntegrationsPhase(
                context, project, config({ selectedAppBuilderComponents: ['erp-sync'] }), progressTracker,
            ),
        ).rejects.toThrow('clone failed');
    });
});
