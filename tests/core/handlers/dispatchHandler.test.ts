/**
 * dispatchHandler Tests
 *
 * Tests for the dispatch handler utility that replaces BaseHandlerRegistry.
 * Validates message dispatch, error handling, and async handler support.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { dispatchHandler, hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import type { HandlerMap, MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

// Mock handler context factory
function createMockContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
        debugLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
        context: {} as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn(),
        sharedState: { isAuthenticating: false },
    };
}

describe('dispatchHandler', () => {
    describe('handler dispatch', () => {
        it('should execute matching handler with context and data', async () => {
            // Given: A handler map with 'test-action' handler
            const mockHandler = jest.fn().mockResolvedValue({ success: true, data: 'test-result' });
            const handlers: HandlerMap = {
                'test-action': mockHandler,
            };
            const context = createMockContext();
            const data = { key: 'value' };

            // When: dispatchHandler called with 'test-action'
            const result = await dispatchHandler(handlers, context, 'test-action', data);

            // Then: Handler is called with context and data
            expect(mockHandler).toHaveBeenCalledTimes(1);
            expect(mockHandler).toHaveBeenCalledWith(context, data);
            expect(result).toEqual({ success: true, data: 'test-result' });
        });

        it('should throw error for unknown message type', async () => {
            // Given: A handler map without 'unknown-action'
            const handlers: HandlerMap = {
                'known-action': jest.fn().mockResolvedValue({ success: true }),
            };
            const context = createMockContext();

            // When: dispatchHandler called with 'unknown-action'
            // Then: Error thrown with descriptive message
            await expect(
                dispatchHandler(handlers, context, 'unknown-action', {})
            ).rejects.toThrow('No handler registered for message type: unknown-action');
        });

        it('should await async handlers and return resolved value', async () => {
            // Given: An async handler that resolves asynchronously
            const asyncHandler = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => process.nextTick(resolve));
                return { success: true, data: 'async-result' };
            });
            const handlers: HandlerMap = {
                'async-action': asyncHandler,
            };
            const context = createMockContext();

            // When: dispatchHandler called
            const result = await dispatchHandler(handlers, context, 'async-action', {});

            // Then: Returns resolved value (not Promise object)
            expect(result).toEqual({ success: true, data: 'async-result' });
            expect(asyncHandler).toHaveBeenCalledTimes(1);
        });

        it('should pass undefined data when no payload provided', async () => {
            // Given: A handler map
            const mockHandler = jest.fn().mockResolvedValue({ success: true });
            const handlers: HandlerMap = {
                'no-data-action': mockHandler,
            };
            const context = createMockContext();

            // When: dispatchHandler called without data
            await dispatchHandler(handlers, context, 'no-data-action', undefined);

            // Then: Handler is called with undefined data
            expect(mockHandler).toHaveBeenCalledWith(context, undefined);
        });

        it('should propagate handler errors', async () => {
            // Given: A handler that throws an error
            const errorHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
            const handlers: HandlerMap = {
                'error-action': errorHandler,
            };
            const context = createMockContext();

            // When/Then: Error is propagated
            await expect(
                dispatchHandler(handlers, context, 'error-action', {})
            ).rejects.toThrow('Handler failed');
        });
    });
});

describe('hasHandler', () => {
    it('should return true when handler exists', () => {
        // Given: A handler map with 'test-action'
        const handlers: HandlerMap = {
            'test-action': jest.fn(),
            'other-action': jest.fn(),
        };

        // When: hasHandler called
        const result = hasHandler(handlers, 'test-action');

        // Then: Returns true
        expect(result).toBe(true);
    });

    it('should return false when handler does not exist', () => {
        // Given: A handler map without 'missing-action'
        const handlers: HandlerMap = {
            'test-action': jest.fn(),
        };

        // When: hasHandler called with non-existent type
        const result = hasHandler(handlers, 'missing-action');

        // Then: Returns false
        expect(result).toBe(false);
    });

    it('should return false for empty handler map', () => {
        // Given: An empty handler map
        const handlers: HandlerMap = {};

        // When: hasHandler called
        const result = hasHandler(handlers, 'any-action');

        // Then: Returns false
        expect(result).toBe(false);
    });
});

describe('getRegisteredTypes', () => {
    it('should return all registered message types', () => {
        // Given: A handler map with multiple handlers
        const handlers: HandlerMap = {
            'action-a': jest.fn(),
            'action-b': jest.fn(),
            'action-c': jest.fn(),
        };

        // When: getRegisteredTypes called
        const result = getRegisteredTypes(handlers);

        // Then: All types returned
        expect(result).toHaveLength(3);
        expect(result).toContain('action-a');
        expect(result).toContain('action-b');
        expect(result).toContain('action-c');
    });

    it('should return empty array for empty handler map', () => {
        // Given: An empty handler map
        const handlers: HandlerMap = {};

        // When: getRegisteredTypes called
        const result = getRegisteredTypes(handlers);

        // Then: Empty array returned
        expect(result).toHaveLength(0);
    });
});
