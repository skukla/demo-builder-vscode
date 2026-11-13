/**
 * projectResetService — the whole reset as a batch row runs it (`runProjectResetAnswered`,
 * every screen's Reset since step-05 S4) and the component-definition rebuild it runs first.
 *
 * WRITTEN 2026-09-04 (PL-22, MUT-08). Both were untested: 174 mutants sat
 * uncovered, every one of them a decision a refactor could flip with the suite
 * green. The rebuild is private, so it is pinned through what it HANDS the
 * orchestrator — the `componentDefinitions` map on the install context — which
 * is what a cast or a mock would have hidden.
 *
 * What is asserted:
 *  - a running/starting demo is stopped first; status goes 'resetting' and is
 *    restored on the error path
 *  - the rebuilt definitions: frontend source restored from the saved instance,
 *    a dashboard-added App Builder app rebuilt from its instance, the
 *    catalogue-wide fallback, and the two skips (not found, no source)
 *  - the orchestrator context, the .env regeneration inputs, the components
 *    directory removed, and the final status/result
 */

import { runningWork } from '@/core/state/projectWorkRunning';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import type { Project } from '@/types/base';
import {
    FRONTEND_DEF,
    MESH_DEF,
    REGISTRY,
    STACK,
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
    executeCommand,
    executeProjectReset,
    handedDefinitions,
    installResetDefaults,
    mockCloneAllComponents,
    mockDeployMeshCreateOrUpdate,
    mockGetComponentById,
    mockGetComponentRegistryManager,
    mockGetDependencies,
    mockGetFrontends,
    mockGetMeshComponentInstance,
    mockGetStackById,
    mockInstallAllComponents,
    mockReaddir,
    mockRegenerateProjectEnvFiles,
    mockRm,
    mockSleep,
    progressReport,
    run,
    showErrorMessage,
    showWarningMessage,
    withProgress,
} from './projectResetService-answered.testUtils';

beforeEach(installResetDefaults);

describe('the answered reset — the demo stop and the status', () => {
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

    it('marks the project resetting and saves it BEFORE the first step is reported', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();
        const seen: string[] = [];
        (context.stateManager.saveProject as jest.Mock).mockImplementation(async (p: Project) => {
            seen.push(p.status);
        });

        await run(project, context);

        expect(seen[0]).toBe('resetting');
        expect((context.stateManager.saveProject as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
            progressReport.mock.invocationCallOrder[0],
        );
    });

    // The projects list reads what is running from the registry, never this copy of
    // the project (found 2026-10-28: three resets all still said "Needs reset").
    it('lists the project as resetting while the reset runs, and not after', async () => {
        const project = createResetProject();
        const stackOf = mockGetStackById.getMockImplementation();
        let during: string | undefined;
        mockGetStackById.mockImplementation((...args: unknown[]) => {
            during = runningWork(project.path);
            return stackOf?.(...args);
        });

        await run(project);

        expect(during).toBe('resetting');
        expect(runningWork(project.path)).toBeUndefined();
    });
});

describe('the answered reset — rebuilding the component definitions', () => {
    it('reads the registry from the extension path and resolves the saved stack', async () => {
        await run();

        expect(mockGetComponentRegistryManager).toHaveBeenCalledWith('/test/extension/path');
        expect(mockGetStackById).toHaveBeenCalledWith('headless-paas');
    });

    // The batch row shows the reason; nothing here raises a notification beside it.
    it('fails the reset when the saved stack is unknown, restoring the status', async () => {
        mockGetStackById.mockReturnValue(undefined);
        const project = createResetProject({ selectedStack: 'gone' });
        const context = createResetHandlerContext();

        await expect(run(project, context)).rejects.toThrow(
            'Stack "gone" not found in stacks.json. Cannot reset.',
        );
        expect(showErrorMessage).not.toHaveBeenCalled();
        expect(project.status).toBe('ready');
        expect(mockCloneAllComponents).not.toHaveBeenCalled();
    });

    it('never looks the stack up when the project has none', async () => {
        await expect(run(createResetProject({ selectedStack: undefined }))).rejects.toThrow('Cannot reset.');

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

    // AB-23 slice 7 (owner, 2026-09-21): reset never touches an integration. Its
    // code may be the SC's own work — one built with AI exists only on disk, and
    // downloading it again gave back the blank starter it came from — and its app
    // keeps running in Adobe either way. It also used to delete the ERP half of a
    // pair and never download it again: only `appBuilder` selections were rebuilt,
    // and the ERP comes with its integration rather than being selected.
    it('leaves integrations alone: no download, their folders and records kept', async () => {
        const instance = (id: string) => ({
            id,
            name: id,
            status: 'ready' as const,
            path: `/projects/demo/components/${id}`,
            repoUrl: `https://github.com/skukla/${id}.git`,
        });
        const project = createResetProject({
            componentSelections: { dependencies: [], appBuilder: ['erp-integration'] },
            appBuilderComponents: {
                'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'o', repo: 'r' } },
                'demo-erp': { kind: 'system', status: 'deployed', source: { owner: 'o', repo: 'r' } },
            },
            componentInstances: {
                citisignal: instance('citisignal'),
                'erp-integration': instance('erp-integration'),
                'demo-erp': instance('demo-erp'),
            },
        });
        mockReaddir.mockResolvedValue(['citisignal', 'erp-integration', 'demo-erp']);

        await run(project);

        expect(Object.keys(handedDefinitions())).toEqual(['citisignal']);
        expect(mockRm.mock.calls).toEqual([
            ['/projects/demo/components/citisignal', { recursive: true, force: true }],
        ]);
        expect(Object.keys(project.componentInstances ?? {})).toEqual(['erp-integration', 'demo-erp']);
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

describe('the answered reset — the rebuild itself', () => {
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
        expect(project.componentInstances).toStrictEqual({});
        expect(mockInstallAllComponents).toHaveBeenCalledWith(installContext);
        expect(mockCloneAllComponents.mock.invocationCallOrder[0]).toBeLessThan(
            mockInstallAllComponents.mock.invocationCallOrder[0],
        );
    });

    it('the install context saves THIS project and relays progress messages to the row', async () => {
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
        // The clone's own line rides under the step, which keeps its position.
        expect(progressReport).toHaveBeenLastCalledWith(
            S.downloadingComponents.label,
            'Cloning citisignal…',
            { index: 3, total: 5 },
        );
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

    // Steps from the stage table, named as creation names the same jobs (progress
    // vocabulary slice 6, owner 2026-10-16), numbered from a list known up front.
    it('reports each step to the row in order, numbered from the run it is', async () => {
        await run();

        expect(progressReport.mock.calls.map((c) => [c[0], c[2]])).toEqual([
            [S.loadingComponents.label, { index: 1, total: 5 }],
            [S.removingComponents.label, { index: 2, total: 5 }],
            [S.downloadingComponents.label, { index: 3, total: 5 }],
            [S.installingComponents.label, { index: 4, total: 5 }],
            [S.writingConfigFiles.label, { index: 5, total: 5 }],
        ]);
    });

    // With a mesh the run is two steps longer, and N says so from the start: it read
    // "(5 of 6)" at the end of a reset with no mesh.
    it('adds the access check and the mesh redeploy as steps when there is a mesh', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });

        await run();

        expect(progressReport.mock.calls.map((c) => [c[0], c[2]?.index, c[2]?.total])).toEqual([
            [S.loadingComponents.label, 1, 7],
            [S.removingComponents.label, 2, 7],
            [S.downloadingComponents.label, 3, 7],
            [S.installingComponents.label, 4, 7],
            [S.writingConfigFiles.label, 5, 7],
            [S.checkingRequirements.label, 6, 7],
            [S.redeployingMesh.label, 7, 7],
        ]);
    });
});

describe('the answered reset — the ending', () => {
    // R6: a success ends the progress and says "— done" where it was being
    // watched. The toast that used to sit here held the screen for its own timer
    // after the work had already finished.
    it('lands on ready, saves it, and raises no success toast of its own', async () => {
        const project = createResetProject();
        const context = createResetHandlerContext();

        await expect(run(project, context)).resolves.toEqual({ success: true });

        expect(project.status).toBe('ready');
        expect(context.stateManager.saveProject).toHaveBeenLastCalledWith(project);
        expect(withProgress).not.toHaveBeenCalled();
        expect(mockSleep).not.toHaveBeenCalled();
    });

    it('raises no second notice when the mesh was redeployed too', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });

        await expect(run()).resolves.toEqual({ success: true });

        // The row is the whole reset's one surface, mesh leg included.
        expect(withProgress).not.toHaveBeenCalled();
    });

    it('returns the mesh leg’s early result when the redeploy failed', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });
        mockDeployMeshCreateOrUpdate.mockResolvedValue({ success: false, error: 'aio exploded' });

        await expect(run()).resolves.toEqual({
            success: true,
            error: 'Reset completed but mesh redeployment failed: aio exploded',
        });
        // No success notice on top of the warning the mesh leg already showed.
        expect(withProgress).not.toHaveBeenCalled();
    });

    it('a failure mid-rebuild reaches the batch, with the original status restored', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));
        const project = createResetProject({ status: 'stopped' });
        const context = createResetHandlerContext();

        await expect(run(project, context)).rejects.toThrow('git clone failed');

        expect(showErrorMessage).not.toHaveBeenCalled();
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

// The agent's door (reset_project). Same rebuild, none of the SC's surfaces: an
// agent has no dialog to answer and no notification to watch, so the core must
// run with neither and say what the mesh did in its answer.
describe('executeProjectReset — the same reset with no dialog and no notification', () => {
    function runCore(project = createResetProject(), context = createResetHandlerContext()) {
        const report = jest.fn();
        const outcome = executeProjectReset({ project, context, commandManager, authManager }, report);
        return { outcome, report, project, context };
    }

    it('asks nothing, opens no notification, and rebuilds the components', async () => {
        const { outcome } = runCore();

        await expect(outcome).resolves.toEqual({ success: true, meshRedeployed: false });

        expect(showWarningMessage).not.toHaveBeenCalled();
        expect(withProgress).not.toHaveBeenCalled();
        expect(executeCommand).not.toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalledWith('/projects/demo/components', { recursive: true, force: true });
        expect(mockCloneAllComponents).toHaveBeenCalledTimes(1);
        expect(mockInstallAllComponents).toHaveBeenCalledTimes(1);
    });

    it('reports each stage to the caller with its position', async () => {
        const { outcome, report } = runCore();
        await outcome;

        expect(report.mock.calls.map((c) => [c[0], c[2]])).toEqual([
            [S.loadingComponents.label, { index: 1, total: 5 }],
            [S.removingComponents.label, { index: 2, total: 5 }],
            [S.downloadingComponents.label, { index: 3, total: 5 }],
            [S.installingComponents.label, { index: 4, total: 5 }],
            [S.writingConfigFiles.label, { index: 5, total: 5 }],
        ]);
    });

    it('marks the project resetting while it runs and lands on ready', async () => {
        const seen: string[] = [];
        const context = createResetHandlerContext();
        (context.stateManager.saveProject as jest.Mock).mockImplementation(async (p: Project) => {
            seen.push(p.status);
        });
        const { outcome, project } = runCore(createResetProject({ status: 'stopped' }), context);
        await outcome;

        expect(seen[0]).toBe('resetting');
        expect(project.status).toBe('ready');
    });

    it('says the mesh was redeployed when it was', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });

        await expect(runCore().outcome).resolves.toEqual({ success: true, meshRedeployed: true });
    });

    it('says the mesh was NOT redeployed when the redeploy failed, with the reason', async () => {
        mockGetMeshComponentInstance.mockReturnValue({ path: '/projects/demo/components/mesh' });
        mockDeployMeshCreateOrUpdate.mockResolvedValue({ success: false, error: 'aio exploded' });

        await expect(runCore().outcome).resolves.toEqual({
            success: true,
            error: 'Reset completed but mesh redeployment failed: aio exploded',
            meshRedeployed: false,
        });
    });

    it('lets a failure reach the caller, with the original status restored and no toast', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));
        const { outcome, project, context } = runCore(createResetProject({ status: 'stopped' }));

        await expect(outcome).rejects.toThrow('git clone failed');

        expect(project.status).toBe('stopped');
        expect(context.stateManager.saveProject).toHaveBeenLastCalledWith(project);
        expect(showErrorMessage).not.toHaveBeenCalled();
    });
});
