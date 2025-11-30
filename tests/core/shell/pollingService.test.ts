import { PollingService } from '@/core/shell/pollingService';

jest.mock('../../../src/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('PollingService', () => {
    let pollingService: PollingService;

    beforeEach(() => {
        jest.clearAllMocks();
        pollingService = new PollingService();
    });

    describe('pollUntilCondition', () => {
        it('should succeed immediately when condition is met', async () => {
            const checkFn = jest.fn().mockResolvedValue(true);

            await pollingService.pollUntilCondition(checkFn, {
                initialDelay: 10,
                maxDelay: 50
            });

            expect(checkFn).toHaveBeenCalledTimes(1);
        });

        it('should retry until condition is met', async () => {
            const checkFn = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await pollingService.pollUntilCondition(checkFn, {
                initialDelay: 10,
                maxDelay: 50
            });

            expect(checkFn).toHaveBeenCalledTimes(3);
        });

        it('should throw error after max attempts', async () => {
            const checkFn = jest.fn().mockResolvedValue(false);

            await expect(
                pollingService.pollUntilCondition(checkFn, {
                    maxAttempts: 3,
                    initialDelay: 20,
                    maxDelay: 50,
                    name: 'test condition'
                })
            ).rejects.toThrow('Maximum polling attempts reached for: test condition');

            expect(checkFn).toHaveBeenCalledTimes(3);
        }, 10000); // 10 second timeout for test reliability under load

        it('should throw error on timeout', async () => {
            const checkFn = jest.fn().mockResolvedValue(false);

            await expect(
                pollingService.pollUntilCondition(checkFn, {
                    timeout: 200,
                    initialDelay: 20,
                    maxDelay: 50,
                    name: 'timeout test'
                })
            ).rejects.toThrow('Polling timeout for: timeout test');
        }, 10000); // 10 second timeout for test reliability under load

        it('should handle check function errors gracefully', async () => {
            const checkFn = jest.fn()
                .mockRejectedValueOnce(new Error('Check error'))
                .mockResolvedValueOnce(true);

            await pollingService.pollUntilCondition(checkFn, {
                initialDelay: 10
            });

            expect(checkFn).toHaveBeenCalledTimes(2);
        });

        it('should use default options when not provided', async () => {
            const checkFn = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await pollingService.pollUntilCondition(checkFn, {
                initialDelay: 10
            });

            expect(checkFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle authentication polling', async () => {
            let authAttempts = 0;
            const checkAuth = jest.fn().mockImplementation(async () => {
                authAttempts++;
                return authAttempts >= 3; // Succeed on 3rd attempt
            });

            await pollingService.pollUntilCondition(checkAuth, {
                name: 'authentication',
                initialDelay: 10,
                maxAttempts: 10
            });

            expect(authAttempts).toBe(3);
        });
    });
});
