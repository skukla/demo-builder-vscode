/**
 * consoleProjectTeardown — happy paths, skip logic, filtering, escalation
 * success, and progress reporting.
 *
 * Spike-validated design (.rptc/research/delete-aio-project/research.md):
 * single org-wide provider discovery pass keyed off `rel:update` hrefs;
 * per-workspace teardown order registrations → providers; project delete
 * last, aborted pre-emptively on any entity failure (the Console 409 is
 * opaque). Failure paths live in consoleProjectTeardown.errors.test.ts.
 */

// The orchestrator writes step-level debug lines (AI-5); no logger singleton
// exists under jest, so the module-level getLogger is stubbed.

import {
    teardownConsoleProject,
    type TeardownItem,
    type TeardownProgress,
} from '@/features/authentication/services/consoleProjectTeardown';
import type { RawProvider } from '@/features/authentication/services/ioEventsClient';
import {
    TARGET,
    CRED_WS1,
    WORKSPACES,
    boundProvider,
    makeHarness,
} from './consoleProjectTeardown.testUtils';

describe('teardownConsoleProject', () => {
    describe('no usable credential anywhere (skip-fast path)', () => {
        it('should skip every workspace and still delete the project when no credentials exist', async () => {
            const harness = makeHarness({ credentials: {} });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(true);
            expect(result.projectDeleted).toBe(true);
            expect(result.shouldClearConsoleSelection).toBe(true);
            const skipped = result.items.filter(
                (item) => item.kind === 'workspace' && item.outcome === 'skipped'
            );
            expect(skipped.map((item) => item.id)).toEqual(['ws1', 'ws2']);
            expect(harness.deps.deleteConsoleProject).toHaveBeenCalledWith('org1', 'proj1');
        });

        it('should treat an empty clientId as no usable credential', async () => {
            const harness = makeHarness({
                credentials: { ws1: { clientId: '', idIntegration: 'int-ws1' } },
            });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(true);
            expect(
                result.items.filter((item) => item.outcome === 'skipped').map((item) => item.id)
            ).toEqual(['ws1', 'ws2']);
            expect(harness.deps.createEventsClient).not.toHaveBeenCalled();
        });

        it('should never create credentials or subscribe in the no-credential path', async () => {
            const harness = makeHarness({ credentials: {} });

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.createWorkspaceS2SCredentialFor).not.toHaveBeenCalled();
            expect(harness.deps.subscribeManagementApi).not.toHaveBeenCalled();
            expect(harness.deps.createEventsClient).not.toHaveBeenCalled();
        });

        it('should treat a credential-scan failure as an absent credential', async () => {
            const harness = makeHarness();
            harness.deps.getWorkspaceS2SCredential.mockRejectedValue(new Error('scan boom'));

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(true);
            expect(result.projectDeleted).toBe(true);
            expect(result.items.filter((item) => item.outcome === 'skipped')).toHaveLength(
                WORKSPACES.length
            );
        });

        it('should delete a project that has no workspaces at all', async () => {
            const harness = makeHarness({ workspaces: [], credentials: {} });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(true);
            expect(result.items).toEqual([
                { kind: 'project', id: 'proj1', label: 'My Demo', outcome: 'deleted' },
            ]);
        });
    });

    describe('happy path (two credentialed workspaces)', () => {
        function makeHappyHarness() {
            const harness = makeHarness({
                providers: [
                    boundProvider('p1', 'proj1', 'ws1', 'Provider One'),
                    boundProvider('p2', 'proj1', 'ws2', 'Provider Two'),
                ],
            });
            harness
                .clientFor('client-ws1')
                .listRegistrations.mockResolvedValue([{ id: 'reg-a', name: 'Reg A' }]);
            return harness;
        }

        it('should produce the exact item list: registrations then providers per workspace, project last', async () => {
            const harness = makeHappyHarness();

            const result = await teardownConsoleProject(harness.deps, TARGET);

            const expected: TeardownItem[] = [
                {
                    kind: 'registration',
                    id: 'reg-a',
                    label: 'Reg A',
                    workspaceName: 'Production',
                    outcome: 'deleted',
                },
                {
                    kind: 'provider',
                    id: 'p1',
                    label: 'Provider One',
                    workspaceName: 'Production',
                    outcome: 'deleted',
                },
                {
                    kind: 'provider',
                    id: 'p2',
                    label: 'Provider Two',
                    workspaceName: 'Stage',
                    outcome: 'deleted',
                },
                { kind: 'project', id: 'proj1', label: 'My Demo', outcome: 'deleted' },
            ];
            expect(result.items).toEqual(expected);
        });

        it('should report success, projectDeleted, and shouldClearConsoleSelection', async () => {
            const harness = makeHappyHarness();

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(result.success).toBe(true);
            expect(result.projectDeleted).toBe(true);
            expect(result.shouldClearConsoleSelection).toBe(true);
        });

        it('should not subscribe when events access is already granted', async () => {
            const harness = makeHappyHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.subscribeManagementApi).not.toHaveBeenCalled();
        });

        it('should create each events client with the token and that workspace credential clientId', async () => {
            const harness = makeHappyHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.createEventsClient).toHaveBeenCalledWith({
                accessToken: 'token-abc',
                apiKey: 'client-ws1',
            });
            expect(harness.deps.createEventsClient).toHaveBeenCalledWith({
                accessToken: 'token-abc',
                apiKey: 'client-ws2',
            });
        });

        it('should run provider discovery exactly once, on the first usable credential', async () => {
            const harness = makeHappyHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').listProviders).toHaveBeenCalledTimes(1);
            expect(harness.clientFor('client-ws1').listProviders).toHaveBeenCalledWith('org1');
            expect(harness.clientFor('client-ws2').listProviders).not.toHaveBeenCalled();
        });

        it('should delete registrations with the workspace coordinates', async () => {
            const harness = makeHappyHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteRegistration).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws1',
                'reg-a'
            );
        });

        it('should delete each provider with its binding-parsed coordinates on its own workspace client', async () => {
            const harness = makeHappyHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteProvider).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws1',
                'p1'
            );
            expect(harness.clientFor('client-ws2').deleteProvider).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws2',
                'p2'
            );
        });

        it('should still check registrations for credentialed workspaces with no bound providers', async () => {
            const harness = makeHarness({
                providers: [boundProvider('p1', 'proj1', 'ws1')],
            });

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws2').listRegistrations).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws2'
            );
        });
    });

    describe('provider filtering', () => {
        it('should ignore providers whose metadata is not 3rd-party custom events', async () => {
            const systemProvider: RawProvider = {
                ...boundProvider('sys1', 'proj1', 'ws1'),
                provider_metadata: 'dx_commerce_events',
            };
            const harness = makeHarness({ providers: [systemProvider] });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteProvider).not.toHaveBeenCalled();
            expect(result.items.some((item) => item.kind === 'provider')).toBe(false);
        });

        it('should ignore providers bound to other projects', async () => {
            const harness = makeHarness({
                providers: [boundProvider('other1', 'other-project', 'ws1')],
            });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteProvider).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should never pass a provider with an unparseable rel:update href to deleteProvider', async () => {
            const unparseable: RawProvider = {
                id: 'bad1',
                provider_metadata: '3rd_party_custom_events',
                _links: { 'rel:update': { href: 'not-a-binding-href' } },
            };
            const missingLinks: RawProvider = {
                id: 'bad2',
                provider_metadata: '3rd_party_custom_events',
            };
            const harness = makeHarness({ providers: [unparseable, missingLinks] });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws1').deleteProvider).not.toHaveBeenCalled();
            expect(harness.clientFor('client-ws2').deleteProvider).not.toHaveBeenCalled();
            expect(result.items.some((item) => item.kind === 'provider')).toBe(false);
            expect(result.success).toBe(true);
        });
    });

    describe('escalation (credential-less workspace with bound providers)', () => {
        function makeEscalationHarness() {
            return makeHarness({
                credentials: { ws1: CRED_WS1 },
                providers: [boundProvider('p2', 'proj1', 'ws2', 'Orphan Provider')],
            });
        }

        it('should create and subscribe a credential for exactly the provider-bearing workspace', async () => {
            const harness = makeEscalationHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.createWorkspaceS2SCredentialFor).toHaveBeenCalledTimes(1);
            expect(harness.deps.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws2'
            );
            expect(harness.deps.subscribeManagementApi).toHaveBeenCalledWith('org1', 'int-ws2-new');
        });

        it('should delete the escalated workspace providers with the new credential client', async () => {
            const harness = makeEscalationHarness();

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws2-new').deleteProvider).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws2',
                'p2'
            );
            expect(result.success).toBe(true);
            expect(result.projectDeleted).toBe(true);
        });

        it('should check registrations on the escalated workspace too', async () => {
            const harness = makeEscalationHarness();

            await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.clientFor('client-ws2-new').listRegistrations).toHaveBeenCalledWith(
                'org1',
                'proj1',
                'ws2'
            );
        });

        it('should not escalate credential-less workspaces without bound providers', async () => {
            const harness = makeHarness({
                credentials: { ws1: CRED_WS1 },
                providers: [boundProvider('p1', 'proj1', 'ws1')],
            });

            const result = await teardownConsoleProject(harness.deps, TARGET);

            expect(harness.deps.createWorkspaceS2SCredentialFor).not.toHaveBeenCalled();
            expect(result.items).toContainEqual({
                kind: 'workspace',
                id: 'ws2',
                workspaceName: 'Stage',
                outcome: 'skipped',
            });
            expect(result.success).toBe(true);
        });
    });

    describe('progress reporting', () => {
        it('should emit four monotonically increasing steps with totalSteps 4', async () => {
            const harness = makeHarness();
            const progress: TeardownProgress[] = [];

            await teardownConsoleProject(harness.deps, TARGET, (p) => progress.push(p));

            expect(progress.map((p) => p.step)).toEqual([1, 2, 3, 4]);
            expect(progress.every((p) => p.totalSteps === 4)).toBe(true);
        });

        it('should emit human-readable messages', async () => {
            const harness = makeHarness();
            const progress: TeardownProgress[] = [];

            await teardownConsoleProject(harness.deps, TARGET, (p) => progress.push(p));

            expect(progress[0].message).toMatch(/workspace/i);
            expect(progress[progress.length - 1].message).toMatch(/project/i);
            expect(progress.every((p) => p.message.trim().length > 0)).toBe(true);
        });

        it('should emit all four steps (with a skip message for step 3) when the events phase is skipped', async () => {
            const harness = makeHarness({ credentials: {} });
            const progress: TeardownProgress[] = [];

            await teardownConsoleProject(harness.deps, TARGET, (p) => progress.push(p));

            expect(progress.map((p) => p.step)).toEqual([1, 2, 3, 4]);
            const stepThree = progress.find((p) => p.step === 3);
            expect(stepThree?.message).toMatch(/no event entities/i);
        });
    });
});
