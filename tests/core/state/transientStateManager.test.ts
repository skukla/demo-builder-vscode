/**
 * TransientStateManager Tests
 *
 * Tests for VS Code Memento-based transient state management.
 * Covers basic operations, TTL operations, notification helpers, and log channel preferences.
 */

import * as vscode from 'vscode';
import { TransientStateManager } from '@/core/state/transientStateManager';

// Mock VS Code API
jest.mock('vscode');

describe('TransientStateManager', () => {
    let mockGlobalState: Map<string, unknown>;
    let mockContext: vscode.ExtensionContext;
    let setKeysForSyncMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGlobalState = new Map();
        setKeysForSyncMock = jest.fn();

        mockContext = {
            globalState: {
                get: <T>(key: string): T | undefined => mockGlobalState.get(key) as T | undefined,
                update: async (key: string, value: unknown): Promise<void> => {
                    if (value === undefined) {
                        mockGlobalState.delete(key);
                    } else {
                        mockGlobalState.set(key, value);
                    }
                },
                setKeysForSync: setKeysForSyncMock,
                keys: () => [...mockGlobalState.keys()],
            }
        } as unknown as vscode.ExtensionContext;
    });

    describe('constructor', () => {
        it('should register keys for sync on initialization', () => {
            // When: Creating a new TransientStateManager
            new TransientStateManager(mockContext);

            // Then: Keys should be registered for sync
            expect(setKeysForSyncMock).toHaveBeenCalledTimes(1);
            expect(setKeysForSyncMock).toHaveBeenCalledWith([
                'notification.dismissed',
                'preferences.logChannel',
                'whatsNew.dismissed'
            ]);
        });
    });

    describe('basic operations', () => {
        describe('get', () => {
            it('should return default value when key does not exist', async () => {
                // Given: A TransientStateManager with no stored values
                const manager = new TransientStateManager(mockContext);

                // When: Getting a non-existent key
                const value = await manager.get('nonexistent', 'default');

                // Then: Should return the default value
                expect(value).toBe('default');
            });

            it('should return stored value when key exists', async () => {
                // Given: A TransientStateManager with a stored value
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('existingKey', 'storedValue');

                // When: Getting the existing key
                const value = await manager.get('existingKey', 'default');

                // Then: Should return the stored value, not the default
                expect(value).toBe('storedValue');
            });

            it('should return default value when stored value is null', async () => {
                // Given: A TransientStateManager with null stored value
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('nullKey', null);

                // When: Getting the key with null value
                const value = await manager.get('nullKey', 'default');

                // Then: Should return null (null is a valid stored value)
                expect(value).toBeNull();
            });

            it('should preserve type of stored objects', async () => {
                // Given: A TransientStateManager with a stored object
                const manager = new TransientStateManager(mockContext);
                const storedObj = { name: 'test', value: 123 };
                mockGlobalState.set('objKey', storedObj);

                // When: Getting the object
                const value = await manager.get<typeof storedObj>('objKey', { name: '', value: 0 });

                // Then: Should return the stored object with correct types
                expect(value).toEqual(storedObj);
                expect(value.name).toBe('test');
                expect(value.value).toBe(123);
            });

            it('should preserve type of stored arrays', async () => {
                // Given: A TransientStateManager with a stored array
                const manager = new TransientStateManager(mockContext);
                const storedArray = [1, 2, 3];
                mockGlobalState.set('arrKey', storedArray);

                // When: Getting the array
                const value = await manager.get<number[]>('arrKey', []);

                // Then: Should return the stored array
                expect(value).toEqual([1, 2, 3]);
            });
        });

        describe('set', () => {
            it('should store a string value', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Setting a string value
                await manager.set('key', 'value');

                // Then: The value should be stored
                expect(mockGlobalState.get('key')).toBe('value');
            });

            it('should store a number value', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Setting a number value
                await manager.set('numKey', 42);

                // Then: The value should be stored
                expect(mockGlobalState.get('numKey')).toBe(42);
            });

            it('should store a boolean value', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Setting a boolean value
                await manager.set('boolKey', true);

                // Then: The value should be stored
                expect(mockGlobalState.get('boolKey')).toBe(true);
            });

            it('should store an object value', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);
                const objValue = { name: 'test', nested: { data: 123 } };

                // When: Setting an object value
                await manager.set('objKey', objValue);

                // Then: The value should be stored
                expect(mockGlobalState.get('objKey')).toEqual(objValue);
            });

            it('should overwrite existing value', async () => {
                // Given: A TransientStateManager with an existing value
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('key', 'oldValue');

                // When: Setting a new value for the same key
                await manager.set('key', 'newValue');

                // Then: The value should be overwritten
                expect(mockGlobalState.get('key')).toBe('newValue');
            });
        });

        describe('has', () => {
            it('should return false when key does not exist', () => {
                // Given: A TransientStateManager with no stored values
                const manager = new TransientStateManager(mockContext);

                // When: Checking if a non-existent key exists
                const exists = manager.has('nonexistent');

                // Then: Should return false
                expect(exists).toBe(false);
            });

            it('should return true when key exists', () => {
                // Given: A TransientStateManager with a stored value
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('existingKey', 'value');

                // When: Checking if the key exists
                const exists = manager.has('existingKey');

                // Then: Should return true
                expect(exists).toBe(true);
            });

            it('should return true when key exists with falsy value', () => {
                // Given: A TransientStateManager with falsy stored values
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('zeroKey', 0);
                mockGlobalState.set('emptyStringKey', '');
                mockGlobalState.set('falseKey', false);
                mockGlobalState.set('nullKey', null);

                // When: Checking if keys with falsy values exist
                // Then: Should return true for all (they exist, just have falsy values)
                expect(manager.has('zeroKey')).toBe(true);
                expect(manager.has('emptyStringKey')).toBe(true);
                expect(manager.has('falseKey')).toBe(true);
                expect(manager.has('nullKey')).toBe(true);
            });

            it('should return false after key is removed', async () => {
                // Given: A TransientStateManager with a stored value that is then removed
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('key', 'value');
                await manager.remove('key');

                // When: Checking if the removed key exists
                const exists = manager.has('key');

                // Then: Should return false
                expect(exists).toBe(false);
            });
        });

        describe('remove', () => {
            it('should remove an existing key', async () => {
                // Given: A TransientStateManager with a stored value
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('key', 'value');

                // When: Removing the key
                await manager.remove('key');

                // Then: The key should no longer exist
                expect(mockGlobalState.has('key')).toBe(false);
            });

            it('should not throw when removing non-existent key', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Removing a non-existent key
                // Then: Should not throw
                await expect(manager.remove('nonexistent')).resolves.not.toThrow();
            });

            it('should only remove the specified key', async () => {
                // Given: A TransientStateManager with multiple stored values
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('key1', 'value1');
                mockGlobalState.set('key2', 'value2');

                // When: Removing one key
                await manager.remove('key1');

                // Then: Only the specified key should be removed
                expect(mockGlobalState.has('key1')).toBe(false);
                expect(mockGlobalState.has('key2')).toBe(true);
            });
        });
    });

    describe('TTL operations', () => {
        describe('setWithTTL', () => {
            it('should store value with expiration timestamp', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);
                const now = Date.now();
                jest.spyOn(Date, 'now').mockReturnValue(now);

                // When: Setting a value with TTL
                await manager.setWithTTL('key', 'value', 10000);

                // Then: Should store value with expiresAt timestamp
                const stored = mockGlobalState.get('key') as { value: string; expiresAt: number };
                expect(stored.value).toBe('value');
                expect(stored.expiresAt).toBe(now + 10000);

                jest.restoreAllMocks();
            });

            it('should store objects with TTL', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);
                const objValue = { name: 'test', data: [1, 2, 3] };

                // When: Setting an object with TTL
                await manager.setWithTTL('objKey', objValue, 5000);

                // Then: Should store the object with expiresAt
                const stored = mockGlobalState.get('objKey') as { value: typeof objValue; expiresAt: number };
                expect(stored.value).toEqual(objValue);
            });
        });

        describe('getWithTTL', () => {
            it('should return value before expiry', async () => {
                // Given: A TransientStateManager with a TTL value that has not expired
                const manager = new TransientStateManager(mockContext);
                const now = 1000000;
                jest.spyOn(Date, 'now').mockReturnValue(now);

                // Set value that expires in the future
                mockGlobalState.set('key', { value: 'testValue', expiresAt: now + 10000 });

                // When: Getting the value before expiry
                const value = await manager.getWithTTL<string>('key');

                // Then: Should return the value
                expect(value).toBe('testValue');

                jest.restoreAllMocks();
            });

            it('should return undefined after expiry', async () => {
                // Given: A TransientStateManager with an expired TTL value
                const manager = new TransientStateManager(mockContext);
                const now = 1000000;

                // Set value that expired in the past
                mockGlobalState.set('key', { value: 'testValue', expiresAt: now - 1000 });
                jest.spyOn(Date, 'now').mockReturnValue(now);

                // When: Getting the expired value
                const value = await manager.getWithTTL<string>('key');

                // Then: Should return undefined
                expect(value).toBeUndefined();

                jest.restoreAllMocks();
            });

            it('should clean up expired entries', async () => {
                // Given: A TransientStateManager with an expired TTL value
                const manager = new TransientStateManager(mockContext);
                const now = 1000000;

                // Set value that expired in the past
                mockGlobalState.set('key', { value: 'testValue', expiresAt: now - 1000 });
                jest.spyOn(Date, 'now').mockReturnValue(now);

                // When: Getting the expired value
                await manager.getWithTTL<string>('key');

                // Then: The key should be removed from storage
                expect(mockGlobalState.has('key')).toBe(false);

                jest.restoreAllMocks();
            });

            it('should return undefined for non-existent key', async () => {
                // Given: A TransientStateManager with no stored values
                const manager = new TransientStateManager(mockContext);

                // When: Getting a non-existent key with TTL
                const value = await manager.getWithTTL<string>('nonexistent');

                // Then: Should return undefined
                expect(value).toBeUndefined();
            });

            it('should return object value before expiry', async () => {
                // Given: A TransientStateManager with a TTL object value
                const manager = new TransientStateManager(mockContext);
                const now = 1000000;
                const objValue = { name: 'test', count: 42 };
                jest.spyOn(Date, 'now').mockReturnValue(now);

                mockGlobalState.set('objKey', { value: objValue, expiresAt: now + 10000 });

                // When: Getting the object before expiry
                const value = await manager.getWithTTL<typeof objValue>('objKey');

                // Then: Should return the object
                expect(value).toEqual(objValue);

                jest.restoreAllMocks();
            });

            it('should handle exact expiry time', async () => {
                // Given: A TransientStateManager with a value at exact expiry time
                const manager = new TransientStateManager(mockContext);
                const now = 1000000;

                // Set value that expires exactly now
                mockGlobalState.set('key', { value: 'testValue', expiresAt: now });
                jest.spyOn(Date, 'now').mockReturnValue(now);

                // When: Getting the value at exact expiry time
                const value = await manager.getWithTTL<string>('key');

                // Then: Should return undefined (expired at or after expiresAt)
                expect(value).toBeUndefined();

                jest.restoreAllMocks();
            });
        });

        describe('setWithTTL and getWithTTL integration', () => {
            it('should round-trip a value within TTL', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);
                const now = 1000000;
                jest.spyOn(Date, 'now').mockReturnValue(now);

                // When: Setting and getting a value within TTL
                await manager.setWithTTL('key', 'testValue', 10000);
                const value = await manager.getWithTTL<string>('key');

                // Then: Should return the stored value
                expect(value).toBe('testValue');

                jest.restoreAllMocks();
            });

            it('should expire value after TTL passes', async () => {
                // Given: A TransientStateManager with a TTL value
                const manager = new TransientStateManager(mockContext);
                let now = 1000000;
                jest.spyOn(Date, 'now').mockImplementation(() => now);

                // When: Setting value with short TTL
                await manager.setWithTTL('key', 'testValue', 5000);

                // Then: Value should be available before expiry
                expect(await manager.getWithTTL<string>('key')).toBe('testValue');

                // When: Time advances past TTL
                now = 1005001;

                // Then: Value should be expired
                expect(await manager.getWithTTL<string>('key')).toBeUndefined();

                jest.restoreAllMocks();
            });
        });
    });

    describe('notification helpers', () => {
        describe('isNotificationDismissed', () => {
            it('should return false for non-dismissed notification', async () => {
                // Given: A TransientStateManager with no dismissed notifications
                const manager = new TransientStateManager(mockContext);

                // When: Checking if a notification is dismissed
                const isDismissed = await manager.isNotificationDismissed('update-v1.0.0');

                // Then: Should return false
                expect(isDismissed).toBe(false);
            });

            it('should return true for dismissed notification', async () => {
                // Given: A TransientStateManager with a dismissed notification
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('notification.dismissed.update-v1.0.0', true);

                // When: Checking if the notification is dismissed
                const isDismissed = await manager.isNotificationDismissed('update-v1.0.0');

                // Then: Should return true
                expect(isDismissed).toBe(true);
            });

            it('should handle multiple notification IDs independently', async () => {
                // Given: A TransientStateManager with one dismissed notification
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('notification.dismissed.notif1', true);

                // When: Checking multiple notifications
                const notif1Dismissed = await manager.isNotificationDismissed('notif1');
                const notif2Dismissed = await manager.isNotificationDismissed('notif2');

                // Then: Each notification should be tracked independently
                expect(notif1Dismissed).toBe(true);
                expect(notif2Dismissed).toBe(false);
            });
        });

        describe('dismissNotification', () => {
            it('should mark notification as dismissed', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Dismissing a notification
                await manager.dismissNotification('whatsNew-v1.5.0');

                // Then: Notification should be marked as dismissed
                expect(mockGlobalState.get('notification.dismissed.whatsNew-v1.5.0')).toBe(true);
            });

            it('should allow dismissing multiple notifications', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Dismissing multiple notifications
                await manager.dismissNotification('notif1');
                await manager.dismissNotification('notif2');

                // Then: All notifications should be dismissed
                expect(mockGlobalState.get('notification.dismissed.notif1')).toBe(true);
                expect(mockGlobalState.get('notification.dismissed.notif2')).toBe(true);
            });

            it('should be idempotent', async () => {
                // Given: A TransientStateManager with a dismissed notification
                const manager = new TransientStateManager(mockContext);
                await manager.dismissNotification('notif');

                // When: Dismissing the same notification again
                await manager.dismissNotification('notif');

                // Then: Should not throw and notification stays dismissed
                expect(mockGlobalState.get('notification.dismissed.notif')).toBe(true);
            });
        });

        describe('isNotificationDismissed and dismissNotification integration', () => {
            it('should reflect dismissal status after dismissing', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Initially checking, then dismissing
                const beforeDismissal = await manager.isNotificationDismissed('testNotif');
                await manager.dismissNotification('testNotif');
                const afterDismissal = await manager.isNotificationDismissed('testNotif');

                // Then: Status should change from false to true
                expect(beforeDismissal).toBe(false);
                expect(afterDismissal).toBe(true);
            });
        });
    });

    describe('log channel preference', () => {
        describe('getPreferredLogChannel', () => {
            it('should return logs as default channel', async () => {
                // Given: A TransientStateManager with no preference set
                const manager = new TransientStateManager(mockContext);

                // When: Getting the preferred log channel
                const channel = await manager.getPreferredLogChannel();

                // Then: Should return 'logs' as default
                expect(channel).toBe('logs');
            });

            it('should return stored channel preference', async () => {
                // Given: A TransientStateManager with debug channel preference
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('preferences.logChannel', 'debug');

                // When: Getting the preferred log channel
                const channel = await manager.getPreferredLogChannel();

                // Then: Should return 'debug'
                expect(channel).toBe('debug');
            });

            it('should return logs when stored preference is logs', async () => {
                // Given: A TransientStateManager with logs channel preference
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('preferences.logChannel', 'logs');

                // When: Getting the preferred log channel
                const channel = await manager.getPreferredLogChannel();

                // Then: Should return 'logs'
                expect(channel).toBe('logs');
            });
        });

        describe('setPreferredLogChannel', () => {
            it('should set channel to logs', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Setting channel to logs
                await manager.setPreferredLogChannel('logs');

                // Then: Should store the preference
                expect(mockGlobalState.get('preferences.logChannel')).toBe('logs');
            });

            it('should set channel to debug', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Setting channel to debug
                await manager.setPreferredLogChannel('debug');

                // Then: Should store the preference
                expect(mockGlobalState.get('preferences.logChannel')).toBe('debug');
            });

            it('should overwrite existing preference', async () => {
                // Given: A TransientStateManager with existing preference
                const manager = new TransientStateManager(mockContext);
                mockGlobalState.set('preferences.logChannel', 'logs');

                // When: Changing preference to debug
                await manager.setPreferredLogChannel('debug');

                // Then: Should update the preference
                expect(mockGlobalState.get('preferences.logChannel')).toBe('debug');
            });
        });

        describe('getPreferredLogChannel and setPreferredLogChannel integration', () => {
            it('should round-trip channel preference', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Setting and getting preference
                await manager.setPreferredLogChannel('debug');
                const channel = await manager.getPreferredLogChannel();

                // Then: Should return the set value
                expect(channel).toBe('debug');
            });

            it('should allow changing preference multiple times', async () => {
                // Given: A TransientStateManager
                const manager = new TransientStateManager(mockContext);

                // When: Changing preference multiple times
                await manager.setPreferredLogChannel('debug');
                expect(await manager.getPreferredLogChannel()).toBe('debug');

                await manager.setPreferredLogChannel('logs');
                expect(await manager.getPreferredLogChannel()).toBe('logs');

                await manager.setPreferredLogChannel('debug');
                expect(await manager.getPreferredLogChannel()).toBe('debug');
            });
        });
    });
});
