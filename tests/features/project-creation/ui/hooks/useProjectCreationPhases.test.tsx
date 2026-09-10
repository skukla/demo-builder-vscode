/**
 * useProjectCreationPhases tests — the single-spinner "create project" flow driver.
 *
 * When the user creates a NEW Adobe project from the mesh card, three phases run
 * in sequence behind ONE centered spinner: create-adobe-project → get-workspaces
 * (auto-pick Stage/single/first) → ensure-mesh-api-subscribed. This suite owns the
 * FORWARD path: the state machine (idle | creating | workspace | enabling | done),
 * the wizard-state writes each phase commits, and the skipEnabling short circuit.
 *
 * Retry, reset, cancellation and malformed responses live in the -recovery suite.
 * Mocks, fixtures and the two flow drivers live in useProjectCreationPhases.testUtils.
 */

import { act } from '@testing-library/react';

import {
    mockRequest,
    routeDeferred,
    renderPhases,
    startAndCreate,
    startThroughWorkspace,
    BASE_STATE,
    CREATED_PROJECT,
    PROD_WS,
    STAGE_WS,
} from './useProjectCreationPhases.testUtils';

describe('useProjectCreationPhases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('starts idle with no message, error, or enable result', () => {
        const { result } = renderPhases();

        expect(result.current.phase).toBe('idle');
        expect(result.current.phaseMessage).toBeUndefined();
        expect(result.current.phaseSubMessage).toBeUndefined();
        expect(result.current.error).toBeUndefined();
        expect(result.current.failedPhase).toBeUndefined();
        expect(result.current.enableResult).toBeUndefined();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    describe('creating phase', () => {
        it('start(name) enters "creating" with the exact message and issues create-adobe-project', async () => {
            routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });

            expect(hook.result.current.phase).toBe('creating');
            expect(hook.result.current.phaseMessage).toBe('Creating project "My Demo"…');
            expect(hook.result.current.phaseSubMessage).toBe(
                'Registering the project and its Stage workspace in Adobe I/O'
            );
            expect(mockRequest).toHaveBeenCalledTimes(1);
            expect(mockRequest).toHaveBeenCalledWith('create-adobe-project', { name: 'My Demo' });
        });

        it('commits the created project exactly as AdobeProjectField does (clears workspace + cache)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);

            expect(hook.updateState).toHaveBeenNthCalledWith(1, {
                adobeProject: {
                    id: 'p-new',
                    name: 'my-demo',
                    title: 'My Demo',
                    description: 'a demo',
                    org_id: 'org-1',
                },
                adobeWorkspace: undefined,
                workspacesCache: undefined,
                projectsCache: [CREATED_PROJECT],
            });
            const firstCommit = hook.updateState.mock.calls[0][0] as Record<string, unknown>;
            expect(Object.prototype.hasOwnProperty.call(firstCommit, 'adobeWorkspace')).toBe(true);
            expect(Object.prototype.hasOwnProperty.call(firstCommit, 'workspacesCache')).toBe(true);
        });

        // The picker is replaced by this flow's centered spinner while the create
        // runs, so the handler's old `get-projects` push had no listener; the list
        // rides back on the response instead (pinned in the commit test above).
        // Without a list, the cache must be CLEARED rather than left stale.
        it('clears the project cache when the response carries no list (forces a reload)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            await act(async () => {
                route.latest('create-adobe-project').resolve({ success: true, data: CREATED_PROJECT });
            });

            const firstCommit = hook.updateState.mock.calls[0][0] as Record<string, unknown>;
            expect(Object.prototype.hasOwnProperty.call(firstCommit, 'projectsCache')).toBe(true);
            expect(firstCommit.projectsCache).toBeUndefined();
        });

        it('a create envelope failure fails at "creating" with the handler error and stops', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            await act(async () => {
                route.latest('create-adobe-project').resolve({
                    success: false,
                    error: 'Name already exists',
                });
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('creating');
            expect(hook.result.current.error).toBe('Name already exists');
            expect(hook.result.current.phaseMessage).toBeUndefined();
            expect(hook.updateState).not.toHaveBeenCalled();
            expect(route.count('get-workspaces')).toBe(0);
        });

        it('a create rejection fails at "creating" with the thrown message', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            await act(async () => {
                route.latest('create-adobe-project').reject(new Error('socket closed'));
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('creating');
            expect(hook.result.current.error).toBe('socket closed');
        });
    });

    describe('workspace phase', () => {
        it('enters "workspace" with the exact message and requests get-workspaces for the new project', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);

            expect(hook.result.current.phase).toBe('workspace');
            expect(hook.result.current.phaseMessage).toBe('Setting up workspace…');
            expect(hook.result.current.phaseSubMessage).toBe('Selecting the Stage workspace');
            expect(mockRequest).toHaveBeenCalledWith('get-workspaces', {
                orgId: 'org-1',
                projectId: 'p-new',
            });
        });

        it('picks the Stage-named workspace among several and commits it with the cache', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);

            expect(hook.updateState).toHaveBeenNthCalledWith(2, {
                adobeWorkspace: { id: 'w-stage', name: 'Stage', title: 'Stage' },
                workspacesCache: [PROD_WS, STAGE_WS],
            });
        });

        it('matches "stage" case-insensitively in name or title', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            const staged = { id: 'w-2', name: 'ws2', title: 'STAGE AREA' };
            await act(async () => {
                route.latest('get-workspaces').resolve({ success: true, data: [PROD_WS, staged] });
            });

            expect(hook.updateState).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    adobeWorkspace: { id: 'w-2', name: 'ws2', title: 'STAGE AREA' },
                })
            );
        });

        it('picks the single workspace when only one exists (even if not Stage-named)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve({ success: true, data: [PROD_WS] });
            });

            expect(hook.updateState).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    adobeWorkspace: { id: 'w-prod', name: 'Production', title: 'Production' },
                })
            );
        });

        it('falls back to the first workspace when several exist and none is Stage-named', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            const other = { id: 'w-x', name: 'Other', title: 'Other' };
            await act(async () => {
                route.latest('get-workspaces').resolve({ success: true, data: [PROD_WS, other] });
            });

            expect(hook.updateState).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    adobeWorkspace: { id: 'w-prod', name: 'Production', title: 'Production' },
                })
            );
        });

        it('an empty workspace list fails at "workspace" (no enable request)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve({ success: true, data: [] });
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('workspace');
            expect(hook.result.current.error).toBe('No workspaces found in the new project.');
            expect(hook.updateState).toHaveBeenCalledTimes(1);
            expect(route.count('ensure-mesh-api-subscribed')).toBe(0);
        });

        it('a get-workspaces envelope failure fails at "workspace" with the handler error', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve({
                    success: false,
                    error: 'Failed to load workspaces. Please try again.',
                });
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('workspace');
            expect(hook.result.current.error).toBe('Failed to load workspaces. Please try again.');
        });
    });

    describe('enabling phase', () => {
        it('enters "enabling" with the exact message and the ensure-mesh-api-subscribed payload shape', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);

            expect(hook.result.current.phase).toBe('enabling');
            expect(hook.result.current.phaseMessage).toBe('Enabling API access…');
            expect(hook.result.current.phaseSubMessage).toBe(
                'Subscribing to API Mesh and the I/O Management API'
            );
            expect(mockRequest).toHaveBeenCalledWith('ensure-mesh-api-subscribed', {
                orgId: 'org-1',
                projectId: 'p-new',
                workspaceId: 'w-stage',
                backendId: 'adobe-commerce-paas',
                frontendId: 'eds-storefront',
            });
        });

        it('reaches "done" on success and exposes the successful EnsureResult', async () => {
            const route = routeDeferred();
            const hook = renderPhases();
            const ensureResult = {
                success: true,
                data: { apis: [{ code: 'GraphQLServiceSDK', name: 'API Mesh' }] },
            };

            await startThroughWorkspace(route, hook);
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').resolve(ensureResult);
            });

            expect(hook.result.current.phase).toBe('done');
            expect(hook.result.current.phaseMessage).toBeUndefined();
            expect(hook.result.current.enableResult).toEqual(ensureResult);
            expect(hook.result.current.error).toBeUndefined();
        });

        it('an enable envelope failure fails at "enabling" and still exposes the EnsureResult', async () => {
            const route = routeDeferred();
            const hook = renderPhases();
            const failedResult = { success: false, error: 'no permission' };

            await startThroughWorkspace(route, hook);
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').resolve(failedResult);
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('enabling');
            expect(hook.result.current.error).toBe('no permission');
            expect(hook.result.current.enableResult).toEqual(failedResult);
        });

        it('an enable rejection fails at "enabling" with the thrown message', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').reject(new Error('timeout'));
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('enabling');
            expect(hook.result.current.error).toBe('timeout');
        });
    });

    describe('skipEnabling (Adobe I/O step reuse)', () => {
        it('reaches "done" after the workspace phase and never subscribes the mesh API', async () => {
            const route = routeDeferred();
            const hook = renderPhases(BASE_STATE, { skipEnabling: true });

            await startThroughWorkspace(route, hook);

            // Workspace still committed exactly as the mesh path does...
            expect(hook.updateState).toHaveBeenNthCalledWith(2, {
                adobeWorkspace: { id: 'w-stage', name: 'Stage', title: 'Stage' },
                workspacesCache: [PROD_WS, STAGE_WS],
            });
            // ...but the flow ends at "done" with NO enable step.
            expect(hook.result.current.phase).toBe('done');
            expect(hook.result.current.phaseMessage).toBeUndefined();
            expect(route.count('ensure-mesh-api-subscribed')).toBe(0);
        });

        it('leaves the default (mesh) path intact — enabling still runs when the flag is absent', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);

            expect(hook.result.current.phase).toBe('enabling');
            expect(route.count('ensure-mesh-api-subscribed')).toBe(1);
        });
    });
});
