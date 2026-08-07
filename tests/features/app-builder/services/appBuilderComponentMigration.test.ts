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

    it('reports per-component outcomes and does not claim success when one fails', async () => {
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
        expect(result.moved).toEqual(['erp-sync']);
        expect(result.failed).toEqual([{ id: 'eds-accs-mesh', error: 'mesh boom' }]);
    });

    it('is a no-op on a project with nothing deployed', async () => {
        const empty = { ...makeProject(), appBuilderComponents: {} } as Project;

        const result = await moveAppBuilderComponentsToDestination(empty, PREVIOUS, makeDeps([]));

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
        expect(mockTeardownRemote).not.toHaveBeenCalled();
    });
});
