/**
 * consoleProjectTeardown — failure handling.
 *
 * Covers: token/workspace-listing failures, discovery 403 recovery
 * (subscribe-on-403 + propagation retries at 2s/5s/10s, fake timers),
 * escalation failures, per-entity collect-don't-throw semantics, and the
 * pre-emptive project-delete abort (the Console 409 is opaque, so teardown
 * never attempts the delete while any item has failed).
 */

// Step-level debug logging (AI-5) — no logger singleton exists under jest.
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { teardownConsoleProject } from '@/features/authentication/services/consoleProjectTeardown';
import { PROPAGATION_RETRY_DELAYS } from '@/features/authentication/services/consoleProjectTeardownEvents';
import {
    TARGET,
    CRED_WS1,
    accessDenied,
    boundProvider,
    makeHarness,
} from './consoleProjectTeardown.testUtils';

describe('teardownConsoleProject failure handling', () => {
    describe('access token and workspace-listing failures', () => {
        it('should return a failed result with zero further calls when the token is unavailable', async () => {
            const harness = makeHarness();
            harness.deps.getAccessToken.mockRejectedValue(new Error('not signed in'));

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(result.shouldClearConsoleSelection).toBe(false);
            expect(result.items.filter((item) => item.outcome === 'failed')).toHaveLength(1);
            expect(harness.deps.getWorkspaces).not.toHaveBeenCalled();
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });

        it('should return a failed result without scanning credentials when listing workspaces fails', async () => {
            const harness = makeHarness();
            harness.deps.getWorkspaces.mockRejectedValue(new Error('console down'));

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(harness.deps.getWorkspaceS2SCredential).not.toHaveBeenCalled();
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });
    });

    describe('discovery access recovery (fake timers)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should subscribe once on 403 and succeed on the first propagation retry', async () => {
            const harness = makeHarness();
            harness
                .clientFor('client-ws1')
                .listProviders.mockRejectedValueOnce(accessDenied())
                .mockResolvedValueOnce([boundProvider('p1', 'proj1', 'ws1')]);

            const resultPromise = teardownConsoleProject(harness.deps, TARGET);
            await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[0]);
            const result = await resultPromise;

            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledTimes(1);
            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledWith('org1', 'int-ws1');
            expect(harness.clientFor('client-ws1').listProviders).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
            expect(result.projectDeleted).toBe(true);
        });

        it('should retry a rejected subscribe exactly once and then proceed', async () => {
            const harness = makeHarness();
            harness.deps.subscribeManagementApi
                .mockRejectedValueOnce(new Error('subscribe hiccup'))
                .mockResolvedValueOnce(undefined);
            harness
                .clientFor('client-ws1')
                .listProviders.mockRejectedValueOnce(accessDenied())
                .mockResolvedValueOnce([]);

            const resultPromise = teardownConsoleProject(harness.deps, TARGET);
            await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[0]);
            const result = await resultPromise;

            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
        });

        it('should abort without deleting the project when the subscribe fails twice', async () => {
            const harness = makeHarness();
            harness.deps.subscribeManagementApi.mockRejectedValue(new Error('subscribe broken'));
            harness.clientFor('client-ws1').listProviders.mockRejectedValue(accessDenied());

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });

        it('should retry discovery on the 2s/5s/10s propagation schedule', async () => {
            const harness = makeHarness();
            harness.clientFor('client-ws1').listProviders.mockRejectedValue(accessDenied());
            const listProviders = harness.clientFor('client-ws1').listProviders;

            const resultPromise = teardownConsoleProject(harness.deps, TARGET);
            await jest.advanceTimersByTimeAsync(0);
            expect(listProviders).toHaveBeenCalledTimes(1);
            await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[0]);
            expect(listProviders).toHaveBeenCalledTimes(2);
            await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[1]);
            expect(listProviders).toHaveBeenCalledTimes(3);
            await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[2]);
            expect(listProviders).toHaveBeenCalledTimes(4);

            await resultPromise;
        });

        it('should collect a failed item and abort when propagation retries are exhausted', async () => {
            const harness = makeHarness();
            harness.clientFor('client-ws1').listProviders.mockRejectedValue(accessDenied());
            const totalDelay = PROPAGATION_RETRY_DELAYS.reduce((sum, ms) => sum + ms, 0);

            const resultPromise = teardownConsoleProject(harness.deps, TARGET);
            await jest.advanceTimersByTimeAsync(totalDelay);
            const result = await resultPromise;

            expect(harness.clientFor('client-ws1').listProviders).toHaveBeenCalledTimes(4);
            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledTimes(1);
            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(result.items.filter((item) => item.outcome === 'failed')).toHaveLength(1);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });

        it('should abort without subscribing when discovery fails with a non-access error', async () => {
            const harness = makeHarness();
            harness
                .clientFor('client-ws1')
                .listProviders.mockRejectedValue(new Error('network down'));

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.subscribeManagementApi).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });

        it('should recover a per-workspace registration listing 403 by subscribing that workspace credential', async () => {
            const harness = makeHarness();
            harness
                .clientFor('client-ws2')
                .listRegistrations.mockRejectedValueOnce(accessDenied('List registrations'))
                .mockResolvedValueOnce([{ id: 'reg-z' }]);

            const resultPromise = teardownConsoleProject(harness.deps, TARGET);
            await jest.advanceTimersByTimeAsync(PROPAGATION_RETRY_DELAYS[0]);
            const result = await resultPromise;

            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledWith('org1', 'int-ws2');
            expect(harness.clientFor('client-ws2').deleteRegistration).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws2',
                'reg-z'
            );
            expect(result.success).toBe(true);
        });
    });

    describe('escalation failures', () => {
        function makeEscalationHarness() {
            return makeHarness({
                credentials: { ws1: CRED_WS1 },
                providers: [
                    boundProvider('p1', 'proj1', 'ws1', 'Kept Provider'),
                    boundProvider('p2', 'proj1', 'ws2', 'Orphan Provider'),
                ],
            });
        }

        it('should mark the workspace and its providers failed when the escalation create fails', async () => {
            const harness = makeEscalationHarness();
            harness.deps.createWorkspaceS2SCredentialFor.mockRejectedValue(
                new Error('create denied')
            );

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(
                result.items.some(
                    (item) =>
                        item.kind === 'workspace' && item.id === 'ws2' && item.outcome === 'failed'
                )
            ).toBe(true);
            expect(
                result.items.some(
                    (item) =>
                        item.kind === 'provider' && item.id === 'p2' && item.outcome === 'failed'
                )
            ).toBe(true);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });

        it('should still process credentialed workspaces when an escalation fails', async () => {
            const harness = makeEscalationHarness();
            harness.deps.createWorkspaceS2SCredentialFor.mockRejectedValue(
                new Error('create denied')
            );

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').listRegistrations).toHaveBeenCalled();
            expect(harness.clientFor('client-ws1').deleteProvider).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws1',
                'p1'
            );
            expect(
                result.items.some(
                    (item) =>
                        item.kind === 'provider' && item.id === 'p1' && item.outcome === 'deleted'
                )
            ).toBe(true);
        });

        it('should mark the escalated providers failed when the escalation subscribe fails twice', async () => {
            const harness = makeEscalationHarness();
            harness.deps.subscribeManagementApi.mockRejectedValue(new Error('subscribe broken'));

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledTimes(2);
            expect(
                result.items.some(
                    (item) =>
                        item.kind === 'provider' && item.id === 'p2' && item.outcome === 'failed'
                )
            ).toBe(true);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
        });
    });

    describe('per-entity failures (collect, do not throw)', () => {
        it('should attempt remaining registrations and providers after one registration delete fails, then abort', async () => {
            const harness = makeHarness({
                providers: [
                    boundProvider('p1', 'proj1', 'ws1'),
                    boundProvider('p2', 'proj1', 'ws2'),
                ],
            });
            harness
                .clientFor('client-ws1')
                .listRegistrations.mockResolvedValue([{ id: 'reg-1' }, { id: 'reg-2' }]);
            harness
                .clientFor('client-ws1')
                .deleteRegistration.mockRejectedValueOnce(new Error('delete denied'))
                .mockResolvedValueOnce(undefined);

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteRegistration).toHaveBeenCalledTimes(2);
            expect(harness.clientFor('client-ws1').deleteProvider).toHaveBeenCalledTimes(1);
            expect(harness.clientFor('client-ws2').deleteProvider).toHaveBeenCalledTimes(1);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(
                result.items.some(
                    (item) =>
                        item.kind === 'registration' &&
                        item.id === 'reg-1' &&
                        item.outcome === 'failed'
                )
            ).toBe(true);
        });

        it('should attempt the remaining providers after one provider delete fails, then abort', async () => {
            const harness = makeHarness({
                providers: [
                    boundProvider('p1a', 'proj1', 'ws1'),
                    boundProvider('p1b', 'proj1', 'ws1'),
                ],
            });
            harness
                .clientFor('client-ws1')
                .deleteProvider.mockRejectedValueOnce(new Error('provider stuck'))
                .mockResolvedValueOnce(undefined);

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteProvider).toHaveBeenCalledTimes(2);
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should collect a failed workspace item on a non-access registration listing error and still attempt its providers', async () => {
            const harness = makeHarness({
                providers: [boundProvider('p1', 'proj1', 'ws1')],
            });
            harness
                .clientFor('client-ws1')
                .listRegistrations.mockRejectedValue(new Error('listing exploded'));

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.subscribeManagementApi).not.toHaveBeenCalled();
            expect(
                result.items.some(
                    (item) =>
                        item.kind === 'workspace' && item.id === 'ws1' && item.outcome === 'failed'
                )
            ).toBe(true);
            expect(harness.clientFor('client-ws1').deleteProvider).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws1',
                'p1'
            );
            expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });
    });

    describe('project delete failure (opaque Console 409)', () => {
        it('should collect a failed project item and not signal console-selection clearing', async () => {
            const harness = makeHarness();
            harness.deps.deleteConsoleProject.mockRejectedValue(
                new Error('409 ERR_MSG_PROJECT_DELETE_FORBIDDEN')
            );

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(false);
            expect(result.projectDeleted).toBe(false);
            expect(result.shouldClearConsoleSelection).toBe(false);
            const projectItem = result.items[result.items.length - 1];
            expect(projectItem.kind).toBe('project');
            expect(projectItem.outcome).toBe('failed');
            expect(projectItem.error).toContain('ERR_MSG_PROJECT_DELETE_FORBIDDEN');
        });

        // Adobe documents THREE conditions that block a project delete; this
        // teardown pre-empts one (event registrations + 3rd-party providers).
        // The other two are not detectable from here — the Console SDK exposes
        // no app-submission status, and the shared-package check would need
        // Runtime credentials per workspace that this flow never holds. So the
        // failure cannot be prevented, only explained: Console's 409 never names
        // its cause, which is the whole reason this module exists.
        it('names the blockers it could not pre-empt, and the remedy', async () => {
            const harness = makeHarness();
            harness.deps.deleteConsoleProject.mockRejectedValue(
                new Error('409 ERR_MSG_PROJECT_DELETE_FORBIDDEN')
            );

            const result = await teardownConsoleProject(harness.deps, TARGET);

            const error = result.items[result.items.length - 1].error ?? '';
            // The raw Console message survives — guidance is added, never swapped in.
            expect(error).toContain('ERR_MSG_PROJECT_DELETE_FORBIDDEN');
            expect(error).toMatch(/submitted for approval/i);
            expect(error).toMatch(/revoke/i);
            expect(error).toMatch(/shared package/i);
        });
    });
});
