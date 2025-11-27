/**
 * TransientStateManager TTL Operations Tests
 *
 * Tests for setWithTTL and getWithTTL operations.
 */

import { createMockContext } from './transientStateManager.testUtils';
import { TransientStateManager } from '@/core/state/transientStateManager';

describe('TransientStateManager - TTL Operations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('setWithTTL', () => {
        it('should store value with expiration timestamp', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now);

            await manager.setWithTTL('key', 'value', 10000);

            const stored = globalState.get('key') as {
                value: string;
                expiresAt: number;
            };
            expect(stored.value).toBe('value');
            expect(stored.expiresAt).toBe(now + 10000);

            jest.restoreAllMocks();
        });

        it('should store objects with TTL', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const objValue = { name: 'test', data: [1, 2, 3] };

            await manager.setWithTTL('objKey', objValue, 5000);

            const stored = globalState.get('objKey') as {
                value: typeof objValue;
                expiresAt: number;
            };
            expect(stored.value).toEqual(objValue);
        });
    });

    describe('getWithTTL', () => {
        it('should return value before expiry', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = 1000000;
            jest.spyOn(Date, 'now').mockReturnValue(now);

            globalState.set('key', { value: 'testValue', expiresAt: now + 10000 });

            const value = await manager.getWithTTL<string>('key');

            expect(value).toBe('testValue');

            jest.restoreAllMocks();
        });

        it('should return undefined after expiry', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = 1000000;

            globalState.set('key', { value: 'testValue', expiresAt: now - 1000 });
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const value = await manager.getWithTTL<string>('key');

            expect(value).toBeUndefined();

            jest.restoreAllMocks();
        });

        it('should clean up expired entries', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = 1000000;

            globalState.set('key', { value: 'testValue', expiresAt: now - 1000 });
            jest.spyOn(Date, 'now').mockReturnValue(now);

            await manager.getWithTTL<string>('key');

            expect(globalState.has('key')).toBe(false);

            jest.restoreAllMocks();
        });

        it('should return undefined for non-existent key', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            const value = await manager.getWithTTL<string>('nonexistent');

            expect(value).toBeUndefined();
        });

        it('should return object value before expiry', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = 1000000;
            const objValue = { name: 'test', count: 42 };
            jest.spyOn(Date, 'now').mockReturnValue(now);

            globalState.set('objKey', { value: objValue, expiresAt: now + 10000 });

            const value = await manager.getWithTTL<typeof objValue>('objKey');

            expect(value).toEqual(objValue);

            jest.restoreAllMocks();
        });

        it('should handle exact expiry time', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = 1000000;

            globalState.set('key', { value: 'testValue', expiresAt: now });
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const value = await manager.getWithTTL<string>('key');

            expect(value).toBeUndefined();

            jest.restoreAllMocks();
        });
    });

    describe('setWithTTL and getWithTTL integration', () => {
        it('should round-trip a value within TTL', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);
            const now = 1000000;
            jest.spyOn(Date, 'now').mockReturnValue(now);

            await manager.setWithTTL('key', 'testValue', 10000);
            const value = await manager.getWithTTL<string>('key');

            expect(value).toBe('testValue');

            jest.restoreAllMocks();
        });

        it('should expire value after TTL passes', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);
            let now = 1000000;
            jest.spyOn(Date, 'now').mockImplementation(() => now);

            await manager.setWithTTL('key', 'testValue', 5000);

            expect(await manager.getWithTTL<string>('key')).toBe('testValue');

            now = 1005001;

            expect(await manager.getWithTTL<string>('key')).toBeUndefined();

            jest.restoreAllMocks();
        });
    });
});
