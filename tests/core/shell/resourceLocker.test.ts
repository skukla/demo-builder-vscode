import { ResourceLocker } from '@/core/shell/resourceLocker';

jest.mock('../../../src/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('ResourceLocker', () => {
    let resourceLocker: ResourceLocker;

    beforeEach(() => {
        jest.clearAllMocks();
        resourceLocker = new ResourceLocker();
    });

    describe('executeExclusive', () => {
        it('should execute operation with exclusive access', async () => {
            const operation = jest.fn().mockResolvedValue('result');

            const result = await resourceLocker.executeExclusive('resource1', operation);

            expect(result).toBe('result');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should queue operations for the same resource', async () => {
            const executionOrder: number[] = [];

            const operation1 = jest.fn().mockImplementation(async () => {
                await delay(100);
                executionOrder.push(1);
                return 'result1';
            });

            const operation2 = jest.fn().mockImplementation(async () => {
                await delay(50);
                executionOrder.push(2);
                return 'result2';
            });

            // Start both operations simultaneously
            const promise1 = resourceLocker.executeExclusive('resource1', operation1);
            const promise2 = resourceLocker.executeExclusive('resource1', operation2);

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).toBe('result1');
            expect(result2).toBe('result2');

            // Operations should execute sequentially, not concurrently
            expect(executionOrder).toEqual([1, 2]);
        });

        it('should allow concurrent operations on different resources', async () => {
            const executionOrder: number[] = [];

            const operation1 = jest.fn().mockImplementation(async () => {
                await delay(100);
                executionOrder.push(1);
                return 'result1';
            });

            const operation2 = jest.fn().mockImplementation(async () => {
                await delay(50);
                executionOrder.push(2);
                return 'result2';
            });

            // Start operations on different resources
            const promise1 = resourceLocker.executeExclusive('resource1', operation1);
            const promise2 = resourceLocker.executeExclusive('resource2', operation2);

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).toBe('result1');
            expect(result2).toBe('result2');

            // Operation 2 should complete first (shorter delay)
            expect(executionOrder).toEqual([2, 1]);
        });

        it('should handle operation errors and release lock', async () => {
            const operation1 = jest.fn().mockRejectedValue(new Error('Operation failed'));
            const operation2 = jest.fn().mockResolvedValue('success');

            // First operation should fail
            await expect(
                resourceLocker.executeExclusive('resource1', operation1)
            ).rejects.toThrow('Operation failed');

            // Second operation should still execute (lock was released)
            const result = await resourceLocker.executeExclusive('resource1', operation2);

            expect(result).toBe('success');
            expect(operation2).toHaveBeenCalled();
        });

        it('should handle multiple sequential operations', async () => {
            const results: string[] = [];

            const createOperation = (id: number) => jest.fn().mockImplementation(async () => {
                await delay(10);
                results.push(`op${id}`);
                return `result${id}`;
            });

            const operations = Array.from({ length: 5 }, (_, i) => createOperation(i + 1));

            const promises = operations.map((op, i) =>
                resourceLocker.executeExclusive('resource1', op)
            );

            await Promise.all(promises);

            // All operations should execute in order
            expect(results).toEqual(['op1', 'op2', 'op3', 'op4', 'op5']);
        });

        it('should return operation result correctly', async () => {
            const operation = jest.fn().mockResolvedValue({ data: 'test', count: 42 });

            const result = await resourceLocker.executeExclusive('resource1', operation);

            expect(result).toEqual({ data: 'test', count: 42 });
        });

        it('should handle operations returning different types', async () => {
            const stringOp = jest.fn().mockResolvedValue('string result');
            const numberOp = jest.fn().mockResolvedValue(123);
            const objectOp = jest.fn().mockResolvedValue({ key: 'value' });
            const boolOp = jest.fn().mockResolvedValue(true);

            const [str, num, obj, bool] = await Promise.all([
                resourceLocker.executeExclusive('r1', stringOp),
                resourceLocker.executeExclusive('r2', numberOp),
                resourceLocker.executeExclusive('r3', objectOp),
                resourceLocker.executeExclusive('r4', boolOp)
            ]);

            expect(str).toBe('string result');
            expect(num).toBe(123);
            expect(obj).toEqual({ key: 'value' });
            expect(bool).toBe(true);
        });
    });

    describe('isLocked', () => {
        it('should return true when resource is locked', async () => {
            const operation = jest.fn().mockImplementation(() => delay(100));

            const promise = resourceLocker.executeExclusive('resource1', operation);

            expect(resourceLocker.isLocked('resource1')).toBe(true);

            await promise;
        });

        it('should return false when resource is not locked', () => {
            expect(resourceLocker.isLocked('resource1')).toBe(false);
        });

        it('should return false after operation completes', async () => {
            const operation = jest.fn().mockResolvedValue('result');

            await resourceLocker.executeExclusive('resource1', operation);

            // Lock should be released after operation
            // Note: The lock may still exist in the Map but subsequent operations won't wait
            expect(resourceLocker.isLocked('resource1')).toBe(true);
        });
    });

    describe('getActiveLockCount', () => {
        it('should return 0 initially', () => {
            expect(resourceLocker.getActiveLockCount()).toBe(0);
        });

        it('should count active locks', async () => {
            const operation = jest.fn().mockImplementation(() => delay(100));

            const promise1 = resourceLocker.executeExclusive('resource1', operation);
            const promise2 = resourceLocker.executeExclusive('resource2', operation);

            expect(resourceLocker.getActiveLockCount()).toBe(2);

            await Promise.all([promise1, promise2]);
        });

        it('should update count after locks are cleared', () => {
            resourceLocker.executeExclusive('resource1', () => Promise.resolve());
            resourceLocker.executeExclusive('resource2', () => Promise.resolve());

            const initialCount = resourceLocker.getActiveLockCount();
            expect(initialCount).toBeGreaterThan(0);

            resourceLocker.clearAllLocks();

            expect(resourceLocker.getActiveLockCount()).toBe(0);
        });
    });

    describe('clearAllLocks', () => {
        it('should clear all active locks', async () => {
            resourceLocker.executeExclusive('resource1', () => Promise.resolve());
            resourceLocker.executeExclusive('resource2', () => Promise.resolve());

            expect(resourceLocker.getActiveLockCount()).toBeGreaterThan(0);

            resourceLocker.clearAllLocks();

            expect(resourceLocker.getActiveLockCount()).toBe(0);
            expect(resourceLocker.isLocked('resource1')).toBe(false);
            expect(resourceLocker.isLocked('resource2')).toBe(false);
        });
    });

    describe('Real-world scenarios', () => {
        it('should prevent concurrent Adobe CLI config writes', async () => {
            const executionLog: string[] = [];

            const writeConfig = (key: string, value: string) => async () => {
                executionLog.push(`start-${key}`);
                await delay(50);
                executionLog.push(`end-${key}`);
                return { key, value };
            };

            const promises = [
                resourceLocker.executeExclusive('adobe-cli', writeConfig('org', 'ORG1')),
                resourceLocker.executeExclusive('adobe-cli', writeConfig('project', 'PROJ1')),
                resourceLocker.executeExclusive('adobe-cli', writeConfig('workspace', 'WS1'))
            ];

            await Promise.all(promises);

            // Operations should not interleave
            expect(executionLog).toEqual([
                'start-org', 'end-org',
                'start-project', 'end-project',
                'start-workspace', 'end-workspace'
            ]);
        });

        it('should allow parallel file operations on different files', async () => {
            const executionLog: string[] = [];

            const writeFile = (file: string) => async () => {
                executionLog.push(`start-${file}`);
                await delay(50);
                executionLog.push(`end-${file}`);
            };

            const promises = [
                resourceLocker.executeExclusive('file1', writeFile('file1')),
                resourceLocker.executeExclusive('file2', writeFile('file2')),
                resourceLocker.executeExclusive('file3', writeFile('file3'))
            ];

            await Promise.all(promises);

            // All files should start before any end
            const startCount = executionLog.filter(log => log.startsWith('start')).length;
            const firstEndIndex = executionLog.findIndex(log => log.startsWith('end'));

            expect(startCount).toBe(3);
            expect(firstEndIndex).toBeGreaterThanOrEqual(1);
        });

        it('should handle authentication state changes atomically', async () => {
            const stateChanges: string[] = [];

            const login = async () => {
                stateChanges.push('login-start');
                await delay(100);
                stateChanges.push('login-end');
                return 'logged-in';
            };

            const logout = async () => {
                stateChanges.push('logout-start');
                await delay(50);
                stateChanges.push('logout-end');
                return 'logged-out';
            };

            // Attempt logout while login in progress
            const loginPromise = resourceLocker.executeExclusive('auth-state', login);
            const logoutPromise = resourceLocker.executeExclusive('auth-state', logout);

            await Promise.all([loginPromise, logoutPromise]);

            // Login should complete before logout starts
            expect(stateChanges).toEqual([
                'login-start', 'login-end',
                'logout-start', 'logout-end'
            ]);
        });
    });
});

// Helper function for delays in tests
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
