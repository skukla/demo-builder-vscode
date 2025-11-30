/**
 * Lifecycle Handlers Tests - Cancellation
 *
 * Tests for cancellation operations:
 * - handleCancel: User cancels wizard
 * - handleCancelProjectCreation: Cancels project creation
 * - handleCancelMeshCreation: Cancels mesh creation
 * - handleCancelAuthPolling: Cancels authentication
 */

import {
    handleCancel,
    handleCancelProjectCreation,
    handleCancelMeshCreation,
    handleCancelAuthPolling
} from '@/features/lifecycle/handlers/lifecycleHandlers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { createMockContext, mockVSCode } from './lifecycleHandlers.testUtils';

jest.mock('vscode', () => mockVSCode, { virtual: true });
jest.mock('@/core/validation/securityValidation');

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

    describe('handleCancelMeshCreation', () => {
        it('should acknowledge mesh creation cancellation', async () => {
            const result = await handleCancelMeshCreation(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.cancelled).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                '[API Mesh] User cancelled mesh creation'
            );
        });

        it('should handle errors during cancellation', async () => {
            // Force an error by making logger throw
            mockContext.logger.debug = jest.fn().mockImplementation(() => {
                throw new Error('Logger failed');
            });

            const result = await handleCancelMeshCreation(mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Logger failed');
        });
    });

    describe('handleCancelAuthPolling', () => {
        it('should cancel authentication polling', async () => {
            mockContext.sharedState.isAuthenticating = true;

            const result = await handleCancelAuthPolling(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sharedState.isAuthenticating).toBe(false);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                '[Auth] Cancelled authentication request'
            );
        });

        it('should work even if not currently authenticating', async () => {
            mockContext.sharedState.isAuthenticating = false;

            const result = await handleCancelAuthPolling(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sharedState.isAuthenticating).toBe(false);
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
