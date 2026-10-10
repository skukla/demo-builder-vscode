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
jest.mock('@/features/dashboard/services/projectPanelPushes', () => ({
    sendMeshStatusUpdate: (...args: unknown[]) => mockSendMeshStatusUpdate(...args),
}));


import { handleDeployApiMesh } from '@/features/mesh/handlers/deployHandler';
import { ErrorCode } from '@/types/errorCodes';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { ctx, seedRegistry } from './deployHandler.testUtils';

describe('handleDeployApiMesh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedRegistry();
    });

    it('errors when no project is loaded', async () => {
        const result = await handleDeployApiMesh(ctx(undefined));
        // The code is what a caller branches on; the sentence is what the agent reads.
        expect(result).toStrictEqual({
            success: false,
            error: 'No project found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
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

    // The tool has no screen to recover on, so each block has to say what to do next.
    it.each([
        ['auth', 'Adobe sign-in required. Sign in (sign_in), then retry.'],
        ['org', 'This project uses a different Adobe organization. Switch orgs, then retry.'],
        [
            'permission',
            'Your account lacks the Developer or System Admin role for this organization ' +
                '(required for App Builder / API Mesh).',
        ],
        ['no-mesh', 'This project has no API Mesh component to deploy.'],
    ])('answers a %s block with its own next step', async (blockedBy, message) => {
        mockDeployMeshHeadless.mockResolvedValue({ success: false, blockedBy });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(result).toStrictEqual({ success: false, error: message });
    });

    it("prefers the core's own reason for a block over the general one", async () => {
        mockDeployMeshHeadless.mockResolvedValue({
            success: false,
            blockedBy: 'org',
            error: 'Signed in to Acme, but this project belongs to Bodea.',
        });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(result).toStrictEqual({
            success: false,
            error: 'Signed in to Acme, but this project belongs to Bodea.',
        });
    });

    it('warns when the mesh deployed but the storefront still reads the old one', async () => {
        // Owner, 2026-09-21: a redeploy that moved the mesh left the live site on a dead
        // address. The deploy succeeded, so this is a warning beside the result.
        mockDeployMeshHeadless.mockResolvedValue({
            success: true,
            meshId: 'm1',
            endpoint: 'https://mesh/graphql',
            storefrontNotRepublished: 'the CDN still serves the previous config',
        });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(result).toStrictEqual({
            success: true,
            data: {
                meshId: 'm1',
                endpoint: 'https://mesh/graphql',
                warning:
                    'The mesh is deployed, but the storefront was not republished: ' +
                    'the CDN still serves the previous config',
            },
        });
    });

    it('carries no warning when the storefront needed nothing', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: true, meshId: 'm1', endpoint: 'https://mesh/graphql' });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(result).toStrictEqual({ success: true, data: { meshId: 'm1', endpoint: 'https://mesh/graphql' } });
    });

    it('surfaces a deploy failure error', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: false, error: 'boom' });
        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('boom');
    });

    it('still says something when the core fails with neither an error nor a block', async () => {
        // The blocked branch and the plain-failure branch return the SAME shape,
        // so every failure with an `error` set reads identically through either.
        // A bare `{ success: false }` is the only input that tells them apart.
        mockDeployMeshHeadless.mockResolvedValue({ success: false });

        const result = await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(result).toEqual({ success: false, error: 'Mesh deployment failed' });
    });

    it('hands the registered SecretStorage to the core, not undefined', async () => {
        // Asserted on the ARGUMENT: the handler resolves secrets at the boundary
        // and the core is mocked, so a call that drops the storage returns the
        // same result as one that passes it.
        const { secrets } = createMockSecretStorage();
        ServiceLocator.setSecretStorage(secrets);
        mockDeployMeshHeadless.mockResolvedValue({ success: true });

        await handleDeployApiMesh(ctx({ name: 'p', path: '/p' }));

        expect(mockDeployMeshHeadless.mock.calls[0][0].secrets).toBe(secrets);
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
