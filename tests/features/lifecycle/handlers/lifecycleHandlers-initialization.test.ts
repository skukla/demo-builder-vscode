/**
 * Lifecycle Handlers Tests - Initialization
 *
 * Tests for wizard initialization and ready state:
 * - handleReady: Initial wizard ready event
 * - Component loading on wizard ready
 */

import { handleReady } from '@/features/lifecycle/handlers/lifecycleHandlers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { createMockContext } from './lifecycleHandlers.testUtils';

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
jest.mock('@/core/validation/securityValidation');

// Mock component handlers module
jest.mock('@/features/components/handlers/componentHandlers', () => ({
    handleLoadComponents: jest.fn().mockResolvedValue({
        success: true,
        data: { components: [] }
    })
}));

describe('lifecycleHandlers - Initialization', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('handleReady', () => {
        it('should handle wizard ready event', async () => {
            const result = await handleReady(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('Wizard webview ready');
        });

        it('should load components on ready', async () => {
            const { handleLoadComponents } = require('@/features/components/handlers/componentHandlers');
            (handleLoadComponents as jest.Mock).mockResolvedValue({
                success: true,
                data: { components: ['component1', 'component2'] }
            });

            await handleReady(mockContext);

            expect(handleLoadComponents).toHaveBeenCalledWith(mockContext);
            expect(mockContext.communicationManager.sendMessage).toHaveBeenCalledWith(
                'componentsLoaded',
                { components: ['component1', 'component2'] }
            );
        });

        it('should handle component loading error gracefully', async () => {
            const error = new Error('Failed to load components');
            const { handleLoadComponents } = require('@/features/components/handlers/componentHandlers');
            (handleLoadComponents as jest.Mock).mockRejectedValue(error);

            const result = await handleReady(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to load components:',
                error
            );
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete wizard lifecycle - ready phase', async () => {
            const { handleLoadComponents } = require('@/features/components/handlers/componentHandlers');

            // Ready
            await handleReady(mockContext);
            expect(handleLoadComponents).toHaveBeenCalledWith(mockContext);
        });
    });
});
