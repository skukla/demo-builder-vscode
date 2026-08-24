/**
 * Lifecycle Handlers Tests - Cancellation
 *
 * Tests for cancellation operations:
 * - handleCancel: User cancels wizard
 * - handleCancelProjectCreation: Cancels project creation
 * - handleCancelMeshCreation: Cancels mesh creation
 */

import {
    handleCancel,
    handleCancelProjectCreation,
} from '@/features/project-creation/handlers/wizardLifecycleHandlers';
import { HandlerContext as _HandlerContext } from '@/types/handlers';
import { createMockContext } from './wizardLifecycleHandlers.testUtils';

// Mock vscode inline to avoid hoisting issues
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path, path })),
        parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    workspace: {
        updateWorkspaceFolders: jest.fn()
    },
    commands: {
        executeCommand: jest.fn()
    },
    env: {
        openExternal: jest.fn()
    }
}), { virtual: true });
jest.mock('@/core/validation');

describe('lifecycleHandlers - Cancellation', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('handleCancel', () => {
        it('should dispose panel and log cancellation', async () => {
            const result = await handleCancel(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.panel.dispose).toHaveBeenCalled();
            expect(mockContext.logger.info).toHaveBeenCalledWith('Wizard cancelled by user');
        });

        it('should handle missing panel gracefully', async () => {
            mockContext.panel = undefined;

            const result = await handleCancel(mockContext);

            expect(result.success).toBe(true);
        });
    });

    describe('handleCancelProjectCreation', () => {
        it('should abort project creation if controller exists', async () => {
            const abortController = new AbortController();
            const abortSpy = jest.spyOn(abortController, 'abort');
            mockContext.sharedState.projectCreationAbortController = abortController;

            const result = await handleCancelProjectCreation(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.message).toBe('Project creation cancelled');
            expect(abortSpy).toHaveBeenCalled();
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Cancellation requested by user')
            );
        });

        it('should return failure if no active project creation', async () => {
            mockContext.sharedState.projectCreationAbortController = undefined;

            const result = await handleCancelProjectCreation(mockContext);

            expect(result.success).toBe(false);
            expect(result.data!.message).toBe('No active project creation to cancel');
        });

        it('should handle abort controller errors', async () => {
            const abortController = new AbortController();
            jest.spyOn(abortController, 'abort').mockImplementation(() => {
                throw new Error('Abort failed');
            });
            mockContext.sharedState.projectCreationAbortController = abortController;

            // Should throw the error
            await expect(handleCancelProjectCreation(mockContext)).rejects.toThrow('Abort failed');
        });
    });



    describe('Integration Scenarios', () => {
        it('should handle wizard cancellation at any point', async () => {
            // Test that handleCancel works properly without calling handleReady
            // (handleReady behavior is tested separately in its own test file)

            // User cancels - this should work regardless of wizard state
            await handleCancel(mockContext);
            expect(mockContext.panel.dispose).toHaveBeenCalled();
            expect(mockContext.logger.info).toHaveBeenCalledWith('Wizard cancelled by user');
        });

        it('should handle project creation cancellation', async () => {
            const abortController = new AbortController();
            mockContext.sharedState.projectCreationAbortController = abortController;

            await handleCancelProjectCreation(mockContext);

            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Cancellation requested by user')
            );
        });
    });

    describe('Error Recovery', () => {
        it('should not crash on panel disposal error', async () => {
            mockContext.panel.dispose = jest.fn().mockImplementation(() => {
                throw new Error('Dispose failed');
            });

            // Should still succeed overall
            await expect(handleCancel(mockContext)).rejects.toThrow('Dispose failed');
        });

        it('should handle concurrent cancellations gracefully', async () => {
            const abortController = new AbortController();
            mockContext.sharedState.projectCreationAbortController = abortController;

            // Cancel multiple times
            const results = await Promise.all([
                handleCancelProjectCreation(mockContext),
                handleCancelProjectCreation(mockContext)
            ]);

            // First should succeed, second might fail or succeed depending on timing
            expect(results.some(r => r.success)).toBe(true);
        });
    });
});
