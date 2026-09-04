/**
 * projectResetService — the full reset flow (`resetProjectWithUI`) and the
 * component-definition rebuild it runs first.
 *
 * WRITTEN 2026-09-04 (PL-22, MUT-08). Both were untested: 174 mutants sat
 * uncovered, every one of them a decision a refactor could flip with the suite
 * green. The rebuild is private, so it is pinned through what it HANDS the
 * orchestrator — the `componentDefinitions` map on the install context — which
 * is what a cast or a mock would have hidden.
 *
 * What is asserted:
 *  - the dialog's answer gates everything; a running/starting demo is stopped
 *    first; status goes 'resetting' and is restored on the error path
 *  - the rebuilt definitions: frontend source restored from the saved instance,
 *    a dashboard-added App Builder app rebuilt from its instance, the
 *    catalogue-wide fallback, and the two skips (not found, no source)
 *  - the orchestrator context, the .env regeneration inputs, the components
 *    directory removed, and the final status/result
 */

import type { Project } from '@/types/base';

const mockRm = jest.fn();
jest.mock('fs/promises', () => ({ rm: (...a: unknown[]) => mockRm(...a) }));

const mockGetFrontends = jest.fn();
const mockGetDependencies = jest.fn();
const mockGetComponentById = jest.fn();
const mockLoadRegistry = jest.fn();
const mockGetComponentRegistryManager = jest.fn((..._a: unknown[]) => ({
    loadRegistry: mockLoadRegistry,
    getFrontends: mockGetFrontends,
    getDependencies: mockGetDependencies,
    getComponentById: mockGetComponentById,
}));
jest.mock('@/features/components/services/componentRegistryInstance', () => ({
    getComponentRegistryManager: (...a: unknown[]) => mockGetComponentRegistryManager(...a),
}));

const mockGetStackById = jest.fn();
jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStackById: (...a: unknown[]) => mockGetStackById(...a),
}));

const mockCloneAllComponents = jest.fn();
const mockInstallAllComponents = jest.fn();
jest.mock('@/features/project-creation/services/componentInstallationOrchestrator', () => ({
    cloneAllComponents: (...a: unknown[]) => mockCloneAllComponents(...a),
    installAllComponents: (...a: unknown[]) => mockInstallAllComponents(...a),
}));

const mockRegenerateProjectEnvFiles = jest.fn();
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    regenerateProjectEnvFiles: (...a: unknown[]) => mockRegenerateProjectEnvFiles(...a),
}));

// No mesh component by default: the mesh leg has its own suite
// (projectResetService-meshContext). One test here flips it on to pin the
// early return and the success wording.
const mockGetMeshComponentInstance = jest.fn();
jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: (...a: unknown[]) => mockGetMeshComponentInstance(...a),
}));
const mockEnsureProjectAdobeContext = jest.fn();
jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: (...a: unknown[]) => mockEnsureProjectAdobeContext(...a),
}));
const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (t: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(t, fn),
}));
const mockDeployMeshCreateOrUpdate = jest.fn();
jest.mock('@/features/mesh/services/meshRedeploy', () => ({
    deployMeshCreateOrUpdate: (...a: unknown[]) => mockDeployMeshCreateOrUpdate(...a),
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn(),
}));

const mockSleep = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@/core/utils/sleep', () => ({ sleep: (...a: unknown[]) => mockSleep(...a) }));

import * as vscode from 'vscode';
import { resetProjectWithUI } from '@/features/lifecycle/services/projectResetService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    FRONTEND_DEF,
    MESH_DEF,
    DECOY_FRONTEND,
    DECOY_DEP,
    REGISTRY,
    STACK,
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
} from './projectResetService.testUtils';

const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const withProgress = vscode.window.withProgress as jest.Mock;
const executeCommand = vscode.commands.executeCommand as jest.Mock;

function run(project = createResetProject(), context = createResetHandlerContext(), logPrefix?: string) {
    return resetProjectWithUI({ project, context, logPrefix, commandManager, authManager });
}

/** The definitions the orchestrator was handed, as a plain object for `toEqual`. */
function handedDefinitions(): Record<string, unknown> {
    const ctx = mockCloneAllComponents.mock.calls[0][0] as {
        componentDefinitions: Map<string, unknown>;
    };
    return Object.fromEntries(ctx.componentDefinitions);
}

let progressReport: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    progressReport = jest.fn();
    withProgress.mockImplementation(async (_o: unknown, task: (p: unknown) => Promise<unknown>) =>
        task({ report: progressReport }),
    );
    showWarningMessage.mockResolvedValue('Reset Project');
    mockRm.mockResolvedValue(undefined);
    mockLoadRegistry.mockResolvedValue(REGISTRY);
    mockGetStackById.mockReturnValue(STACK);
    mockGetFrontends.mockResolvedValue([DECOY_FRONTEND, FRONTEND_DEF]);
    mockGetDependencies.mockResolvedValue([DECOY_DEP, MESH_DEF]);
    mockGetComponentById.mockResolvedValue(undefined);
    mockCloneAllComponents.mockResolvedValue(undefined);
    mockInstallAllComponents.mockResolvedValue(undefined);
    mockRegenerateProjectEnvFiles.mockResolvedValue(undefined);
    mockGetMeshComponentInstance.mockReturnValue(undefined);
    mockEnsureProjectAdobeContext.mockResolvedValue({ ready: true });
    mockDeployMeshCreateOrUpdate.mockResolvedValue({
        success: true,
        data: { endpoint: 'https://mesh.example/graphql' },
    });
});

describe('resetProjectWithUI — the gate and the demo stop', () => {
    it('asks the SC with a modal naming the project, and does nothing when they decline', async () => {
        showWarningMessage.mockResolvedValue(undefined);
        const project = createResetProject();
        const context = createResetHandlerContext();

        await expect(run(project, context)).resolves.toEqual({ success: false, cancelled: true });

        expect(showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('reset "demo"'),
            { modal: true },
            'Reset Project',
        );
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockCloneAllComponents).not.toHaveBeenCalled();
        expect(project.status).toBe('ready');
    });

    it.each(['running', 'starting'] as const)(
        'stops a %s demo before touching the project',
        async (status) => {
            const project = createResetProject({ status });
            const context = createResetHandlerContext();

            await run(project, context);

            expect(executeCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');
            expect(executeCommand.mock.invocationCallOrder[0]).toBeLessThan(
                (context.stateManager.saveProject as jest.Mock).mock.invocationCallOrder[0],
            );
        },
    );

    it.each(['ready', 'stopped', 'error'] as const)(
        'does NOT issue a stop for a %s demo',
        async (status) => {
            await run(createResetProject({ status }));

            expect(executeCommand).not.toHaveBeenCalled();
        },
    );

    it('marks the project resetting and saves it BEFORE the progress notification opens', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();
        const seen: string[] = [];
        (context.stateManager.saveProject as jest.Mock).mockImplementation(async (p: Project) => {
            seen.push(p.status);
        });

        await run(project, context);

        expect(seen[0]).toBe('resetting');
        expect((context.stateManager.saveProject as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
            withProgress.mock.invocationCallOrder[0],
        );
        expect(withProgress).toHaveBeenCalledWith(
            { location: vscode.ProgressLocation.Notification, title: 'Resetting Project', cancellable: false },
            expect.any(Function),
        );
    });
});

describe('resetProjectWithUI — rebuilding the component definitions', () => {
    it('reads the registry from the extension path and resolves the saved stack', async () => {
        await run();

        expect(mockGetComponentRegistryManager).toHaveBeenCalledWith('/test/extension/path');
        expect(mockGetStackById).toHaveBeenCalledWith('headless-paas');
    });

    it('fails the reset when the saved stack is unknown, restoring the status', async () => {
        mockGetStackById.mockReturnValue(undefined);
        const project = createResetProject({ selectedStack: 'gone' });
        const context = createResetHandlerContext();

        await expect(run(project, context)).resolves.toEqual({
            success: false,
            error: 'Stack "gone" not found in stacks.json. Cannot reset.',
        });
        expect(showErrorMessage).toHaveBeenCalledWith(
            'Failed to reset project: Stack "gone" not found in stacks.json. Cannot reset.',
        );
        expect(project.status).toBe('ready');
        expect(mockCloneAllComponents).not.toHaveBeenCalled();
    });

    it('never looks the stack up when the project has none', async () => {
        await run(createResetProject({ selectedStack: undefined }));

        expect(mockGetStackById).not.toHaveBeenCalled();
        expect(mockCloneAllComponents).not.toHaveBeenCalled();
    });

    it('hands the orchestrator the frontend and the saved dependencies, typed and dependency-free', async () => {
        await run();

        expect(handedDefinitions()).toEqual({
            citisignal: {
                definition: { ...FRONTEND_DEF, type: 'frontend' },
                type: 'frontend',
                installOptions: { skipDependencies: true },
            },
            'commerce-mesh': {
                definition: { ...MESH_DEF, type: 'dependency' },
                type: 'dependency',
                installOptions: { skipDependencies: true },
            },
        });
        expect(mockGetFrontends).toHaveBeenCalledTimes(1);
        expect(mockGetDependencies).toHaveBeenCalledTimes(1);
    });

    it('restores the frontend source from the saved instance (the fork the SC actually cloned)', async () => {
        const project = createResetProject({
            componentInstances: {
                citisignal: {
                    id: 'citisignal',
                    name: 'CitiSignal',
                    status: 'ready',
                    repoUrl: 'https://github.com/skukla/my-fork.git',
                    branch: 'develop',
                },
            },
        });

        await run(project);

        expect(handedDefinitions().citisignal).toEqual(
            expect.objectContaining({
                definition: expect.objectContaining({
                    source: { type: 'git', url: 'https://github.com/skukla/my-fork.git', branch: 'develop' },
                }),
            }),
        );
    });

    it('defaults the restored frontend branch to main when the instance has none', async () => {
        const project = createResetProject({
            componentInstances: {
                citisignal: {
                    id: 'citisignal',
                    name: 'CitiSignal',
                    status: 'ready',
                    repoUrl: 'https://github.com/skukla/my-fork.git',
                },
            },
        });

        await run(project);

        expect(handedDefinitions().citisignal).toEqual(
            expect.objectContaining({
                definition: expect.objectContaining({
                    source: { type: 'git', url: 'https://github.com/skukla/my-fork.git', branch: 'main' },
                }),
            }),
        );
    });

    it('keeps the catalogue source for a frontend whose saved instance has no repo URL', async () => {
        const project = createResetProject({
            componentInstances: {
                citisignal: { id: 'citisignal', name: 'CitiSignal', status: 'ready' },
            },
        });

        await run(project);

        expect(handedDefinitions().citisignal).toEqual(
            expect.objectContaining({
                definition: expect.objectContaining({ source: FRONTEND_DEF.source }),
            }),
        );
    });

    it('rebuilds a dashboard-added App Builder app from its saved instance instead of dropping it', async () => {
        const project = createResetProject({
            componentSelections: { dependencies: [], appBuilder: ['my-app'] },
            componentInstances: {
                'my-app': {
                    id: 'my-app',
                    name: 'My App',
                    status: 'ready',
                    subType: 'app',
                    repoUrl: 'https://github.com/acme/my-app.git',
                    branch: 'main',
                },
            },
        });

        await run(project);

        expect(handedDefinitions()).toEqual({
            citisignal: expect.anything(),
            'my-app': {
                definition: {
                    id: 'my-app',
                    name: 'My App',
                    type: 'app-builder',
                    subType: 'app',
                    source: { type: 'git', url: 'https://github.com/acme/my-app.git', branch: 'main' },
                },
                type: 'app-builder',
                installOptions: { skipDependencies: true },
            },
        });
        // An App Builder app is never looked for among frontends or dependencies.
        expect(mockGetDependencies).not.toHaveBeenCalled();
        expect(mockGetComponentById).not.toHaveBeenCalled();
    });

    it('does NOT rebuild a missing DEPENDENCY from its saved instance — only App Builder apps are', async () => {
        mockGetDependencies.mockResolvedValue([]);
        const project = createResetProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Mesh',
                    status: 'ready',
                    repoUrl: 'https://github.com/skukla/mesh-fork.git',
                },
            },
        });

        await run(project);

        expect(mockGetComponentById).toHaveBeenCalledWith('commerce-mesh');
        expect(Object.keys(handedDefinitions())).toEqual(['citisignal']);
    });

    it('keeps the catalogue source for a DEPENDENCY even when its saved instance names a repo', async () => {
        const project = createResetProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Mesh',
                    status: 'ready',
                    repoUrl: 'https://github.com/skukla/mesh-fork.git',
                },
            },
        });

        await run(project);

        expect(handedDefinitions()['commerce-mesh']).toEqual(
            expect.objectContaining({
                definition: expect.objectContaining({ source: MESH_DEF.source }),
            }),
        );
    });

    it('falls back to the whole catalogue for an id no section lists', async () => {
        mockGetDependencies.mockResolvedValue([]);
        mockGetComponentById.mockResolvedValue(MESH_DEF);

        await run();

        expect(mockGetComponentById).toHaveBeenCalledWith('commerce-mesh');
        expect(handedDefinitions()['commerce-mesh']).toEqual(
            expect.objectContaining({ type: 'dependency' }),
        );
    });

    it('skips a component nothing can find, and keeps the rest', async () => {
        mockGetDependencies.mockResolvedValue([]);

        await run();

        expect(mockGetComponentById).toHaveBeenCalledWith('commerce-mesh');
        expect(Object.keys(handedDefinitions())).toEqual(['citisignal']);
    });

    it('skips a component whose definition has no source', async () => {
        mockGetDependencies.mockResolvedValue([{ ...MESH_DEF, source: undefined }]);

        await run();

        expect(Object.keys(handedDefinitions())).toEqual(['citisignal']);
    });

    it('uses the stack dependencies when the project saved none', async () => {
        mockGetDependencies.mockResolvedValue([{ ...MESH_DEF, id: 'stack-dep' }]);

        // A project with no instances at all must not trip the source restore.
        await run(createResetProject({ componentSelections: undefined, componentInstances: undefined }));

        expect(Object.keys(handedDefinitions())).toEqual(['citisignal', 'stack-dep']);
    });

    it('fails the reset when no component can be rebuilt, without touching the disk', async () => {
        mockGetStackById.mockReturnValue({ ...STACK, frontend: undefined, dependencies: [] });
        const project = createResetProject({ componentSelections: undefined });
        const context = createResetHandlerContext();

        await expect(run(project, context)).resolves.toEqual({
            success: false,
            error: 'No components found for this project stack',
        });
        expect(mockRm).not.toHaveBeenCalled();
        expect(mockCloneAllComponents).not.toHaveBeenCalled();
        expect(project.status).toBe('ready');
    });
});

describe('resetProjectWithUI — the rebuild itself', () => {
    it('removes the components directory, clears the instances, then clones and installs through one context', async () => {
        const project = createResetProject({
            componentInstances: {
                citisignal: { id: 'citisignal', name: 'CitiSignal', status: 'ready' },
            },
        });
        const context = createResetHandlerContext();

        await run(project, context);

        expect(mockRm).toHaveBeenCalledWith('/projects/demo/components', { recursive: true, force: true });
        expect(mockRm.mock.invocationCallOrder[0]).toBeLessThan(
            mockCloneAllComponents.mock.invocationCallOrder[0],
        );
        const installContext = mockCloneAllComponents.mock.calls[0][0];
        expect(installContext).toEqual(
            expect.objectContaining({
                project,
                logger: context.logger,
                commandManager,
            }),
        );
        expect(project.componentInstances).toEqual({});
        expect(mockInstallAllComponents).toHaveBeenCalledWith(installContext);
        expect(mockCloneAllComponents.mock.invocationCallOrder[0]).toBeLessThan(
            mockInstallAllComponents.mock.invocationCallOrder[0],
        );
    });

    it('the install context saves THIS project and relays progress messages to the notification', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();

        await run(project, context);

        const installContext = mockCloneAllComponents.mock.calls[0][0] as {
            saveProject: () => Promise<void>;
            progressTracker: (phase: string, pct: number, msg: string) => void;
        };
        (context.stateManager.saveProject as jest.Mock).mockClear();
        await installContext.saveProject();
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);

        installContext.progressTracker('clone', 40, 'Cloning citisignal…');
        expect(progressReport).toHaveBeenCalledWith({ message: 'Cloning citisignal…' });
    });

    it('a missing components directory is not an error — it is noted once, at debug', async () => {
        mockRm.mockRejectedValue(new Error('ENOENT'));
        const context = createResetHandlerContext();

        await expect(run(createResetProject(), context)).resolves.toEqual({ success: true });
        expect(mockCloneAllComponents).toHaveBeenCalled();
        expect(context.logger.debug).toHaveBeenCalledTimes(1);
        expect(context.logger.error).not.toHaveBeenCalled();
    });

    it('regenerates .env files from the loaded registry with the secret store', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();

        await run(project, context);

        expect(mockRegenerateProjectEnvFiles).toHaveBeenCalledWith(
            project,
            REGISTRY,
            context.logger,
            context.context.secrets,
        );
        expect(mockInstallAllComponents.mock.invocationCallOrder[0]).toBeLessThan(
            mockRegenerateProjectEnvFiles.mock.invocationCallOrder[0],
        );
    });

    it('reports each phase to the notification in order', async () => {
        await run();

        expect(progressReport.mock.calls.map((c) => c[0].message)).toEqual([
            'Loading component definitions…',
            'Removing existing components…',
            'Downloading components…',
            'Installing dependencies…',
            'Regenerating configuration files…',
        ]);
    });
});

describe('resetProjectWithUI — the ending', () => {
    it('lands on ready, saves it, and shows a self-dismissing success notice', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();

        await expect(run(project, context)).resolves.toEqual({ success: true });

        expect(project.status).toBe('ready');
        expect(context.stateManager.saveProject).toHaveBeenLastCalledWith(project);
        const notice = withProgress.mock.calls[1];
        expect(notice[0]).toEqual({
            location: vscode.ProgressLocation.Notification,
            title: '"demo" reset successfully',
        });
        await notice[1]();
        expect(mockSleep).toHaveBeenCalledWith(TIMEOUTS.UI.NOTIFICATION);
    });

    it('says the mesh was redeployed when it was', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });

        await expect(run()).resolves.toEqual({ success: true });

        expect(withProgress.mock.calls[1][0]).toEqual({
            location: vscode.ProgressLocation.Notification,
            title: '"demo" reset and mesh redeployed successfully',
        });
    });

    it('returns the mesh leg’s early result when the redeploy failed', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });
        mockDeployMeshCreateOrUpdate.mockResolvedValue({ success: false, error: 'aio exploded' });

        await expect(run()).resolves.toEqual({
            success: true,
            error: 'Reset completed but mesh redeployment failed: aio exploded',
        });
        // No success notice on top of the warning the mesh leg already showed.
        expect(withProgress).toHaveBeenCalledTimes(1);
    });

    it('a failure mid-rebuild reports the error, shows it, and restores the original status', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));
        const project = createResetProject({ status: 'stopped' });
        const context = createResetHandlerContext();

        await expect(run(project, context)).resolves.toEqual({
            success: false,
            error: 'git clone failed',
        });

        expect(showErrorMessage).toHaveBeenCalledWith('Failed to reset project: git clone failed');
        expect(project.status).toBe('stopped');
        expect(context.stateManager.saveProject).toHaveBeenLastCalledWith(project);
        expect(mockInstallAllComponents).not.toHaveBeenCalled();
    });

    it('does not re-save a project the run already landed on ready', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();
        const statuses: string[] = [];
        (context.stateManager.saveProject as jest.Mock).mockImplementation(async (p: Project) => {
            statuses.push(p.status);
        });

        await run(project, context);

        expect(statuses).toEqual(['resetting', 'ready']);
    });
});
