/**
 * check-api-mesh: the two detection layers and what each one reports.
 *
 * Layer 1 downloads the workspace config; Layer 2 is the CLI fallback taken when
 * anything in Layer 1 throws. `checkMeshExistence` and `fallbackMeshCheck` are
 * driven directly here so every mesh-status branch is reachable — including the
 * `default` arm, which the real helper never produces. `checkApiMeshEnabled`
 * stays REAL so the services array the handler extracts is what decides.
 */

import { handleCheckApiMesh } from '@/features/mesh/handlers/checkHandler';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import {
    createMeshCheckContext,
    createMeshServiceDoubles,
    MESH_SERVICE,
    workspaceConfigJson,
} from './checkHandler.testUtils';

const mockCheckMeshExistence = jest.fn();
const mockFallbackMeshCheck = jest.fn();
jest.mock('@/features/mesh/services/meshCheckHelpers', () => ({
    ...jest.requireActual('@/features/mesh/services/meshCheckHelpers'),
    checkMeshExistence: (...args: unknown[]) => mockCheckMeshExistence(...args),
    fallbackMeshCheck: (...args: unknown[]) => mockFallbackMeshCheck(...args),
}));

jest.mock('@/core/di/serviceLocator');
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        mkdtemp: jest.fn(),
        readFile: jest.fn(),
        rm: jest.fn(),
    },
}));

const fsPromises = jest.requireMock('fs').promises as {
    mkdir: jest.Mock;
    mkdtemp: jest.Mock;
    readFile: jest.Mock;
    rm: jest.Mock;
};

const TEMP_DIR = '/tmp/aio-workspace-test';
const WORKSPACE = 'workspace-123';
const CONSTRUCTED_ENDPOINT = (meshId: string) =>
    `https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`;

describe('checkHandler - detection layers', () => {
    let context: HandlerContext;
    let doubles: ReturnType<typeof createMeshServiceDoubles>;

    beforeEach(() => {
        jest.clearAllMocks();
        doubles = createMeshServiceDoubles();
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(doubles.authService);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(doubles.commandExecutor);

        fsPromises.mkdir.mockResolvedValue(undefined);
        fsPromises.mkdtemp.mockResolvedValue(TEMP_DIR);
        fsPromises.rm.mockResolvedValue(undefined);
        // Layer 1 succeeds and reports the API Mesh service present by default.
        fsPromises.readFile.mockResolvedValue(workspaceConfigJson([MESH_SERVICE]));
        mockCheckMeshExistence.mockResolvedValue({ meshExists: false });
        mockFallbackMeshCheck.mockResolvedValue({ apiEnabled: true, meshExists: false });

        context = createMeshCheckContext();
    });

    describe('Layer 1 — workspace config', () => {
        it('creates the temp directory recursively and removes it on the success path', async () => {
            await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(fsPromises.mkdir).toHaveBeenCalledWith('/tmp/test-storage/temp', {
                recursive: true,
            });
            expect(fsPromises.rm).toHaveBeenCalledWith(TEMP_DIR, {
                recursive: true,
                force: true,
            });
        });

        it('reads the config the download was told to write', async () => {
            await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            const configPath = `${TEMP_DIR}/workspace-config.json`;
            expect(doubles.commandExecutor.execute).toHaveBeenCalledWith(
                `aio console workspace download "${configPath}" --workspaceId ${WORKSPACE}`,
            );
            expect(fsPromises.readFile).toHaveBeenCalledWith(configPath, 'utf-8');
        });

        it('reports the API absent, and checks no further, when no mesh service is listed', async () => {
            fsPromises.readFile.mockResolvedValue(workspaceConfigJson([{ name: 'Other API' }]));

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({ success: true, apiEnabled: false, meshExists: false });
            expect(mockCheckMeshExistence).not.toHaveBeenCalled();
        });

        it('hands the live command executor to the mesh-existence check', async () => {
            await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(mockCheckMeshExistence).toHaveBeenCalledWith(doubles.commandExecutor);
        });

        it('reports API enabled with no mesh, and no error, when none exists yet', async () => {
            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({ success: true, apiEnabled: true, meshExists: false });
            expect(context.sharedState.meshExistedBeforeSession).toBeUndefined();
        });
    });

    describe('Layer 1 — an existing mesh', () => {
        it('reports a deployed mesh with its resolved endpoint', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: 'mesh-abc',
            });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-abc',
                meshStatus: 'deployed',
                endpoint: CONSTRUCTED_ENDPOINT('mesh-abc'),
            });
        });

        it('records the workspace whose mesh predates this session', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: 'mesh-abc',
            });

            await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(context.sharedState.meshExistedBeforeSession).toBe(WORKSPACE);
        });

        it('leaves the endpoint unresolved when the mesh has no id', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: undefined,
            });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: undefined,
                meshStatus: 'deployed',
                endpoint: undefined,
            });
        });

        it('reports an errored mesh as recoverable rather than as a failure', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshStatus: 'error',
                meshId: 'mesh-err',
                error: 'boom'.repeat(400),
            });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-err',
                meshStatus: 'error',
                endpoint: CONSTRUCTED_ENDPOINT('mesh-err'),
                error:
                    'Mesh is in error state from a previous deployment. ' +
                    'Deployment will attempt automatic recovery.',
            });
        });

        it('reports the same errored result when the helper supplies no error detail', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshStatus: 'error',
                meshId: 'mesh-err',
            });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toMatchObject({
                success: true,
                meshStatus: 'error',
                error: expect.stringContaining('automatic recovery'),
            });
        });

        it('reports a provisioning mesh as pending', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshStatus: 'pending',
                meshId: 'mesh-pend',
            });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'mesh-pend',
                meshStatus: 'pending',
                endpoint: CONSTRUCTED_ENDPOINT('mesh-pend'),
                error: 'Mesh is currently being provisioned. This could take up to 2 minutes.',
            });
        });

        it('withholds an unclassifiable mesh — no id, no status, meshExists false', async () => {
            mockCheckMeshExistence.mockResolvedValue({
                meshExists: true,
                meshId: 'mesh-unknown',
                meshStatus: undefined,
            });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({
                success: true,
                apiEnabled: true,
                meshExists: false,
                error: 'Unable to determine mesh status. Try refreshing or check Adobe Console.',
            });
        });
    });

    describe('Layer 2 — the fallback', () => {
        /** A Layer-2 answer no Layer-1 path produces, so the two are told apart. */
        const DISTINCT_LAYER_2 = {
            apiEnabled: true,
            meshExists: true,
            meshId: 'fallback-mesh',
            meshStatus: 'deployed' as const,
        };

        it('falls back when the workspace config cannot be parsed', async () => {
            fsPromises.readFile.mockResolvedValue('not json at all');
            mockFallbackMeshCheck.mockResolvedValue(DISTINCT_LAYER_2);

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(mockFallbackMeshCheck).toHaveBeenCalledWith(doubles.commandExecutor);
            expect(result).toEqual({
                success: true,
                apiEnabled: true,
                meshExists: true,
                meshId: 'fallback-mesh',
                meshStatus: 'deployed',
                endpoint: undefined,
            });
        });

        it('removes the temp directory before falling back', async () => {
            fsPromises.readFile.mockRejectedValue(new Error('download failed'));

            await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(fsPromises.rm).toHaveBeenCalledWith(TEMP_DIR, {
                recursive: true,
                force: true,
            });
        });

        it('still falls back when the temp cleanup itself fails', async () => {
            fsPromises.readFile.mockRejectedValue(new Error('download failed'));
            fsPromises.rm.mockRejectedValue(new Error('EBUSY'));
            mockFallbackMeshCheck.mockResolvedValue(DISTINCT_LAYER_2);

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toMatchObject({ success: true, meshId: 'fallback-mesh' });
        });

        it('reports the API absent when the fallback says so', async () => {
            fsPromises.readFile.mockRejectedValue(new Error('download failed'));
            mockFallbackMeshCheck.mockResolvedValue({ apiEnabled: false, meshExists: false });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({ success: true, apiEnabled: false, meshExists: false });
        });

        it('reports API enabled with no mesh, and no error, when the fallback finds none', async () => {
            fsPromises.readFile.mockRejectedValue(new Error('download failed'));
            mockFallbackMeshCheck.mockResolvedValue({ apiEnabled: true, meshExists: false });

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({ success: true, apiEnabled: true, meshExists: false });
        });

        it('surfaces a fallback failure as an unknown-code error result', async () => {
            fsPromises.readFile.mockRejectedValue(new Error('download failed'));
            mockFallbackMeshCheck.mockRejectedValue(new Error('mesh CLI exploded'));

            const result = await handleCheckApiMesh(context, { workspaceId: WORKSPACE });

            expect(result).toEqual({
                success: false,
                apiEnabled: false,
                meshExists: false,
                error: 'mesh CLI exploded',
                code: ErrorCode.UNKNOWN,
            });
        });
    });
});
