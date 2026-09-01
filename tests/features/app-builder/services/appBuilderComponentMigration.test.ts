/**
 * Moving a project's integrations when its Adobe destination changes.
 *
 * The destination is PROJECT-scoped — one Adobe project/workspace for every
 * integration — so changing it has to move them all (user decision 2026-08-07,
 * overturning the plan's original "future deploys only").
 *
 * A move DEPLOYS and never tears down (revised 2026-08-07). Undeploy is the only
 * irreversible step in the operation and nobody asked for cleanup, so the previous
 * destination is left serving. That removes the ordering hazard the first design
 * spent all its safety budget on: there is no state where a component is gone from
 * both destinations, because nothing is ever removed from one.
 */

const mockDeployAppBuilderComponent = jest.fn();
const mockTeardownRemote = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    deployAppBuilderComponent: (...a: unknown[]) => mockDeployAppBuilderComponent(...a),
    teardownRemote: (...a: unknown[]) => mockTeardownRemote(...a),
}));

import { moveAppBuilderComponentsToDestination } from '@/features/app-builder/services/appBuilderComponentMigration';
import type { Project } from '@/types/base';

import { createDeps } from './appBuilderComponentRunner.testUtils';
const PREVIOUS = { organization: '285361', projectId: 'old-proj', workspace: 'old-ws' };

function makeProject(): Project {
    return {
        name: 'demo',
        path: '/p/demo',
        adobe: { organization: '285361', projectId: 'new-proj', workspace: 'new-ws' },
        appBuilderComponents: {
            'eds-accs-mesh': {
                kind: 'mesh',
                status: 'deployed',
                endpoint: 'https://old-ws.adobeio-static.net/eds-accs-mesh',
                providesEnvVars: { MESH_ENDPOINT: 'endpoint' },
            },
            'erp-sync': { kind: 'integration', status: 'deployed' },
        },
        componentInstances: {
            'eds-accs-mesh': {
                path: '/p/demo/components/eds-accs-mesh',
                status: 'deployed',
                metadata: { meshId: 'mesh-id-at-OLD-ws', meshStatus: 'deployed' },
            },
            'erp-sync': { path: '/p/demo/components/erp-sync', status: 'ready' },
        },
    } as unknown as Project;
}

// Returns the REAL shape. `republishStorefront` resolves `{ success, error? }`;
// production awaits it best-effort and ignores the value, so `undefined` broke
// nothing — but the mock was answering in a shape the contract does not have.
const mockRepublish = jest.fn(async () => ({ success: true }));

/**
 * Built on the SHARED `createDeps` rather than a local literal.
 *
 * The literal named six members of a fourteen-member interface and reached the
 * callee through `as never`, so nothing checked the other eight — the migration
 * under test reads several of them. `createDeps` supplies the whole bag; this names
 * only what this suite actually varies.
 */
function makeDeps(calls: string[]) {
    return createDeps({
        catalog: [],
        subscribeRequiredApis: jest.fn(async () => {
            calls.push('subscribe');
        }),
        republishStorefront: jest.fn(async (...a: unknown[]) => mockRepublish(...(a as []))),
    });
}

/**
 * A deploy mock that behaves like the real one where it matters: a SUCCESS calls
 * `recordDeployOutcome`, which writes the new destination's namespace-scoped
 * `endpoint` onto the keyed entry and saves. A mock that only returns
 * `{success:true}` cannot see the bug this suite is about.
 */
function deployWritingEndpointsExcept(failingId: string) {
    mockDeployAppBuilderComponent.mockImplementation(async (p: Project, id: string) => {
        if (id === failingId) return { success: false, error: 'boom' };
        const entry = p.appBuilderComponents?.[id];
        if (entry) {
            entry.endpoint = `https://new-ws.adobeio-static.net/${id}`;
            entry.status = 'deployed';
        }
        const instance = p.componentInstances?.[id] as
            | { status?: string; metadata?: Record<string, unknown> }
            | undefined;
        if (instance) {
            instance.status = 'deployed';
            // The mesh tail stamps the NEW workspace's mesh id here
            // (appBuilderComponentRunner.ts). A mesh id belongs to exactly one
            // workspace, so this is the field most wrong after an abort.
            instance.metadata = { ...instance.metadata, meshId: `${id}-mesh-id-at-new-ws` };
        }
        return { success: true };
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('moveAppBuilderComponentsToDestination', () => {
    it('deploys every component to the new destination', async () => {
        const calls: string[] = [];
        mockDeployAppBuilderComponent.mockImplementation(async (_p: Project, id: string) => {
            calls.push(id);
            return { success: true };
        });

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps(calls)
        );

        expect(result.success).toBe(true);
        expect(result.moved.sort()).toEqual(['eds-accs-mesh', 'erp-sync']);
    });

    it('NEVER tears anything down — the old deployment is left serving', async () => {
        // The single most important assertion here. Undeploy is the only
        // irreversible step in the operation, nobody asked for cleanup, and the
        // old namespace is a free rollback if the new destination is wrong.
        mockDeployAppBuilderComponent.mockResolvedValue({ success: true });

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps([]));

        expect(mockTeardownRemote).not.toHaveBeenCalled();
    });

    it('re-subscribes APIs before deploying — the PUT is a full union against the new workspace', async () => {
        const calls: string[] = [];
        mockDeployAppBuilderComponent.mockImplementation(async (_p: Project, id: string) => {
            calls.push(`deploy:${id}`);
            return { success: true };
        });

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps(calls));

        expect(calls[0]).toBe('subscribe');
    });

    it('is a no-op on a project with nothing deployed', async () => {
        const empty = { ...makeProject(), appBuilderComponents: {} } as Project;

        const result = await moveAppBuilderComponentsToDestination(empty, PREVIOUS, makeDeps([]));

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('is a no-op when the destination did not change', async () => {
        mockDeployAppBuilderComponent.mockResolvedValue({ success: true });
        const SAME = { organization: '285361', projectId: 'new-proj', workspace: 'new-ws' };

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            SAME,
            makeDeps([])
        );

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
    });
});

/**
 * Aborting is now cheap, because nothing was destroyed.
 *
 * With no teardown, a failed deploy leaves the old destination untouched and
 * serving. Undoing is just pointing the project back at it — no redeploy, no
 * reverse walk, and the "gone from both" state is unreachable by construction.
 */
describe('moveAppBuilderComponentsToDestination — a failed deploy', () => {
    it('points the project back at the previous destination', async () => {
        mockDeployAppBuilderComponent.mockResolvedValue({ success: false, error: 'boom' });
        const project = makeProject();

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, makeDeps([]));

        expect(result.success).toBe(false);
        expect(result.rolledBack).toBe(true);
        expect(project.adobe).toMatchObject({ projectId: 'old-proj', workspace: 'old-ws' });
    });

    it('names what aborted it', async () => {
        deployWritingEndpointsExcept('erp-sync');

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps([])
        );

        expect(result.failed).toEqual([{ id: 'erp-sync', error: 'boom' }]);
    });

    it('reports what DID reach the new destination rather than pretending nothing did', async () => {
        // Those deployments stay. Removing them would be the same unasked-for
        // deletion this design exists to avoid — so the honest move is to name them.
        deployWritingEndpointsExcept('erp-sync');

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps([])
        );

        expect(result.moved).toEqual(['eds-accs-mesh']);
        expect(mockTeardownRemote).not.toHaveBeenCalled();
    });
});

/**
 * Telegraphing the move on the cards.
 *
 * Found by inspection 2026-08-07 before the live run: a two-integration move
 * showed a progress notification and NOTHING on the grid — both cards read
 * DEPLOYED throughout, so a multi-minute move looked like an idle page. The
 * handler correctly passes no `pushCardStatus` (a project-scoped operation has no
 * one owning card), and then nothing filled the per-component gap.
 *
 * The callback is optional because the migration must stay callable without a
 * webview; every assertion here is about ORDER, since a card told "deploying"
 * after its deploy finished is the same as not being told.
 */
describe('moveAppBuilderComponentsToDestination — what the cards are told', () => {
    /** Interleave status pushes with deploys so order is assertable. */
    function recordingRun() {
        const calls: string[] = [];
        mockDeployAppBuilderComponent.mockImplementation(async (_p: Project, id: string) => {
            calls.push(`deploy:${id}`);
            return { success: true };
        });
        const onRowStatus = jest.fn((id: string, status: string) => {
            calls.push(`${status}:${id}`);
        });
        return { calls, onRowStatus };
    }

    it('tells EVERY card up front, before the API subscribe', async () => {
        const { calls, onRowStatus } = recordingRun();

        await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps(calls),
            onRowStatus
        );

        // Assert the WHOLE sequence, not a pair of index comparisons. `indexOf`
        // returns -1 for an absent entry and -1 is less than everything, so
        // `toBeLessThan` passed against a migration that pushed no status at all
        // — caught by running this test before implementing it.
        //
        // Every card first, THEN the subscribe. Marking them one at a time inside
        // the loop left the whole grid reading DEPLOYED until the subscribe round
        // trip finished, which is the lag reported live 2026-08-07: "I see the move
        // happening but the cards still just say Deployed."
        expect(calls).toEqual([
            'deploying:eds-accs-mesh',
            'deploying:erp-sync',
            'subscribe',
            'deploy:eds-accs-mesh',
            'deployed:eds-accs-mesh',
            'deploy:erp-sync',
            'deployed:erp-sync',
        ]);
    });

    it('settles each card as it lands, not all at the end', async () => {
        const { calls, onRowStatus } = recordingRun();

        await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps(calls),
            onRowStatus
        );

        // Card 1 settles before card 2's deploy even starts. Batching every
        // 'deployed' at the end would leave a two-integration move showing no
        // progress until the whole thing finished.
        expect(calls).toContain('deployed:eds-accs-mesh');
        expect(calls.indexOf('deployed:eds-accs-mesh')).toBeLessThan(
            calls.indexOf('deploy:erp-sync')
        );
    });

    it('names the KIND on the in-flight line, so the mesh does not say "Integration"', async () => {
        const { calls, onRowStatus } = recordingRun();

        await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps(calls),
            onRowStatus
        );

        expect(onRowStatus).toHaveBeenCalledWith('erp-sync', 'deploying', 'Deploying Integration');
        expect(onRowStatus).toHaveBeenCalledWith('eds-accs-mesh', 'deploying', 'Deploying Mesh');
    });

    it('marks the failing card as errored rather than leaving it spinning', async () => {
        const onRowStatus = jest.fn();
        mockDeployAppBuilderComponent.mockResolvedValue({ success: false, error: 'boom' });

        await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps([]),
            onRowStatus
        );

        expect(onRowStatus).toHaveBeenCalledWith('eds-accs-mesh', 'error', 'boom');
    });

    it('runs without a callback — the migration must not require a webview', async () => {
        mockDeployAppBuilderComponent.mockResolvedValue({ success: true });

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps([])
        );

        expect(result.success).toBe(true);
    });
});

/**
 * An abort must restore the RECORDS, not just the pointer.
 *
 * Reported live 2026-08-08: after a failed move the header named the old
 * destination while the mesh card offered an Endpoint in the NEW one. Reverting
 * `project.adobe` alone leaves behind everything a successful deploy wrote —
 * `recordDeployOutcome` persists namespace-scoped `endpoint`/`url`/`deployedUrls`
 * and mirrors status onto the component instance, and a component that provides
 * env vars also republishes the storefront against its new endpoint.
 *
 * The dashboard was not merely missing information; it was pointing at a Console
 * project the header claimed the project did not use.
 */
describe('moveAppBuilderComponentsToDestination — an abort restores what the deploys wrote', () => {
    it('puts the endpoint back, so no card links into the abandoned destination', async () => {
        deployWritingEndpointsExcept('erp-sync');
        const project = makeProject();

        await moveAppBuilderComponentsToDestination(project, PREVIOUS, makeDeps([]));

        expect(project.appBuilderComponents?.['eds-accs-mesh']?.endpoint).toBe(
            'https://old-ws.adobeio-static.net/eds-accs-mesh'
        );
    });

    it('puts the component INSTANCE status back too', async () => {
        // A second record carries status, read by a different surface
        // (`handleRequestStatus`). Restoring one and not the other just moves the
        // disagreement somewhere less visible.
        deployWritingEndpointsExcept('erp-sync');
        const project = makeProject();
        (project.componentInstances as Record<string, { status: string }>)['eds-accs-mesh'].status =
            'ready';

        await moveAppBuilderComponentsToDestination(project, PREVIOUS, makeDeps([]));

        expect(
            (project.componentInstances as Record<string, { status: string }>)['eds-accs-mesh']
                .status
        ).toBe('ready');
    });

    it('puts the mesh id back — the field that names a workspace outright', async () => {
        // `componentInstances[id].metadata.meshId` is what meshVerifier compares
        // against a live describe. A mesh id exists in exactly ONE workspace, so
        // leaving the new one behind makes every later verification report a
        // mismatch against the destination the project actually points at.
        deployWritingEndpointsExcept('erp-sync');
        const project = makeProject();

        await moveAppBuilderComponentsToDestination(project, PREVIOUS, makeDeps([]));

        const meta = (
            project.componentInstances as Record<string, { metadata?: { meshId?: string } }>
        )['eds-accs-mesh'].metadata;
        expect(meta?.meshId).toBe('mesh-id-at-OLD-ws');
    });

    it('republishes the storefront, which a successful deploy already pointed at the new mesh', async () => {
        // `republishIfProvided` runs inside the deploy. Restoring the records
        // without this leaves the storefront calling the new destination's mesh —
        // the one externally visible half of the rollback.
        deployWritingEndpointsExcept('erp-sync');

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps([]));

        expect(mockRepublish).toHaveBeenCalled();
    });

    it('leaves records ALONE when the move succeeds', async () => {
        // The restore must be reachable only from the abort. Restoring on success
        // would undo the entire move's bookkeeping.
        deployWritingEndpointsExcept('none-fail');
        const project = makeProject();

        const result = await moveAppBuilderComponentsToDestination(project, PREVIOUS, makeDeps([]));

        expect(result.success).toBe(true);
        expect(project.appBuilderComponents?.['eds-accs-mesh']?.endpoint).toBe(
            'https://new-ws.adobeio-static.net/eds-accs-mesh'
        );
    });
});
