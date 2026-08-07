/**
 * Moving a project's integrations when its Adobe destination changes.
 *
 * The destination is PROJECT-scoped — one Adobe project/workspace for every
 * integration — so changing it has to move them all (user decision 2026-08-07,
 * overturning the plan's original "future deploys only").
 *
 * The ordering is the whole safety story: deploy to the NEW destination BEFORE
 * tearing down the old one. Reversed, a failure halfway leaves the integration
 * gone from both. Namespaces differ per project+workspace, so being briefly live
 * in both collides with nothing.
 */

const mockDeployAppBuilderComponent = jest.fn();
const mockTeardownRemote = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    deployAppBuilderComponent: (...a: unknown[]) => mockDeployAppBuilderComponent(...a),
    teardownRemote: (...a: unknown[]) => mockTeardownRemote(...a),
}));

import { moveAppBuilderComponentsToDestination } from '@/features/app-builder/services/appBuilderComponentMigration';
import type { Project } from '@/types';

const PREVIOUS = { organization: '285361', projectId: 'old-proj', workspace: 'old-ws' };

function makeProject(): Project {
    return {
        name: 'demo',
        path: '/p/demo',
        adobe: { organization: '285361', projectId: 'new-proj', workspace: 'new-ws' },
        appBuilderComponents: {
            'erp-sync': { kind: 'integration', status: 'deployed' },
            'eds-accs-mesh': { kind: 'mesh', status: 'deployed' },
        },
    } as unknown as Project;
}

function makeDeps(calls: string[]) {
    return {
        catalog: [],
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        subscribeRequiredApis: jest.fn(async () => {
            calls.push('subscribe');
        }),
        saveProject: jest.fn(async () => undefined),
    } as never;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('moveAppBuilderComponentsToDestination', () => {
    it('deploys to the NEW destination before tearing down the old — per component', async () => {
        const calls: string[] = [];
        mockDeployAppBuilderComponent.mockImplementation(async (_p, id) => {
            calls.push(`deploy:${id}`);
            return { success: true };
        });
        mockTeardownRemote.mockImplementation(async (p, id) => {
            calls.push(`teardown:${id}`);
        });

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps(calls));

        // Sequence, not mere presence: an order-blind test passes against the
        // data-losing order, which is the bug this guards.
        expect(calls.indexOf('deploy:erp-sync')).toBeLessThan(calls.indexOf('teardown:erp-sync'));
        expect(calls.indexOf('deploy:eds-accs-mesh')).toBeLessThan(
            calls.indexOf('teardown:eds-accs-mesh')
        );
    });

    it('tears down against the PREVIOUS destination, not the new one', async () => {
        mockDeployAppBuilderComponent.mockResolvedValue({ success: true });
        mockTeardownRemote.mockResolvedValue(undefined);

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps([]));

        const teardownProject = mockTeardownRemote.mock.calls[0][0] as Project;
        expect(teardownProject.adobe).toMatchObject({
            projectId: 'old-proj',
            workspace: 'old-ws',
        });
    });

    it('leaves the OLD deployment alone when the new-destination deploy fails', async () => {
        mockDeployAppBuilderComponent.mockResolvedValue({ success: false, error: 'boom' });

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps([])
        );

        expect(mockTeardownRemote).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('re-subscribes APIs before deploying — the PUT is a full union against the new workspace', async () => {
        const calls: string[] = [];
        mockDeployAppBuilderComponent.mockImplementation(async (_p, id) => {
            calls.push(`deploy:${id}`);
            return { success: true };
        });
        mockTeardownRemote.mockResolvedValue(undefined);

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps(calls));

        expect(calls[0]).toBe('subscribe');
    });

    it('names what aborted the move, and leaves NOTHING moved', async () => {
        // All-or-nothing: erp-sync did move, but the mesh's failure aborts the
        // whole effort and erp-sync is put back, so `moved` is empty.
        mockDeployAppBuilderComponent.mockImplementation(async (_p, id) =>
            id === 'erp-sync' ? { success: true } : { success: false, error: 'mesh boom' }
        );
        mockTeardownRemote.mockResolvedValue(undefined);

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps([])
        );

        expect(result.success).toBe(false);
        expect(result.moved).toEqual([]);
        expect(result.failed).toEqual([{ id: 'eds-accs-mesh', error: 'mesh boom' }]);
        expect(result.rolledBack).toBe(true);
    });

    it('is a no-op on a project with nothing deployed', async () => {
        const empty = { ...makeProject(), appBuilderComponents: {} } as Project;

        const result = await moveAppBuilderComponentsToDestination(empty, PREVIOUS, makeDeps([]));

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockTeardownRemote).not.toHaveBeenCalled();
    });
});

/**
 * All-or-nothing (user decision 2026-08-07).
 *
 * A partially-moved project is the worst outcome: some integrations answer from
 * the new destination, some from the old, and no single place says so. A failed
 * deploy therefore ABORTS and undoes whatever already moved.
 *
 * Undoing a moved component is itself a migration in reverse — it is at the new
 * destination and gone from the old, so it must be deployed BACK to the old and
 * torn down at the new. `project.adobe` reverts with it.
 */
describe('moveAppBuilderComponentsToDestination — rollback on failure', () => {
    /** Deploy succeeds for everything except `failId`. */
    function deployFailingOn(failId: string, calls: string[]) {
        mockDeployAppBuilderComponent.mockImplementation(async (p: Project, id: string) => {
            const dest = p.adobe?.projectId;
            calls.push(`deploy:${id}@${dest}`);
            return id === failId
                ? { success: false, error: 'boom' }
                : { success: true };
        });
        mockTeardownRemote.mockImplementation(async (p: Project, id: string) => {
            calls.push(`teardown:${id}@${p.adobe?.projectId}`);
        });
    }

    it('redeploys an already-moved component back to the OLD destination', async () => {
        const calls: string[] = [];
        deployFailingOn('eds-accs-mesh', calls);

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps(calls));

        // erp-sync moved first, so it must be put back.
        expect(calls).toContain('deploy:erp-sync@old-proj');
    });

    it('tears the rolled-back component down at the NEW destination', async () => {
        const calls: string[] = [];
        deployFailingOn('eds-accs-mesh', calls);

        await moveAppBuilderComponentsToDestination(makeProject(), PREVIOUS, makeDeps(calls));

        expect(calls).toContain('teardown:erp-sync@new-proj');
    });

    it('restores project.adobe to the previous destination', async () => {
        const calls: string[] = [];
        deployFailingOn('eds-accs-mesh', calls);
        const project = makeProject();

        await moveAppBuilderComponentsToDestination(project, PREVIOUS, makeDeps(calls));

        expect(project.adobe).toMatchObject({ projectId: 'old-proj', workspace: 'old-ws' });
    });

    it('reports the abort as rolled back, with nothing left moved', async () => {
        const calls: string[] = [];
        deployFailingOn('eds-accs-mesh', calls);

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps(calls),
        );

        expect(result.success).toBe(false);
        expect(result.rolledBack).toBe(true);
        expect(result.moved).toEqual([]);
        // `rolledBack` and an empty `moved` are BOTH satisfied by doing nothing
        // at all — a control run with the rollback disabled passed this test until
        // the restore itself was asserted here.
        expect(calls).toContain('deploy:erp-sync@old-proj');
    });

    it('says so LOUDLY when the rollback itself fails — that state is not clean', async () => {
        const calls: string[] = [];
        mockDeployAppBuilderComponent.mockImplementation(async (p: Project, id: string) => {
            // erp-sync moves fine; the mesh fails; putting erp-sync back also fails.
            if (id === 'eds-accs-mesh') return { success: false, error: 'boom' };
            return p.adobe?.projectId === 'old-proj'
                ? { success: false, error: 'could not restore' }
                : { success: true };
        });
        mockTeardownRemote.mockResolvedValue(undefined);

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            PREVIOUS,
            makeDeps(calls),
        );

        expect(result.success).toBe(false);
        expect(result.rolledBack).toBe(false);
        expect(result.stranded).toEqual([
            { id: 'erp-sync', error: 'could not restore' },
        ]);
    });

    it('does not attempt a rollback when there was no previous destination', async () => {
        // Nothing was torn down, so nothing is missing — there is no old target
        // to put anything back to.
        const calls: string[] = [];
        deployFailingOn('erp-sync', calls);

        const result = await moveAppBuilderComponentsToDestination(
            makeProject(),
            undefined,
            makeDeps(calls),
        );

        expect(result.success).toBe(false);
        expect(calls.some((c) => c.startsWith('teardown:'))).toBe(false);
    });
});
