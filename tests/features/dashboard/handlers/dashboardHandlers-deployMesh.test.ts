/**
 * Tests for handleDeployMesh handler (Pattern B - request-response)
 *
 * Tests verify that handleDeployMesh returns deployment result directly
 * instead of using sendMessage, establishing the request-response pattern.
 */

// IMPORTANT: Mock declarations must be at the top, before any imports
jest.mock('vscode', () => ({
    window: {
        activeColorTheme: { kind: 1 },
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    commands: {
        executeCommand: jest.fn(),
    },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Only the screen-hosted deploy is faked: it is the collaborator whose ARGUMENTS
// these tests are about. The rest of the module stays real.
jest.mock('@/features/mesh/handlers/deployHandler', () => ({
    ...jest.requireActual('@/features/mesh/handlers/deployHandler'),
    deployMeshFromScreen: jest.fn(),
}));

import { handleDeployMesh } from '@/features/dashboard/handlers/dashboardHandlers';
import { deployMeshFromScreen } from '@/features/mesh/handlers/deployHandler';
import { setupMocks } from './dashboardHandlers.testUtils';
import * as vscode from 'vscode';

describe('dashboardHandlers - handleDeployMesh', () => {
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Set default successful response
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    });

    it('should return deployment result with success=true (Pattern B)', async () => {
        // Arrange
        const { mockContext } = setupMocks();

        // Act: Call handler
        const result = await handleDeployMesh(mockContext);

        // Assert: Verify Pattern B response structure
        expect(result).toMatchObject({
            success: true,
        });

        // Verify command was executed
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployMesh');

        // CRITICAL: Verify sendMessage was NOT called (anti-pattern)
        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return error when deployment command fails', async () => {
        // Arrange: Mock command failure
        const error = new Error('Deployment failed');
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(error);

        const { mockContext } = setupMocks();

        // Act & Assert: Expect error to propagate
        await expect(handleDeployMesh(mockContext)).rejects.toThrow('Deployment failed');
    });

    /**
     * From a button that hosts the progress modal (PL-59 phase 2, rule R1) the deploy
     * reports to that screen and answers with the outcome. The palette command, with
     * its own notification, must NOT run as well: two surfaces would narrate one deploy.
     */
    describe('started from a screen that hosts the progress modal', () => {
        const fromScreen = deployMeshFromScreen as jest.Mock;

        beforeEach(() => {
            fromScreen.mockResolvedValue({ success: true, data: { meshId: 'mesh-1' } });
        });

        it('deploys through the screen path under the id the screen named, and answers its outcome', async () => {
            const { mockContext } = setupMocks();

            const result = await handleDeployMesh(mockContext, { id: 'mesh-row-7', progress: 'modal' });

            expect(fromScreen.mock.calls).toStrictEqual([[mockContext, 'mesh-row-7']]);
            expect(result).toStrictEqual({ success: true, data: { meshId: 'mesh-1' } });
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('tells the modal under that same id', async () => {
            const { mockContext } = setupMocks();

            await handleDeployMesh(mockContext, { id: 'mesh-row-7', progress: 'modal' });

            expect(mockContext.sendMessage).toHaveBeenCalledWith('operationProgress', {
                id: 'mesh-row-7',
                state: 'running',
            });
            expect(mockContext.sendMessage).toHaveBeenCalledWith('operationProgress', {
                id: 'mesh-row-7',
                state: 'succeeded',
            });
        });

        it('falls back to the mesh operation id when the screen named none', async () => {
            const { mockContext } = setupMocks();

            await handleDeployMesh(mockContext, { progress: 'modal' });

            expect(fromScreen.mock.calls).toStrictEqual([[mockContext, 'mesh']]);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('operationProgress', {
                id: 'mesh',
                state: 'running',
            });
        });

        it('control: an id WITHOUT the modal surface still runs the palette command', async () => {
            const { mockContext } = setupMocks();

            const result = await handleDeployMesh(mockContext, { id: 'mesh-row-7' });

            expect(result).toStrictEqual({ success: true });
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.deployMesh');
            expect(fromScreen).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).not.toHaveBeenCalled();
        });
    });
});
