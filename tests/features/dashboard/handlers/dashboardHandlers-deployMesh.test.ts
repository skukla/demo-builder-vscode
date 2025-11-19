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

import { handleDeployMesh } from '@/features/dashboard/handlers/dashboardHandlers';
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
});
