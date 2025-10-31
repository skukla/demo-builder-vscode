import { RetryStrategyManager } from '@/core/shell/retryStrategyManager';
import type { RetryStrategy, CommandResult } from '@/core/shell/types';

jest.mock('../../../src/utils/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('RetryStrategyManager', () => {
    let retryManager: RetryStrategyManager;

    beforeEach(() => {
        jest.clearAllMocks();
        retryManager = new RetryStrategyManager();
    });

    describe('getStrategy', () => {
        it('should return network retry strategy', () => {
            const strategy = retryManager.getStrategy('network');

            expect(strategy).toBeDefined();
            expect(strategy?.maxAttempts).toBe(3);
            expect(strategy?.initialDelay).toBe(1000);
            expect(strategy?.backoffFactor).toBe(2);
        });

        it('should return filesystem retry strategy', () => {
            const strategy = retryManager.getStrategy('filesystem');

            expect(strategy).toBeDefined();
            expect(strategy?.maxAttempts).toBe(3);
            expect(strategy?.initialDelay).toBe(200);
        });

        it('should return adobe-cli retry strategy', () => {
            const strategy = retryManager.getStrategy('adobe-cli');

            expect(strategy).toBeDefined();
            expect(strategy?.maxAttempts).toBe(2);
        });

        it('should return undefined for unknown strategy', () => {
            const strategy = retryManager.getStrategy('unknown');

            expect(strategy).toBeUndefined();
        });
    });

    describe('getDefaultStrategy', () => {
        it('should return default strategy with maxAttempts 1', () => {
            const strategy = retryManager.getDefaultStrategy();

            expect(strategy).toBeDefined();
            expect(strategy.maxAttempts).toBe(1);
            expect(strategy.initialDelay).toBe(1000);
        });
    });

    describe('registerStrategy', () => {
        it('should register custom strategy', () => {
            const customStrategy: RetryStrategy = {
                maxAttempts: 5,
                initialDelay: 500,
                maxDelay: 10000,
                backoffFactor: 3
            };

            retryManager.registerStrategy('custom', customStrategy);

            const retrieved = retryManager.getStrategy('custom');
            expect(retrieved).toEqual(customStrategy);
        });

        it('should override existing strategy', () => {
            const newNetworkStrategy: RetryStrategy = {
                maxAttempts: 10,
                initialDelay: 2000,
                maxDelay: 20000,
                backoffFactor: 3
            };

            retryManager.registerStrategy('network', newNetworkStrategy);

            const retrieved = retryManager.getStrategy('network');
            expect(retrieved?.maxAttempts).toBe(10);
        });
    });

    describe('executeWithRetry', () => {
        it('should succeed on first attempt', async () => {
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'success',
                stderr: '',
                duration: 100
            };
            const executeFn = jest.fn().mockResolvedValue(mockResult);
            const strategy = retryManager.getDefaultStrategy();

            const result = await retryManager.executeWithRetry(
                executeFn,
                strategy,
                'test command'
            );

            expect(result).toEqual(mockResult);
            expect(executeFn).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure and eventually succeed', async () => {
            const mockError = new Error('Network error');
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'success',
                stderr: '',
                duration: 100
            };
            const executeFn = jest.fn()
                .mockRejectedValueOnce(mockError)
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(mockResult);

            const strategy: RetryStrategy = {
                maxAttempts: 3,
                initialDelay: 10,
                maxDelay: 100,
                backoffFactor: 2
            };

            const result = await retryManager.executeWithRetry(
                executeFn,
                strategy,
                'test command'
            );

            expect(result).toEqual(mockResult);
            expect(executeFn).toHaveBeenCalledTimes(3);
        });

        it('should fail after all retries exhausted', async () => {
            const mockError = new Error('Persistent error');
            const executeFn = jest.fn().mockRejectedValue(mockError);

            const strategy: RetryStrategy = {
                maxAttempts: 2,
                initialDelay: 10,
                maxDelay: 100,
                backoffFactor: 2
            };

            await expect(
                retryManager.executeWithRetry(executeFn, strategy, 'test command')
            ).rejects.toThrow('Persistent error');

            expect(executeFn).toHaveBeenCalledTimes(2);
        });

        it('should not retry on timeout errors', async () => {
            const mockError = new Error('Operation timed out');
            const executeFn = jest.fn().mockRejectedValue(mockError);

            const strategy: RetryStrategy = {
                maxAttempts: 3,
                initialDelay: 10,
                maxDelay: 100,
                backoffFactor: 2
            };

            await expect(
                retryManager.executeWithRetry(executeFn, strategy, 'test command')
            ).rejects.toThrow('Operation timed out');

            expect(executeFn).toHaveBeenCalledTimes(1);
        });

        it('should respect shouldRetry callback', async () => {
            const mockError = new Error('No retry for me');
            const executeFn = jest.fn().mockRejectedValue(mockError);

            const strategy: RetryStrategy = {
                maxAttempts: 3,
                initialDelay: 10,
                maxDelay: 100,
                backoffFactor: 2,
                shouldRetry: (error) => false
            };

            await expect(
                retryManager.executeWithRetry(executeFn, strategy, 'test command')
            ).rejects.toThrow('No retry for me');

            expect(executeFn).toHaveBeenCalledTimes(1);
        });

        it('should apply exponential backoff', async () => {
            const mockError = new Error('Retry me');
            const executeFn = jest.fn().mockRejectedValue(mockError);

            const strategy: RetryStrategy = {
                maxAttempts: 3,
                initialDelay: 100,
                maxDelay: 1000,
                backoffFactor: 2
            };

            const startTime = Date.now();

            await expect(
                retryManager.executeWithRetry(executeFn, strategy, 'test command')
            ).rejects.toThrow('Retry me');

            const duration = Date.now() - startTime;

            // First retry: 100ms, second retry: 200ms = 300ms minimum
            expect(duration).toBeGreaterThanOrEqual(300);
            expect(executeFn).toHaveBeenCalledTimes(3);
        });

        it('should cap delay at maxDelay', async () => {
            const mockError = new Error('Retry me');
            const executeFn = jest.fn().mockRejectedValue(mockError);

            const strategy: RetryStrategy = {
                maxAttempts: 5,
                initialDelay: 1000,
                maxDelay: 100,
                backoffFactor: 10
            };

            const startTime = Date.now();

            await expect(
                retryManager.executeWithRetry(executeFn, strategy, 'test command')
            ).rejects.toThrow('Retry me');

            const duration = Date.now() - startTime;

            // Delays should be capped at 100ms each (4 retries × 100ms = 400ms)
            expect(duration).toBeLessThan(600);
        });

        it('should handle network errors with network strategy', async () => {
            const mockError = new Error('ECONNREFUSED');
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'success',
                stderr: '',
                duration: 100
            };

            const executeFn = jest.fn()
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(mockResult);

            const strategy = retryManager.getStrategy('network')!;

            const result = await retryManager.executeWithRetry(
                executeFn,
                strategy,
                'network command'
            );

            expect(result).toEqual(mockResult);
            expect(executeFn).toHaveBeenCalledTimes(2);
        });

        it('should handle filesystem errors with filesystem strategy', async () => {
            const mockError = new Error('EBUSY: resource busy');
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'success',
                stderr: '',
                duration: 100
            };

            const executeFn = jest.fn()
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(mockResult);

            const strategy = retryManager.getStrategy('filesystem')!;

            const result = await retryManager.executeWithRetry(
                executeFn,
                strategy,
                'file operation'
            );

            expect(result).toEqual(mockResult);
            expect(executeFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('Adobe CLI strategy', () => {
        it('should not retry shell syntax issues', async () => {
            const mockError = new Error('> /dev/null not found');
            const executeFn = jest.fn().mockRejectedValue(mockError);

            const strategy = retryManager.getStrategy('adobe-cli')!;

            await expect(
                retryManager.executeWithRetry(executeFn, strategy, 'aio command')
            ).rejects.toThrow();

            expect(executeFn).toHaveBeenCalledTimes(1);
        });

        it('should retry token errors', async () => {
            const mockError = new Error('token expired');
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'success',
                stderr: '',
                duration: 100
            };

            const executeFn = jest.fn()
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(mockResult);

            const strategy = retryManager.getStrategy('adobe-cli')!;

            const result = await retryManager.executeWithRetry(
                executeFn,
                strategy,
                'aio command'
            );

            expect(result).toEqual(mockResult);
            expect(executeFn).toHaveBeenCalledTimes(2);
        });
    });
});
