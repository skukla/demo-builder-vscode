/**
 * meshRedeploy — the create-or-update rule, sourced from REMOTE truth.
 *
 * WRITTEN 2026-08-28 as phase-2 of the ADR-015 convergence: this module had NO
 * test, and it is the ONE place encoding a rule whose failure is expensive —
 * an untargeted deploy once sent a LIVE mesh down the create path because
 * local metadata was stale. All three redeploy surfaces route through here, so
 * a silent break here breaks them all.
 *
 * What the witness pins: the remote probe happening at all, and the id it
 * returns being handed to the deploy spine (that id IS the create-vs-update
 * switch), together with the executor and the caller's progress surface.
 *
 * CONVERTED 2026-08-28 (ADR-015): the executor is now handed IN rather than
 * fetched, so this suite no longer mocks the service registry at all — one
 * module mock deleted, assertions unchanged.
 */

const mockDeployMeshComponent = jest.fn();
const mockFetchMeshInfo = jest.fn();
/** A plain fake, handed in — no module mock needed since ADR-015. */
const executor = { execute: jest.fn() } as never;

jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: (...args: unknown[]) => mockDeployMeshComponent(...args),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    fetchMeshInfoFromAdobeIO: (...args: unknown[]) => mockFetchMeshInfo(...args),
}));

import { deployMeshCreateOrUpdate } from '@/features/mesh/services/meshRedeploy';
import type { Logger } from '@/types/logger';

const MESH_PATH = '/projects/demo/components/commerce-mesh';

function makeLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDeployMeshComponent.mockResolvedValue({ success: true });
});

describe('deployMeshCreateOrUpdate', () => {
    it('an EXISTING remote mesh takes the UPDATE path — its id reaches the deploy spine', async () => {
        mockFetchMeshInfo.mockResolvedValue({ meshId: 'mesh-abc123' });
        const logger = makeLogger();
        const onProgress = jest.fn();

        await deployMeshCreateOrUpdate(MESH_PATH, executor, logger, onProgress);

        // The whole point of the module: the remote id is the create-vs-update
        // switch, and it must arrive as the spine's 5th argument.
        expect(mockDeployMeshComponent).toHaveBeenCalledWith(
            MESH_PATH,
            executor,
            logger,
            onProgress,
            'mesh-abc123'
        );
    });

    it('NO remote mesh takes the create path — an empty id, never undefined', async () => {
        mockFetchMeshInfo.mockResolvedValue(undefined);

        await deployMeshCreateOrUpdate(MESH_PATH, executor, makeLogger());

        expect(mockDeployMeshComponent).toHaveBeenCalledWith(
            MESH_PATH,
            executor,
            expect.anything(),
            undefined,
            ''
        );
    });

    it('a remote answer WITHOUT an id is treated as no mesh (never a falsy id)', async () => {
        mockFetchMeshInfo.mockResolvedValue({ meshId: '' });

        await deployMeshCreateOrUpdate(MESH_PATH, executor, makeLogger());

        expect(mockDeployMeshComponent.mock.calls[0][4]).toBe('');
    });

    it('asks REMOTE truth before deploying — local metadata is never the source', async () => {
        mockFetchMeshInfo.mockResolvedValue({ meshId: 'mesh-1' });
        const logger = makeLogger();

        await deployMeshCreateOrUpdate(MESH_PATH, executor, logger);

        expect(mockFetchMeshInfo).toHaveBeenCalledWith(logger);
        expect(mockFetchMeshInfo).toHaveBeenCalledTimes(1);
    });

    it('returns the spine result unchanged — callers map their own failures', async () => {
        mockFetchMeshInfo.mockResolvedValue({ meshId: 'mesh-1' });
        const failure = { success: false, error: 'deploy exploded' };
        mockDeployMeshComponent.mockResolvedValue(failure);

        await expect(deployMeshCreateOrUpdate(MESH_PATH, executor, makeLogger())).resolves.toBe(failure);
    });
});
