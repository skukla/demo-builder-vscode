/**
 * handleDeployApiMesh — the mesh deploy behind the deploy_mesh MCP tool.
 *
 * It used to run the core with NO callbacks, so an AGENT could deploy the mesh
 * and the user saw nothing for one to three minutes — while the same agent
 * deploying an INTEGRATION raised a notification and animated its card, because
 * that tool routes through the keyed runner. Same user, same window, opposite
 * behaviour. Nobody's attention is further from a deploy than when a chat turn
 * started it, so this now reports itself exactly like the UI path.
 */

const mockDeployMeshHeadless = jest.fn();
jest.mock('@/features/mesh/services/deployMeshHeadless', () => ({
    deployMeshHeadless: (...args: unknown[]) => mockDeployMeshHeadless(...args),
}));

const mockSendMeshStatusUpdate = jest.fn();
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: (...args: unknown[]) => mockSendMeshStatusUpdate(...args),
    },
}));


import { handleDeployApiMesh } from '@/features/mesh/handlers/deployHandler';
import type { HandlerContext } from '@/types/handlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

/**
 * ADR-015 (2026-08-28): the handler resolves the auth manager and executor at
 * the boundary, which is where fetching is allowed. The shared node setup empties
 * the registry after EVERY test, so the fakes are seeded per-test.
 */
function seedRegistry(): void {
    ServiceLocator.setAuthenticationService({} as never);
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
}

function ctx(project: unknown): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        logger: createMockLogger(),
        context: createMockExtensionContext({ extensionPath: '/ext' }),
    });
}

describe('handleDeployApiMesh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedRegistry();
    });

    it('errors when no project is loaded', async () => {
        const result = await handleDeployApiMesh(ctx(undefined));
        expect(result.success).toBe(false);
        expect(mockDeployMeshHeadless).not.toHaveBeenCalled();
    });

    it('runs the shared core and returns meshId + endpoint', async () => {
        mockDeployMeshHeadless.mockResolvedValue({
            success: true,
            meshId: 'm1',
            endpoint: 'https://mesh/graphql',
        });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        const call = mockDeployMeshHeadless.mock.calls[0][0];
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

describe('handleDeployApiMesh — an agent-triggered deploy reports itself', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedRegistry();
    });

    it('opens the progress notification', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: true });
        const vscode = require('vscode');

        await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Deploying API Mesh' }),
            expect.any(Function)
        );
    });

    it('pushes step detail into the NOTIFICATION, not onto the card', async () => {
        const report = jest.fn();
        const vscode = require('vscode');
        vscode.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: unknown) => unknown) => task({ report })
        );
        mockDeployMeshHeadless.mockImplementation(async (deps: any) => {
            deps.onProgress('Building component…');
            return { success: true };
        });

        await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        // The same register split the UI path uses — reversed 2026-08-04: the
        // notification carries the steps, the card names the operation once.
        expect(report).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Building component…' })
        );
        expect(mockSendMeshStatusUpdate).not.toHaveBeenCalledWith(
            'deploying',
            'Building component…'
        );
    });

    it('pushes status transitions to the card, endpoint included on success', async () => {
        mockDeployMeshHeadless.mockImplementation(async (deps: any) => {
            deps.onStatus('deploying', 'Starting deployment…');
            deps.onStatus('deployed', undefined, 'https://mesh/graphql');
            return { success: true };
        });

        await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        // An in-flight 'deploying' is normalised to the stable operation name.
        // The core sends step-ish text on this channel too ("Starting
        // deployment…"), and letting it through would put narration back on the
        // card via a second door, undoing the register split.
        const deploying = mockSendMeshStatusUpdate.mock.calls.filter(
            (c: unknown[]) => c[0] === 'deploying'
        );
        expect(deploying.length).toBeGreaterThan(0);
        expect(deploying.every((c: unknown[]) => c[1] === 'Deploying Mesh')).toBe(true);

        // A TERMINAL status still carries its own message and endpoint.
        expect(mockSendMeshStatusUpdate).toHaveBeenCalledWith(
            'deployed',
            undefined,
            'https://mesh/graphql'
        );
    });
});
