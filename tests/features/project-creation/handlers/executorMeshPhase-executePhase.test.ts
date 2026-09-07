/**
 * `executeMeshPhase` — the four-way mesh decision.
 *
 * Phase 3 picks exactly one of: reuse an imported mesh, link the wizard's
 * existing-mesh config, reuse the edited project's mesh, or deploy a fresh one.
 * Every test below asserts WHICH collaborator ran and WHAT it was handed, because
 * the branch conditions read fields (`importedWorkspaceId`, `adobe.workspace`,
 * `meshComponent.path`) that a mock cannot see being passed wrongly.
 */

const mockCommandExecutor = { execute: jest.fn() };
const mockAuthService = {
    isAuthenticated: jest.fn(),
    loginAndRestoreProjectContext: jest.fn(),
    getCachedOrganization: jest.fn(),
    testDeveloperPermissions: jest.fn(),
};
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: () => mockCommandExecutor,
        getAuthenticationService: () => mockAuthService,
    },
}));

const mockProjectRequiresAppBuilder = jest.fn();
jest.mock('@/features/components/services/projectAppBuilderPredicate', () => ({
    projectRequiresAppBuilder: (...args: unknown[]) => mockProjectRequiresAppBuilder(...args),
}));

const mockDeployNewMesh = jest.fn();
const mockLinkExistingMesh = jest.fn();
const mockShouldConfigureExistingMesh = jest.fn();
jest.mock('@/features/project-creation/services/meshSetupService', () => ({
    deployNewMesh: (...args: unknown[]) => mockDeployNewMesh(...args),
    linkExistingMesh: (...args: unknown[]) => mockLinkExistingMesh(...args),
    shouldConfigureExistingMesh: (...args: unknown[]) => mockShouldConfigureExistingMesh(...args),
}));

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

import { executeMeshPhase } from './executorMeshPhase.testUtils';
import { createMockLogger } from './executorMeshPhase.testUtils';
import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import type { ProgressTracker } from '@/features/project-creation/handlers/shared';
import type { ComponentInstance, Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { TransformedComponentDefinition } from '@/types/components';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const MESH_ID = 'commerce-mesh';
const MESH_PATH = '/projects/demo/components/commerce-mesh';

const meshDefinition: TransformedComponentDefinition = {
    id: MESH_ID,
    name: 'API Mesh',
    type: 'dependency',
    subType: 'mesh',
};

function meshInstance(overrides: Partial<ComponentInstance> = {}): ComponentInstance {
    return {
        id: MESH_ID,
        name: 'Commerce API Mesh',
        type: 'dependency',
        subType: 'mesh',
        status: 'ready',
        path: MESH_PATH,
        lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

/** A project that HAS a mesh component but no deployed endpoint. */
function projectWithMesh(overrides: Partial<ComponentInstance> = {}): Project {
    const instance = meshInstance(overrides);
    return createMockProject({ componentInstances: { [instance.id]: instance } });
}

/** A project whose mesh is already deployed (keyed accessor, ADR-011 D3). */
function projectWithDeployedMesh(endpoint: string, meshId?: string): Project {
    return createMockProject({
        componentInstances: {
            [MESH_ID]: meshInstance(meshId ? { metadata: { meshId } } : {}),
        },
        appBuilderComponents: {
            mesh: {
                kind: 'mesh',
                status: 'deployed',
                source: { owner: '', repo: '' },
                endpoint,
            },
        },
    });
}

function createContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        authManager: mockAuthService as unknown as HandlerContext['authManager'],
        sharedState: { isAuthenticating: false, currentPrerequisiteStates: new Map() },
    });
}

interface RunOptions {
    project?: Project;
    config?: ProjectCreationConfig;
    definitions?: Map<string, ComponentDefinitionEntry>;
    isEditMode?: string | boolean | undefined;
    existingProject?: Project;
}

const progressTracker: ProgressTracker = jest.fn();

async function run(options: RunOptions = {}) {
    const context = createContext();
    const project = options.project ?? projectWithMesh();
    const config: ProjectCreationConfig = options.config ?? { projectName: 'demo' };
    const setupContext = new ProjectSetupContext(
        context,
        { version: '1.0.0', components: { frontends: [], backends: [], dependencies: [] } },
        project,
        config
    );
    const definitions =
        options.definitions ??
        new Map<string, ComponentDefinitionEntry>([
            [MESH_ID, { definition: meshDefinition } as ComponentDefinitionEntry],
        ]);

    await executeMeshPhase(
        context,
        setupContext,
        project,
        config,
        definitions,
        progressTracker,
        options.isEditMode,
        options.existingProject
    );

    return { context, project, config, setupContext };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockProjectRequiresAppBuilder.mockReturnValue(false);
    mockShouldConfigureExistingMesh.mockReturnValue(false);
    mockDeployNewMesh.mockResolvedValue(undefined);
    mockLinkExistingMesh.mockResolvedValue(undefined);
    mockAuthService.isAuthenticated.mockResolvedValue(true);
    mockAuthService.loginAndRestoreProjectContext.mockResolvedValue(true);
    mockAuthService.getCachedOrganization.mockReturnValue(undefined);
    mockAuthService.testDeveloperPermissions.mockResolvedValue({ hasPermissions: true });
    mockWithOrgContext.mockImplementation((_target, fn) => fn());
});

describe('executeMeshPhase — the App Builder permission gate', () => {
    it('asks the predicate about this project and this registry', async () => {
        const { project, setupContext } = await run();

        expect(mockProjectRequiresAppBuilder).toHaveBeenCalledWith(project, setupContext.registry);
    });

    it('skips the permission check entirely when no component needs App Builder', async () => {
        mockAuthService.testDeveloperPermissions.mockResolvedValue({
            hasPermissions: false,
            error: 'the gate should not have run',
        });

        await expect(run()).resolves.toBeDefined();
        expect(mockAuthService.testDeveloperPermissions).not.toHaveBeenCalled();
    });

    it('throws the permission service’s own error and deploys nothing', async () => {
        mockProjectRequiresAppBuilder.mockReturnValue(true);
        mockAuthService.testDeveloperPermissions.mockResolvedValue({
            hasPermissions: false,
            error: 'Org 123 has no App Builder entitlement',
        });

        await expect(run()).rejects.toThrow('Org 123 has no App Builder entitlement');
        expect(mockDeployNewMesh).not.toHaveBeenCalled();
        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
    });

    it('falls back to the standard guidance when the service gives no error', async () => {
        mockProjectRequiresAppBuilder.mockReturnValue(true);
        mockAuthService.testDeveloperPermissions.mockResolvedValue({ hasPermissions: false });

        await expect(run()).rejects.toThrow(
            'Your account lacks Developer or System Admin role for this organization. ' +
                'API Mesh deployment requires App Builder access. ' +
                'Please select a different organization or contact your administrator.'
        );
    });

    it('carries on with the mesh decision once the gate passes', async () => {
        mockProjectRequiresAppBuilder.mockReturnValue(true);

        await run();

        expect(mockAuthService.testDeveloperPermissions).toHaveBeenCalledTimes(1);
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });
});

describe('executeMeshPhase — reusing an imported mesh', () => {
    const importConfig: ProjectCreationConfig = {
        projectName: 'demo',
        importedWorkspaceId: 'ws-789',
        importedMeshEndpoint: 'https://imported.adobe.io/graphql',
        adobe: { organization: 'org-123', projectId: 'proj-456', workspace: 'ws-789' },
    };

    it('links the imported endpoint when the imported workspace IS the selected one', async () => {
        await run({ config: importConfig });

        expect(mockDeployNewMesh).not.toHaveBeenCalled();
        expect(mockLinkExistingMesh).toHaveBeenCalledTimes(1);
        expect(mockLinkExistingMesh.mock.calls[0][1]).toStrictEqual({
            endpoint: 'https://imported.adobe.io/graphql',
            meshId: '',
            meshStatus: 'deployed',
            workspace: 'ws-789',
        });
    });

    it('hands mesh setup its collaborators, not an empty context', async () => {
        const { setupContext } = await run({ config: importConfig });

        const meshContext = mockLinkExistingMesh.mock.calls[0][0];
        expect(meshContext.setupContext).toBe(setupContext);
        expect(meshContext.commandManager).toBe(mockCommandExecutor);
        expect(meshContext.authManager).toBe(mockAuthService);
        expect(meshContext.meshDefinition).toBe(meshDefinition);
        expect(meshContext.progressTracker).toBe(progressTracker);
        expect(typeof meshContext.onMeshCreated).toBe('function');
    });

    it('records the workspace on shared state when mesh setup reports one created', async () => {
        const { context } = await run({ config: importConfig });

        mockLinkExistingMesh.mock.calls[0][0].onMeshCreated('ws-created');

        expect(context.sharedState.meshCreatedForWorkspace).toBe('ws-created');
    });

    it('deploys instead when the imported workspace is NOT the selected one', async () => {
        await run({ config: { ...importConfig, importedWorkspaceId: 'ws-other' } });

        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });

    it('deploys instead when the import carries a workspace but no endpoint', async () => {
        await run({ config: { ...importConfig, importedMeshEndpoint: undefined } });

        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });

    it('deploys instead when an import exists but no Adobe workspace is selected', async () => {
        await run({
            config: {
                projectName: 'demo',
                importedWorkspaceId: 'ws-789',
                importedMeshEndpoint: 'https://imported.adobe.io/graphql',
            },
        });

        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });

    it('does not read an import branch into a config that imported nothing', async () => {
        await run({ config: { projectName: 'demo' } });

        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });
});

describe('executeMeshPhase — linking the wizard’s existing-mesh config', () => {
    it('asks the service with the wizard config and the project’s own endpoint', async () => {
        const apiMesh = { meshId: 'mesh-1', endpoint: 'https://wizard.adobe.io/graphql' };
        mockShouldConfigureExistingMesh.mockReturnValue(true);

        await run({
            project: projectWithDeployedMesh('https://already.adobe.io/graphql'),
            config: { projectName: 'demo', apiMesh },
        });

        expect(mockShouldConfigureExistingMesh).toHaveBeenCalledWith(
            apiMesh,
            'https://already.adobe.io/graphql'
        );
        expect(mockLinkExistingMesh).toHaveBeenCalledTimes(1);
        expect(mockLinkExistingMesh.mock.calls[0][1]).toBe(apiMesh);
        expect(mockDeployNewMesh).not.toHaveBeenCalled();
    });
});

describe('executeMeshPhase — reusing the edited project’s mesh', () => {
    const editConfig: ProjectCreationConfig = {
        projectName: 'demo',
        adobe: { organization: 'org-123', projectId: 'proj-456', workspace: 'ws-789' },
    };

    it('links the existing project’s endpoint and mesh id in edit mode', async () => {
        await run({
            config: editConfig,
            isEditMode: true,
            existingProject: projectWithDeployedMesh('https://existing.adobe.io/graphql', 'mesh-abc'),
        });

        expect(mockDeployNewMesh).not.toHaveBeenCalled();
        expect(mockLinkExistingMesh.mock.calls[0][1]).toStrictEqual({
            endpoint: 'https://existing.adobe.io/graphql',
            meshId: 'mesh-abc',
            meshStatus: 'deployed',
            workspace: 'ws-789',
        });
    });

    it('records an empty mesh id when the existing instance carries none', async () => {
        await run({
            config: editConfig,
            isEditMode: true,
            existingProject: projectWithDeployedMesh('https://existing.adobe.io/graphql'),
        });

        expect(mockLinkExistingMesh.mock.calls[0][1].meshId).toBe('');
    });

    it('reuses the mesh even when no Adobe workspace has been selected', async () => {
        await run({
            config: { projectName: 'demo' },
            isEditMode: true,
            existingProject: projectWithDeployedMesh('https://existing.adobe.io/graphql', 'mesh-abc'),
        });

        expect(mockLinkExistingMesh.mock.calls[0][1]).toStrictEqual({
            endpoint: 'https://existing.adobe.io/graphql',
            meshId: 'mesh-abc',
            meshStatus: 'deployed',
            workspace: undefined,
        });
    });

    it('does NOT reuse the existing project’s mesh outside edit mode', async () => {
        await run({
            config: editConfig,
            isEditMode: false,
            existingProject: projectWithDeployedMesh('https://existing.adobe.io/graphql', 'mesh-abc'),
        });

        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
    });
});

describe('executeMeshPhase — deploying a fresh mesh', () => {
    it('deploys inside the org-context wrapper when the component and its definition exist', async () => {
        const apiMesh = { meshId: 'mesh-1' };

        await run({ config: { projectName: 'demo', apiMesh } });

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        expect(mockDeployNewMesh).toHaveBeenCalledTimes(1);
        expect(mockDeployNewMesh.mock.calls[0][1]).toBe(apiMesh);
    });

    it('does nothing when the mesh component has no catalog definition', async () => {
        await run({ definitions: new Map<string, ComponentDefinitionEntry>() });

        expect(mockDeployNewMesh).not.toHaveBeenCalled();
        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
    });

    it('does nothing when the project has no mesh component at all', async () => {
        await run({ project: createMockProject({ componentInstances: {} }) });

        expect(mockDeployNewMesh).not.toHaveBeenCalled();
        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
    });

    it('does nothing when the mesh component was never cloned to a path', async () => {
        await run({ project: projectWithMesh({ path: undefined }) });

        expect(mockDeployNewMesh).not.toHaveBeenCalled();
        expect(mockLinkExistingMesh).not.toHaveBeenCalled();
    });
});
