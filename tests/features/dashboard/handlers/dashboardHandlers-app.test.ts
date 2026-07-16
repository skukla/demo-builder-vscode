/**
 * Tests for the App Builder dashboard handlers:
 *   addApp     — validate {gitUrl}, call addAppComponent, then dispatch deploy
 *   deployApp  — route to the demoBuilder.deployApp command
 *   redeployApp— route to the demoBuilder.deployApp command
 *   removeApp  — call removeAppComponent
 *
 * Strict TDD: written BEFORE the handlers exist.
 */

import { setupMocks } from './dashboardHandlers.testUtils';
import * as vscode from 'vscode';

// App component manager service (add/remove)
const mockAddAppComponent = jest.fn();
const mockRemoveAppComponent = jest.fn();
jest.mock('@/features/app-builder/services/appComponentManager', () => ({
    addAppComponent: (...args: unknown[]) => mockAddAppComponent(...args),
    removeAppComponent: (...args: unknown[]) => mockRemoveAppComponent(...args),
}));

import {
    handleAddApp,
    handleDeployApp,
    handleRedeployApp,
    handleRemoveApp,
} from '@/features/dashboard/handlers/dashboardHandlers';

describe('dashboardHandlers - App Builder', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        mockAddAppComponent.mockResolvedValue({ success: true, appId: 'my-app' });
        mockRemoveAppComponent.mockResolvedValue({ success: true });
    });

    // =========================================================================
    // addApp
    // =========================================================================

    describe('handleAddApp', () => {
        it('rejects when gitUrl is missing', async () => {
            const { mockContext } = setupMocks();

            const result = await handleAddApp(mockContext, {} as never);

            expect(result.success).toBe(false);
            expect(mockAddAppComponent).not.toHaveBeenCalled();
        });

        it('calls addAppComponent with the project and gitUrl', async () => {
            const { mockContext, mockProject } = setupMocks();

            await handleAddApp(mockContext, { gitUrl: 'https://github.com/acme/my-app' });

            expect(mockAddAppComponent).toHaveBeenCalledWith(
                mockProject,
                'https://github.com/acme/my-app',
                expect.objectContaining({ getCachedOrganization: expect.any(Function) }),
            );
        });

        it('dispatches deploy after a successful add', async () => {
            const { mockContext } = setupMocks();

            await handleAddApp(mockContext, { gitUrl: 'https://github.com/acme/my-app' });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployApp');
        });

        it('does NOT dispatch deploy when add fails', async () => {
            mockAddAppComponent.mockResolvedValue({ success: false, error: 'clone failed' });
            const { mockContext } = setupMocks();

            const result = await handleAddApp(mockContext, { gitUrl: 'https://github.com/acme/my-app' });

            expect(result.success).toBe(false);
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.deployApp');
        });
    });

    // =========================================================================
    // deployApp / redeployApp
    // =========================================================================

    describe('handleDeployApp / handleRedeployApp', () => {
        it('deployApp routes to the demoBuilder.deployApp command', async () => {
            const { mockContext } = setupMocks();

            const result = await handleDeployApp(mockContext);

            expect(result.success).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployApp');
        });

        it('redeployApp routes to the demoBuilder.deployApp command', async () => {
            const { mockContext } = setupMocks();

            const result = await handleRedeployApp(mockContext);

            expect(result.success).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployApp');
        });
    });

    // =========================================================================
    // removeApp
    // =========================================================================

    // ADR-011 D3 Step 05: the singular handler is a THIN DELEGATE to the per-id
    // keyed remove — it resolves WHICH integration and forwards the id.
    describe('handleRemoveApp', () => {
        it('resolves the app instance id and delegates to the per-id removeAppComponent', async () => {
            const { mockContext, mockProject } = setupMocks({
                componentInstances: {
                    'my-app': {
                        id: 'my-app',
                        name: 'My App',
                        type: 'app-builder',
                        subType: 'app',
                        status: 'ready',
                        path: '/proj/components/my-app',
                    },
                } as never,
            });

            const result = await handleRemoveApp(mockContext);

            expect(result.success).toBe(true);
            expect(mockRemoveAppComponent).toHaveBeenCalledWith(
                mockProject,
                'my-app',
                expect.objectContaining({ getCachedOrganization: expect.any(Function) }),
            );
        });

        it('falls back to the keyed integration id when no app instance exists', async () => {
            const { mockContext, mockProject } = setupMocks({
                appBuilderComponents: {
                    'int-a': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'a' },
                    },
                },
            } as never);

            const result = await handleRemoveApp(mockContext);

            expect(result.success).toBe(true);
            expect(mockRemoveAppComponent).toHaveBeenCalledWith(
                mockProject,
                'int-a',
                expect.anything(),
            );
        });

        it('is a no-op success when the project has no integration at all', async () => {
            const { mockContext } = setupMocks();

            const result = await handleRemoveApp(mockContext);

            expect(result.success).toBe(true);
            expect(mockRemoveAppComponent).not.toHaveBeenCalled();
        });

        it('returns failure when there is no project', async () => {
            const { mockContext } = setupMocks();
            (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

            const result = await handleRemoveApp(mockContext);

            expect(result.success).toBe(false);
            expect(mockRemoveAppComponent).not.toHaveBeenCalled();
        });
    });
});
