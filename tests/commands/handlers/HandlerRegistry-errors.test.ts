/**
 * HandlerRegistry Error Tests
 *
 * Tests for error handling, missing handlers, and invalid contexts
 */

import { HandlerRegistry } from '@/commands/handlers/HandlerRegistry';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { createMockContext, setupHandlerMocks } from './HandlerRegistry.testUtils';

// Mock all handler modules
jest.mock('@/features/lifecycle/handlers/lifecycleHandlers');
jest.mock('@/features/prerequisites/handlers');
jest.mock('@/features/components/handlers/componentHandlers');
jest.mock('@/features/authentication/handlers/authenticationHandlers');
jest.mock('@/features/authentication/handlers/projectHandlers');
jest.mock('@/features/authentication/handlers/workspaceHandlers');
jest.mock('@/features/mesh/handlers');
jest.mock('@/features/project-creation/handlers');

describe('HandlerRegistry - Errors', () => {
    let registry: HandlerRegistry;
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        setupHandlerMocks();
        registry = new HandlerRegistry();
    });

    describe('handle - Error Cases', () => {
        it('should return handlerNotFound for unknown message type', async () => {
            const result = await registry.handle(mockContext, 'unknown-message');

            expect(result).toEqual({ success: false, handlerNotFound: true });
        });

        it('should return handlerNotFound for empty message type', async () => {
            const result = await registry.handle(mockContext, '');

            expect(result).toEqual({ success: false, handlerNotFound: true });
        });

        it('should log error when handler throws', async () => {
            const error = new Error('Handler failed');

            const lifecycle = require('../../../src/features/lifecycle/handlers/lifecycleHandlers');
            (lifecycle.handleReady as jest.Mock).mockRejectedValue(error);

            await expect(registry.handle(mockContext, 'ready')).rejects.toThrow('Handler failed');

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[HandlerRegistry] Handler \'ready\' failed:',
                error
            );
        });

        it('should re-throw errors from handlers', async () => {
            const error = new Error('Authentication failed');

            const auth = require('../../../src/features/authentication/handlers/authenticationHandlers');
            (auth.handleCheckAuth as jest.Mock).mockRejectedValue(error);

            await expect(registry.handle(mockContext, 'check-auth')).rejects.toThrow(
                'Authentication failed'
            );
        });

        it('should handle handler that throws non-Error object', async () => {
            const errorString = 'Something went wrong';

            const lifecycle = require('../../../src/features/lifecycle/handlers/lifecycleHandlers');
            (lifecycle.handleCancel as jest.Mock).mockRejectedValue(errorString);

            await expect(registry.handle(mockContext, 'cancel')).rejects.toBe(errorString);
        });
    });

    describe('Error Recovery', () => {
        it('should not affect registry state after handler error', async () => {
            const lifecycle = require('../../../src/features/lifecycle/handlers/lifecycleHandlers');
            (lifecycle.handleReady as jest.Mock).mockRejectedValue(new Error('Failed'));
            (lifecycle.handleCancel as jest.Mock).mockResolvedValue({ success: true });

            // First handler fails
            await expect(registry.handle(mockContext, 'ready')).rejects.toThrow();

            // Second handler should still work
            const result = await registry.handle(mockContext, 'cancel');
            expect(result).toEqual({ success: true });
        });
    });
});
