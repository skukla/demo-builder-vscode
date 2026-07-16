/**
 * removeAppComponent — per-id removal of ONE custom integration on a LIVE
 * project (ADR-011 D3 Step 05): remote undeploy (best-effort, org-context
 * targeted), local file+instance cleanup, and per-id state/selection clearing.
 * Siblings must survive whole.
 *
 * Org-context discipline mirrors the mesh reset/deploy callers: the undeploy is
 * wrapped in `withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe, cachedOrg), …)`.
 * We mock the org-context boundary exactly like projectResetService-meshContext.test.ts.
 */

import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

// withOrgContext records the target then runs the callback (no global mutation),
// exactly like projectResetService-meshContext.test.ts.
const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

// The undeploy fetches workspace Runtime credentials first (same contract as
// the deploy); mock the fetch so these tests stay focused on remove semantics.
jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    extractAioErrorDetail: jest.requireActual('@/features/app-builder/services/runtimeCredentials')
        .extractAioErrorDetail,
    fetchRuntimeCredentials: jest.fn().mockResolvedValue({
        namespace: 'test-namespace',
        auth: 'fake-test-pw-not-a-secret',
    }),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { removeAppComponent } from '@/features/app-builder/services/appComponentManager';
import {
    createCommandManager,
    createDeps,
    createProject,
} from './appComponentManager.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('removeAppComponent', () => {
    function projectWithApp(): Project {
        return createProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'ready',
                    path: '/proj/components/commerce-mesh',
                } as never,
                'my-app': {
                    id: 'my-app',
                    name: 'My App',
                    type: 'app-builder',
                    subType: 'app',
                    status: 'ready',
                    path: '/proj/components/my-app',
                } as never,
            },
            componentSelections: { appBuilder: ['my-app'] },
            appBuilderComponents: {
                'my-app': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'my-app' },
                    url: 'https://app.example.com',
                },
            },
            appState: { status: 'deployed', url: 'https://app.example.com' },
            appStatusSummary: 'deployed',
        } as Partial<Project>);
    }

    it('is a no-op success for an id with no instance and no keyed entry', async () => {
        const project = createProject(); // no app-subType instance
        const deps = createDeps();

        const result = await removeAppComponent(project, 'my-app', deps);

        expect(result.success).toBe(true);
        expect(deps.commandManager.execute).not.toHaveBeenCalled();
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
    });

    it('runs `aio app undeploy` wrapped in withOrgContext', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        const undeployCall = deps.commandManager.execute.mock.calls.find((c) =>
            String(c[0]).includes('app undeploy')
        );
        expect(undeployCall).toBeDefined();
    });

    it('targets the project org/project/workspace via the org-context wrapper', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function)
        );
    });

    it('resolves org code/name from the cached org when its id matches', async () => {
        const project = projectWithApp();
        const deps = createDeps({
            getCachedOrganization: jest.fn().mockReturnValue({
                id: 'org-123',
                code: 'CODE@AdobeOrg',
                name: 'Acme Inc',
            }),
        });

        await removeAppComponent(project, 'my-app', deps);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                orgCode: 'CODE@AdobeOrg',
                orgName: 'Acme Inc',
            }),
            expect.any(Function)
        );
    });

    it('runs undeploy from the app path with auto node + enhancePath', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        const undeployCall = deps.commandManager.execute.mock.calls.find((c) =>
            String(c[0]).includes('app undeploy')
        );
        expect(undeployCall?.[1]).toEqual(
            expect.objectContaining({
                cwd: '/proj/components/my-app',
                useNodeVersion: 'auto',
                enhancePath: true,
            })
        );
    });

    it('calls removeComponent with deleteFiles=true', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'my-app', true);
    });

    it('clears appState, appStatusSummary and drops the app from the selection', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        const result = await removeAppComponent(project, 'my-app', deps);

        expect(result.success).toBe(true);
        expect(project.appState).toBeUndefined();
        expect(project.appStatusSummary).toBeUndefined();
        expect(project.componentSelections?.appBuilder).toEqual([]);
    });

    it('clears the integration keyed entry on removal', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        expect(project.appBuilderComponents?.['my-app']).toBeUndefined();
    });

    // ADR-011 D3 Step 05: remove is per-id — one of N goes; siblings stay whole.
    describe('per-id removal among N integrations (ADR-011 D3 Step 05)', () => {
        function projectWithTwoIntegrations(): Project {
            const project = projectWithApp();
            (project.componentInstances as Record<string, unknown>)['int-b'] = {
                id: 'int-b',
                name: 'Integration B',
                type: 'app-builder',
                subType: 'app',
                status: 'ready',
                path: '/proj/components/int-b',
            };
            project.componentSelections = { appBuilder: ['my-app', 'int-b'] };
            project.appBuilderComponents = {
                ...(project.appBuilderComponents ?? {}),
                'int-b': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'b' },
                    url: 'https://b.example',
                },
            };
            return project;
        }

        it('removes ONLY the targeted integration; the sibling survives whole', async () => {
            const project = projectWithTwoIntegrations();
            const deps = createDeps();

            const result = await removeAppComponent(project, 'my-app', deps);

            expect(result.success).toBe(true);
            // Target gone everywhere.
            expect(project.componentInstances?.['my-app']).toBeUndefined();
            expect(project.appBuilderComponents?.['my-app']).toBeUndefined();
            // Sibling untouched: instance, keyed entry, and selection.
            expect(project.componentInstances?.['int-b']).toBeDefined();
            expect(project.appBuilderComponents?.['int-b']).toEqual(
                expect.objectContaining({ status: 'deployed', url: 'https://b.example' })
            );
            expect(project.componentSelections?.appBuilder).toEqual(['int-b']);
        });

        it('undeploys from the targeted integration folder only', async () => {
            const project = projectWithTwoIntegrations();
            const deps = createDeps();

            await removeAppComponent(project, 'int-b', deps);

            const undeployCall = deps.commandManager.execute.mock.calls.find((c) =>
                String(c[0]).includes('app undeploy')
            );
            expect(undeployCall?.[1]).toEqual(
                expect.objectContaining({ cwd: '/proj/components/int-b' })
            );
            expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(
                project,
                'int-b',
                true
            );
        });

        it('keeps the singular appState/appStatusSummary while other integrations remain', async () => {
            const project = projectWithTwoIntegrations();
            const deps = createDeps();

            await removeAppComponent(project, 'my-app', deps);

            // Transitional (until Step 07 retires the singular fields): the card
            // badge still reflects that a deployed integration exists.
            expect(project.appStatusSummary).toBe('deployed');
        });

        it('clears the singular appState/appStatusSummary after the LAST integration goes', async () => {
            const project = projectWithTwoIntegrations();
            const deps = createDeps();

            await removeAppComponent(project, 'my-app', deps);
            await removeAppComponent(project, 'int-b', deps);

            expect(project.appState).toBeUndefined();
            expect(project.appStatusSummary).toBeUndefined();
        });

        it('does NOT clear a sibling keyed entry for an unknown id (no instance)', async () => {
            // The legacy-twin resolution applies only when the removed INSTANCE
            // exists; an unknown id must never cross-delete a sibling's entry.
            const project = projectWithApp();
            delete project.componentInstances?.['my-app'];
            const deps = createDeps();

            const result = await removeAppComponent(project, 'nope', deps);

            expect(result.success).toBe(true);
            expect(project.appBuilderComponents?.['my-app']).toBeDefined();
            expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
        });

        it('clears the migrated legacy keyed entry when the map holds the legacy key', async () => {
            // Pre-D3 projects migrated the singular appState under a legacy key
            // ('app') that differs from the component-instance id. Removing the
            // instance must clear THAT entry, not leave a stale twin.
            const project = projectWithApp();
            project.appBuilderComponents = {
                app: {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    url: 'https://app.example.com',
                },
            };
            const deps = createDeps();

            await removeAppComponent(project, 'my-app', deps);

            expect(project.appBuilderComponents?.app).toBeUndefined();
        });
    });

    it('persists the project after removal', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        expect(deps.saveProject).toHaveBeenCalledWith(project);
    });

    it('leaves sibling instances untouched on removal', async () => {
        const project = projectWithApp();
        const deps = createDeps();

        await removeAppComponent(project, 'my-app', deps);

        expect(project.componentInstances?.['commerce-mesh']).toBeDefined();
    });

    it('surfaces a warning but still clears local state when undeploy exits non-zero', async () => {
        const commandManager = createCommandManager();
        commandManager.execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'undeploy boom' });
        const deps = createDeps({ commandManager });
        const project = projectWithApp();

        const result = await removeAppComponent(project, 'my-app', deps);

        expect(result.success).toBe(true);
        expect(result.undeployWarning).toBeTruthy();
        // Local cleanup still happened.
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'my-app', true);
        expect(project.appState).toBeUndefined();
        expect(project.componentSelections?.appBuilder).toEqual([]);
    });

    it('surfaces a warning but still clears local state when undeploy throws', async () => {
        const commandManager = createCommandManager();
        commandManager.execute.mockRejectedValue(new Error('network down'));
        const deps = createDeps({ commandManager });
        const project = projectWithApp();

        const result = await removeAppComponent(project, 'my-app', deps);

        expect(result.success).toBe(true);
        expect(result.undeployWarning).toMatch(/network down/);
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'my-app', true);
        expect(project.appState).toBeUndefined();
    });
});
