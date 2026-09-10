/**
 * check-api-mesh: which workspace/project it acts on, and the shapes it returns
 * before it ever reaches the CLI.
 *
 * The project record is deliberately ragged in places (no `adobe` at all, or no
 * project at all) — those are the states an agent-surface call actually meets,
 * and each optional hop in the resolution has to survive them.
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

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

const mockFallbackMeshCheck = jest.fn();
jest.mock('@/features/mesh/services/meshCheckHelpers', () => ({
    ...jest.requireActual('@/features/mesh/services/meshCheckHelpers'),
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

const fsPromises = jest.requireMock('fs').promises as Record<string, jest.Mock>;

/**
 * A Layer-2 answer no Layer-1 path can produce. Every workspace-config shape
 * below makes Layer 1 report the API absent; if an early return in
 * `getWorkspaceServices` stopped guarding, the config read would throw and the
 * handler would answer with THIS instead — which is what tells the two apart.
 */
const LAYER_2_TELL = {
    apiEnabled: true,
    meshExists: true,
    meshId: 'fallback-mesh',
    meshStatus: 'deployed' as const,
};
const API_ABSENT = { success: true, apiEnabled: false, meshExists: false };

describe('checkHandler - workspace resolution and org targeting', () => {
    let context: HandlerContext;
    let doubles: ReturnType<typeof createMeshServiceDoubles>;

    beforeEach(() => {
        jest.clearAllMocks();
        doubles = createMeshServiceDoubles();
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(doubles.authService);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(doubles.commandExecutor);

        fsPromises.mkdir.mockResolvedValue(undefined);
        fsPromises.mkdtemp.mockResolvedValue('/tmp/aio-workspace-test');
        fsPromises.rm.mockResolvedValue(undefined);
        fsPromises.readFile.mockResolvedValue(workspaceConfigJson([]));
        mockFallbackMeshCheck.mockResolvedValue(LAYER_2_TELL);

        context = createMeshCheckContext();
    });

    const withProject = (project: unknown) => {
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    };

    describe('refusing before the CLI', () => {
        it('reports no workspace when the project record has no adobe section', async () => {
            withProject({});

            const result = await handleCheckApiMesh(context, {});

            expect(result).toEqual({
                success: false,
                apiEnabled: false,
                meshExists: false,
                error:
                    'No workspace ID to check: pass workspaceId, or open a project that has an ' +
                    'Adobe workspace configured.',
                code: ErrorCode.MESH_CONFIG_INVALID,
            });
        });

        it('reports no workspace when there is no current project at all', async () => {
            withProject(null);

            const result = await handleCheckApiMesh(context, {});

            expect(result).toMatchObject({
                success: false,
                apiEnabled: false,
                meshExists: false,
                code: ErrorCode.MESH_CONFIG_INVALID,
            });
            expect(doubles.commandExecutor.execute).not.toHaveBeenCalled();
        });

        it('rejects an unsafe workspace id without targeting or executing anything', async () => {
            const result = await handleCheckApiMesh(context, { workspaceId: 'ws; rm -rf /' });

            expect(result).toEqual({
                success: false,
                apiEnabled: false,
                meshExists: false,
                error: expect.stringMatching(/^Invalid workspace ID: /),
                code: ErrorCode.MESH_CONFIG_INVALID,
            });
            expect(mockWithOrgContext).not.toHaveBeenCalled();
        });

        it('reports the agent-surface sign-in marker and runs nothing when unauthenticated', async () => {
            doubles.authService.isAuthenticated.mockResolvedValue(false);

            const result = await handleCheckApiMesh(context, { workspaceId: 'workspace-123' });

            expect(result).toEqual({
                success: false,
                apiEnabled: false,
                meshExists: false,
                error: expect.stringContaining('sign_in'),
                code: ErrorCode.AUTH_REQUIRED,
                needsAuth: 'adobe',
            });
            expect(mockWithOrgContext).not.toHaveBeenCalled();
        });
    });

    describe('targeting with a ragged project record', () => {
        it('targets with no org or project when there is no current project', async () => {
            withProject(null);

            await handleCheckApiMesh(context, { workspaceId: 'workspace-123' });

            expect(mockWithOrgContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgId: '',
                    projectId: undefined,
                    workspaceId: 'workspace-123',
                }),
                expect.any(Function),
            );
        });

        it('targets with no org or project when the project has no adobe section', async () => {
            withProject({ name: 'demo' });

            await handleCheckApiMesh(context, { workspaceId: 'workspace-123' });

            expect(mockWithOrgContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgId: '',
                    projectId: undefined,
                    workspaceId: 'workspace-123',
                }),
                expect.any(Function),
            );
        });

        it('still reaches the CLI when only the workspace is known', async () => {
            withProject({ name: 'demo' });

            const result = await handleCheckApiMesh(context, { workspaceId: 'workspace-123' });

            expect(result).toEqual(API_ABSENT);
            expect(doubles.commandExecutor.execute).toHaveBeenCalled();
        });
    });

    describe('extracting the services list from the workspace config', () => {
        it.each([
            ['an empty config object', {}],
            ['a config with no workspace', { project: {} }],
            ['a config with no workspace details', { project: { workspace: {} } }],
            ['details carrying no services key', { project: { workspace: { details: {} } } }],
        ])('treats %s as no services, without falling back to Layer 2', async (_label, config) => {
            fsPromises.readFile.mockResolvedValue(JSON.stringify(config));

            const result = await handleCheckApiMesh(context, { workspaceId: 'workspace-123' });

            expect(result).toEqual(API_ABSENT);
            expect(mockFallbackMeshCheck).not.toHaveBeenCalled();
        });

        it('reads the services list when the config carries one', async () => {
            fsPromises.readFile.mockResolvedValue(workspaceConfigJson([MESH_SERVICE]));
            doubles.commandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'No mesh found',
                stderr: '',
            });

            const result = await handleCheckApiMesh(context, { workspaceId: 'workspace-123' });

            expect(result).toEqual({ success: true, apiEnabled: true, meshExists: false });
            expect(mockFallbackMeshCheck).not.toHaveBeenCalled();
        });
    });
});
