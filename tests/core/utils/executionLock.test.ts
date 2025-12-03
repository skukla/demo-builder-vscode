import { ExecutionLock } from '@/core/utils/executionLock';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('ExecutionLock', () => {
    describe('isLocked()', () => {
        it('should return false initially', () => {
            const lock = new ExecutionLock('test');
            expect(lock.isLocked()).toBe(false);
        });

        it('should return true while operation is running', async () => {
            const lock = new ExecutionLock('test');
            let wasLocked = false;

            const operation = lock.run(async () => {
                wasLocked = lock.isLocked();
                await delay(10);
            });

            await operation;
            expect(wasLocked).toBe(true);
        });

        it('should return false after operation completes', async () => {
            const lock = new ExecutionLock('test');

            await lock.run(async () => {
                await delay(10);
            });

            expect(lock.isLocked()).toBe(false);
        });
    });

    describe('run()', () => {
        it('should prevent concurrent execution (serialize operations)', async () => {
            const lock = new ExecutionLock('test');
            const executionOrder: number[] = [];

            const op1 = lock.run(async () => {
                executionOrder.push(1);
                await delay(50);
                executionOrder.push(2);
            });

            const op2 = lock.run(async () => {
                executionOrder.push(3);
                await delay(50);
                executionOrder.push(4);
            });

            await Promise.all([op1, op2]);

            // Should execute sequentially, not interleaved
            expect(executionOrder).toEqual([1, 2, 3, 4]);
        });

        it('should release lock on success', async () => {
            const lock = new ExecutionLock('test');

            await lock.run(async () => {
                return 'success';
            });

            expect(lock.isLocked()).toBe(false);
        });

        it('should release lock on error', async () => {
            const lock = new ExecutionLock('test');

            try {
                await lock.run(async () => {
                    throw new Error('Test error');
                });
            } catch {
                // Expected
            }

            expect(lock.isLocked()).toBe(false);
        });

        it('should return operation result', async () => {
            const lock = new ExecutionLock('test');

            const result = await lock.run(async () => {
                return 42;
            });

            expect(result).toBe(42);
        });

        it('should propagate errors', async () => {
            const lock = new ExecutionLock('test');

            await expect(lock.run(async () => {
                throw new Error('Test error');
            })).rejects.toThrow('Test error');
        });
    });

    describe('multiple locks', () => {
        it('should be independent', async () => {
            const lock1 = new ExecutionLock('lock1');
            const lock2 = new ExecutionLock('lock2');
            const executionOrder: string[] = [];

            const op1 = lock1.run(async () => {
                executionOrder.push('lock1-start');
                await delay(50);
                executionOrder.push('lock1-end');
            });

            const op2 = lock2.run(async () => {
                executionOrder.push('lock2-start');
                await delay(25);
                executionOrder.push('lock2-end');
            });

            await Promise.all([op1, op2]);

            // Both should start immediately (interleaved)
            expect(executionOrder[0]).toBe('lock1-start');
            expect(executionOrder[1]).toBe('lock2-start');
        });
    });

    describe('getName()', () => {
        it('should return the lock name', () => {
            const lock = new ExecutionLock('MyLock');
            expect(lock.getName()).toBe('MyLock');
        });
    });

    describe('acquire()', () => {
        it('should return a release function', async () => {
            const lock = new ExecutionLock('test');

            const release = await lock.acquire();
            expect(lock.isLocked()).toBe(true);

            release();
            expect(lock.isLocked()).toBe(false);
        });

        it('should serialize manual acquisitions', async () => {
            const lock = new ExecutionLock('test');
            const executionOrder: number[] = [];

            const op1 = async () => {
                const release = await lock.acquire();
                executionOrder.push(1);
                await delay(30);
                executionOrder.push(2);
                release();
            };

            const op2 = async () => {
                const release = await lock.acquire();
                executionOrder.push(3);
                await delay(10);
                executionOrder.push(4);
                release();
            };

            await Promise.all([op1(), op2()]);

            // Should execute sequentially
            expect(executionOrder).toEqual([1, 2, 3, 4]);
        });
    });

    describe('timeout option', () => {
        it('should create lock with timeout', () => {
            const lock = new ExecutionLock('test', { timeoutMs: 1000 });
            expect(lock.getName()).toBe('test');
        });

        it('should throw on timeout when lock is held', async () => {
            const lock = new ExecutionLock('test', { timeoutMs: 50 });

            // Acquire lock and hold it
            const release = await lock.acquire();

            // Try to acquire again - should timeout
            await expect(lock.acquire()).rejects.toThrow();

            release();
        });
    });
});
