/**
 * handleDeployApiMesh — the headless mesh deploy behind the deploy_mesh MCP tool.
 * Resolves the current project and runs the shared deployMeshHeadless core with
 * no UI callbacks, shaping the result into a tool response.
 */

const mockDeployMeshHeadless = jest.fn();
jest.mock('@/features/mesh/services/deployMeshHeadless', () => ({
    deployMeshHeadless: (...args: unknown[]) => mockDeployMeshHeadless(...args),
}));

import { handleDeployApiMesh } from '@/features/mesh/handlers/deployHandler';
import type { HandlerContext } from '@/types/handlers';

function ctx(project: unknown): HandlerContext {
    return {
        stateManager: { getCurrentProject: jest.fn().mockResolvedValue(project) },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        context: { extensionPath: '/ext' },
    } as unknown as HandlerContext;
}

describe('handleDeployApiMesh', () => {
    beforeEach(() => jest.clearAllMocks());

    it('errors when no project is loaded', async () => {
        const result = await handleDeployApiMesh(ctx(undefined));
        expect(result.success).toBe(false);
        expect(mockDeployMeshHeadless).not.toHaveBeenCalled();
    });

    it('runs the shared core headlessly (no UI callbacks) and returns meshId + endpoint', async () => {
        mockDeployMeshHeadless.mockResolvedValue({
            success: true,
            meshId: 'm1',
            endpoint: 'https://mesh/graphql',
        });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        const call = mockDeployMeshHeadless.mock.calls[0][0];
        expect(call.onStatus).toBeUndefined();
        expect(call.onProgress).toBeUndefined();
        expect(call.extensionPath).toBe('/ext');
        expect(result).toEqual({
            success: true,
            data: { meshId: 'm1', endpoint: 'https://mesh/graphql' },
        });
    });

    it('shapes a blocked result into an actionable error', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: false, blockedBy: 'auth' });
        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/sign|auth/i);
    });

    it('surfaces a deploy failure error', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: false, error: 'boom' });
        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('boom');
    });
});
