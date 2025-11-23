/**
 * HandlerRegistry Tests
 *
 * Tests for the consolidated handler registry pattern.
 */

import { HandlerRegistry, Handler } from '@/core/handlers/HandlerRegistry';

describe('HandlerRegistry', () => {
    let registry: HandlerRegistry<string>;

    beforeEach(() => {
        registry = new HandlerRegistry<string>();
    });

    describe('register', () => {
        it('should register a handler', () => {
            const handler: Handler<string> = jest.fn().mockResolvedValue('result');
            registry.register('test-action', handler);

            expect(registry.has('test-action')).toBe(true);
        });

        it('should throw when registering duplicate handler', () => {
            const handler: Handler<string> = jest.fn();
            registry.register('test-action', handler);

            expect(() => registry.register('test-action', handler)).toThrow(
                'Handler already registered for: test-action',
            );
        });
    });

    describe('handle', () => {
        it('should call registered handler with data', async () => {
            const handler = jest.fn().mockResolvedValue('result');
            registry.register('test-action', handler);

            const result = await registry.handle('test-action', { foo: 'bar' });

            expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
            expect(result).toBe('result');
        });

        it('should throw for unregistered action', async () => {
            await expect(registry.handle('unknown-action', {})).rejects.toThrow(
                'No handler registered for: unknown-action',
            );
        });
    });

    describe('getRegisteredTypes', () => {
        it('should return all registered action types', () => {
            registry.register('action-a', jest.fn());
            registry.register('action-b', jest.fn());
            registry.register('action-c', jest.fn());

            const types = registry.getRegisteredTypes();

            expect(types).toHaveLength(3);
            expect(types).toContain('action-a');
            expect(types).toContain('action-b');
            expect(types).toContain('action-c');
        });
    });
});
