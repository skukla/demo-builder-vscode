/**
 * TransientStateManager Basic Operations Tests
 *
 * Tests for constructor, get, set, has, and remove operations.
 */

import { createMockContext } from './transientStateManager.testUtils';
import { TransientStateManager } from '@/core/state/transientStateManager';

describe('TransientStateManager - Constructor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should register keys for sync on initialization', () => {
        const { context, setKeysForSyncMock } = createMockContext();

        new TransientStateManager(context);

        expect(setKeysForSyncMock).toHaveBeenCalledTimes(1);
        expect(setKeysForSyncMock).toHaveBeenCalledWith([
            'notification.dismissed',
            'preferences.logChannel',
            'whatsNew.dismissed',
        ]);
    });
});

describe('TransientStateManager - Basic Operations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return default value when key does not exist', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            const value = await manager.get('nonexistent', 'default');

            expect(value).toBe('default');
        });

        it('should return stored value when key exists', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('existingKey', 'storedValue');

            const value = await manager.get('existingKey', 'default');

            expect(value).toBe('storedValue');
        });

        it('should return default value when stored value is null', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('nullKey', null);

            const value = await manager.get('nullKey', 'default');

            expect(value).toBeNull();
        });

        it('should preserve type of stored objects', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const storedObj = { name: 'test', value: 123 };
            globalState.set('objKey', storedObj);

            const value = await manager.get<typeof storedObj>('objKey', {
                name: '',
                value: 0,
            });

            expect(value).toEqual(storedObj);
            expect(value.name).toBe('test');
            expect(value.value).toBe(123);
        });

        it('should preserve type of stored arrays', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const storedArray = [1, 2, 3];
            globalState.set('arrKey', storedArray);

            const value = await manager.get<number[]>('arrKey', []);

            expect(value).toEqual([1, 2, 3]);
        });
    });

    describe('set', () => {
        it('should store a string value', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.set('key', 'value');

            expect(globalState.get('key')).toBe('value');
        });

        it('should store a number value', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.set('numKey', 42);

            expect(globalState.get('numKey')).toBe(42);
        });

        it('should store a boolean value', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);

            await manager.set('boolKey', true);

            expect(globalState.get('boolKey')).toBe(true);
        });

        it('should store an object value', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            const objValue = { name: 'test', nested: { data: 123 } };

            await manager.set('objKey', objValue);

            expect(globalState.get('objKey')).toEqual(objValue);
        });

        it('should overwrite existing value', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('key', 'oldValue');

            await manager.set('key', 'newValue');

            expect(globalState.get('key')).toBe('newValue');
        });
    });

    describe('has', () => {
        it('should return false when key does not exist', () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            const exists = manager.has('nonexistent');

            expect(exists).toBe(false);
        });

        it('should return true when key exists', () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('existingKey', 'value');

            const exists = manager.has('existingKey');

            expect(exists).toBe(true);
        });

        it('should return true when key exists with falsy value', () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('zeroKey', 0);
            globalState.set('emptyStringKey', '');
            globalState.set('falseKey', false);
            globalState.set('nullKey', null);

            expect(manager.has('zeroKey')).toBe(true);
            expect(manager.has('emptyStringKey')).toBe(true);
            expect(manager.has('falseKey')).toBe(true);
            expect(manager.has('nullKey')).toBe(true);
        });

        it('should return false after key is removed', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('key', 'value');
            await manager.remove('key');

            const exists = manager.has('key');

            expect(exists).toBe(false);
        });
    });

    describe('remove', () => {
        it('should remove an existing key', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('key', 'value');

            await manager.remove('key');

            expect(globalState.has('key')).toBe(false);
        });

        it('should not throw when removing non-existent key', async () => {
            const { context } = createMockContext();
            const manager = new TransientStateManager(context);

            await expect(manager.remove('nonexistent')).resolves.not.toThrow();
        });

        it('should only remove the specified key', async () => {
            const { context, globalState } = createMockContext();
            const manager = new TransientStateManager(context);
            globalState.set('key1', 'value1');
            globalState.set('key2', 'value2');

            await manager.remove('key1');

            expect(globalState.has('key1')).toBe(false);
            expect(globalState.has('key2')).toBe(true);
        });
    });
});
