/**
 * useProjectCreationPhases — recovery, cancellation and malformed responses.
 *
 * The other half of the flow driver: retry() re-entering exactly the failed phase,
 * the per-run cancellation token that makes a stale resolve after reset() a no-op,
 * responses that are not the envelope the hook expects, and a wizard state carrying
 * neither an org nor a stack. The forward path lives in the base suite.
 *
 * Mocks, fixtures and the two flow drivers live in useProjectCreationPhases.testUtils.
 */

import { act } from '@testing-library/react';
import type { WizardState } from '@/types/webview';

import {
    mockRequest,
    routeDeferred,
    renderPhases,
    startAndCreate,
    startThroughWorkspace,
    CREATED_PROJECT,
    PROD_WS,
    STAGE_WS,
} from './useProjectCreationPhases.testUtils';

describe('useProjectCreationPhases — recovery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('retry', () => {
        it('re-enters ONLY the enabling phase after an enable failure', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').resolve({
                    success: false,
                    error: 'nope',
                });
            });
            expect(hook.result.current.failedPhase).toBe('enabling');

            await act(async () => {
                hook.result.current.retry();
            });
            expect(hook.result.current.phase).toBe('enabling');
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').resolve({ success: true });
            });

            expect(hook.result.current.phase).toBe('done');
            expect(route.count('create-adobe-project')).toBe(1);
            expect(route.count('get-workspaces')).toBe(1);
            expect(route.count('ensure-mesh-api-subscribed')).toBe(2);
        });

        it('re-enters at the workspace phase after a workspace failure (no second create)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve({ success: false, error: 'boom' });
            });
            expect(hook.result.current.failedPhase).toBe('workspace');

            await act(async () => {
                hook.result.current.retry();
            });

            expect(hook.result.current.phase).toBe('workspace');
            expect(route.count('create-adobe-project')).toBe(1);
            expect(route.count('get-workspaces')).toBe(2);
            expect(mockRequest).toHaveBeenLastCalledWith('get-workspaces', {
                orgId: 'org-1',
                projectId: 'p-new',
            });
        });

        it('re-runs the create with the remembered name after a create failure', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            await act(async () => {
                route.latest('create-adobe-project').resolve({ success: false, error: 'oops' });
            });
            expect(hook.result.current.failedPhase).toBe('creating');

            await act(async () => {
                hook.result.current.retry();
            });

            expect(hook.result.current.phase).toBe('creating');
            expect(hook.result.current.phaseMessage).toBe('Creating project "My Demo"…');
            expect(route.count('create-adobe-project')).toBe(2);
            expect(mockRequest).toHaveBeenLastCalledWith('create-adobe-project', {
                name: 'My Demo',
            });
        });

        it('is a no-op when nothing has failed', async () => {
            routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.retry();
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(mockRequest).not.toHaveBeenCalled();
        });
    });

    describe('cancellation + reset', () => {
        it('ignores a stale create resolve after reset() (no commit, stays idle)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            const pendingCreate = route.latest('create-adobe-project');
            await act(async () => {
                hook.result.current.reset();
            });
            await act(async () => {
                pendingCreate.resolve({ success: true, data: CREATED_PROJECT });
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.updateState).not.toHaveBeenCalled();
            expect(route.count('get-workspaces')).toBe(0);
        });

        it('a second start() cancels the first run (stale first resolve is ignored)', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('First');
            });
            const firstCreate = route.latest('create-adobe-project');
            await act(async () => {
                hook.result.current.start('Second');
            });

            await act(async () => {
                firstCreate.resolve({ success: false, error: 'stale failure' });
            });

            // The stale failure must not derail the second run.
            expect(hook.result.current.phase).toBe('creating');
            expect(hook.result.current.phaseMessage).toBe('Creating project "Second"…');
            expect(hook.result.current.error).toBeUndefined();
        });

        it('reset() after done clears phase, error, and enableResult', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').resolve({ success: true });
            });
            expect(hook.result.current.phase).toBe('done');

            await act(async () => {
                hook.result.current.reset();
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.result.current.enableResult).toBeUndefined();
            expect(hook.result.current.error).toBeUndefined();
            expect(hook.result.current.failedPhase).toBeUndefined();
        });

        it("start() clears a previous run's error and enableResult", async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);
            await act(async () => {
                route.latest('ensure-mesh-api-subscribed').resolve({
                    success: false,
                    error: 'nope',
                });
            });
            expect(hook.result.current.enableResult).toBeDefined();

            await act(async () => {
                hook.result.current.start('Fresh');
            });

            expect(hook.result.current.phase).toBe('creating');
            expect(hook.result.current.error).toBeUndefined();
            expect(hook.result.current.enableResult).toBeUndefined();
            expect(hook.result.current.failedPhase).toBeUndefined();
        });
    });

    describe('workspace pick — which field decides, and holes in the list', () => {
        it('matches "stage" on the NAME alone when the title says something else', async () => {
            const route = routeDeferred();
            const hook = renderPhases();
            const namedStage = { id: 'w-name', name: 'Stage-Env', title: 'Deployment' };

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve({
                    success: true,
                    data: [PROD_WS, namedStage],
                });
            });

            expect(hook.updateState).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    adobeWorkspace: { id: 'w-name', name: 'Stage-Env', title: 'Deployment' },
                })
            );
        });

        // A workspace can arrive with no title (the API's own field is optional) and,
        // in a stale cache, with no name — scanning past either must not throw and
        // lose the whole list to the workspace-phase catch.
        it('scans past workspaces missing a name or a title and still finds Stage', async () => {
            const route = routeDeferred();
            const hook = renderPhases();
            const noName = { id: 'w-noname', title: 'Prod' } as unknown as typeof PROD_WS;
            const noTitle = { id: 'w-notitle', name: 'Beta' } as unknown as typeof PROD_WS;

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve({
                    success: true,
                    data: [noName, noTitle, STAGE_WS],
                });
            });

            expect(hook.result.current.phase).toBe('enabling');
            expect(hook.updateState).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    adobeWorkspace: { id: 'w-stage', name: 'Stage', title: 'Stage' },
                })
            );
        });
    });

    describe('malformed responses fall back to the flow’s own message', () => {
        it('a get-workspaces response that is not an envelope fails with the no-workspaces message', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').resolve(undefined);
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('workspace');
            expect(hook.result.current.error).toBe('No workspaces found in the new project.');
        });

        it('a create response that is not an envelope fails with the could-not-create message', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            await act(async () => {
                route.latest('create-adobe-project').resolve(undefined);
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('creating');
            expect(hook.result.current.error).toBe('Could not create the project.');
            expect(hook.updateState).not.toHaveBeenCalled();
        });

        it('a create that reports success with no project fails rather than committing a hole', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            await act(async () => {
                route.latest('create-adobe-project').resolve({ success: true });
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('creating');
            expect(hook.result.current.error).toBe('Could not create the project.');
            expect(hook.updateState).not.toHaveBeenCalled();
            expect(route.count('get-workspaces')).toBe(0);
        });

        it('a get-workspaces rejection fails at "workspace" with the thrown message', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            await act(async () => {
                route.latest('get-workspaces').reject(new Error('gateway timeout'));
            });

            expect(hook.result.current.phase).toBe('failed');
            expect(hook.result.current.failedPhase).toBe('workspace');
            expect(hook.result.current.error).toBe('gateway timeout');
        });
    });

    // The org and the stack are read through a ref at REQUEST time, so a wizard state
    // that has neither must still produce a request — with the fields simply absent —
    // rather than throwing during render.
    describe('missing org / stack', () => {
        it('sends every phase its payload with the org and stack ids undefined', async () => {
            const route = routeDeferred();
            const bare = {
                adobeAuth: { isAuthenticated: true, isChecking: false },
            } as unknown as WizardState;
            const hook = renderPhases(bare);

            expect(hook.result.current.phase).toBe('idle');

            await startAndCreate(route, hook);
            expect(mockRequest).toHaveBeenCalledWith('get-workspaces', {
                orgId: undefined,
                projectId: 'p-new',
            });

            await act(async () => {
                route.latest('get-workspaces').resolve({ success: true, data: [STAGE_WS] });
            });
            expect(mockRequest).toHaveBeenCalledWith('ensure-mesh-api-subscribed', {
                orgId: undefined,
                projectId: 'p-new',
                workspaceId: 'w-stage',
                backendId: undefined,
                frontendId: undefined,
            });
        });
    });

    describe('start() guard', () => {
        it('an empty name starts nothing and leaves the machine idle', async () => {
            routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('');
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.result.current.projectName).toBe('');
            expect(mockRequest).not.toHaveBeenCalled();
        });
    });

    // Every phase resolves against the token it was started with. After reset() the
    // run is stale, so neither a resolution NOR a rejection may move the machine.
    describe('stale resolutions after reset()', () => {
        it('ignores a create rejection that lands after reset()', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await act(async () => {
                hook.result.current.start('My Demo');
            });
            const pending = route.latest('create-adobe-project');
            await act(async () => {
                hook.result.current.reset();
            });
            await act(async () => {
                pending.reject(new Error('socket closed'));
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.result.current.error).toBeUndefined();
            expect(hook.result.current.failedPhase).toBeUndefined();
        });

        it('ignores a get-workspaces resolution that lands after reset()', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            const pending = route.latest('get-workspaces');
            await act(async () => {
                hook.result.current.reset();
            });
            await act(async () => {
                pending.resolve({ success: true, data: [PROD_WS, STAGE_WS] });
            });

            expect(hook.result.current.phase).toBe('idle');
            // Only the create commit — no workspace commit from the stale run.
            expect(hook.updateState).toHaveBeenCalledTimes(1);
            expect(route.count('ensure-mesh-api-subscribed')).toBe(0);
        });

        it('ignores a get-workspaces rejection that lands after reset()', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startAndCreate(route, hook);
            const pending = route.latest('get-workspaces');
            await act(async () => {
                hook.result.current.reset();
            });
            await act(async () => {
                pending.reject(new Error('gateway timeout'));
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.result.current.error).toBeUndefined();
            expect(hook.result.current.failedPhase).toBeUndefined();
        });

        it('ignores an enable resolution that lands after reset()', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);
            const pending = route.latest('ensure-mesh-api-subscribed');
            await act(async () => {
                hook.result.current.reset();
            });
            await act(async () => {
                pending.resolve({ success: true });
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.result.current.enableResult).toBeUndefined();
        });

        it('ignores an enable rejection that lands after reset()', async () => {
            const route = routeDeferred();
            const hook = renderPhases();

            await startThroughWorkspace(route, hook);
            const pending = route.latest('ensure-mesh-api-subscribed');
            await act(async () => {
                hook.result.current.reset();
            });
            await act(async () => {
                pending.reject(new Error('timeout'));
            });

            expect(hook.result.current.phase).toBe('idle');
            expect(hook.result.current.error).toBeUndefined();
            expect(hook.result.current.failedPhase).toBeUndefined();
        });
    });
});
