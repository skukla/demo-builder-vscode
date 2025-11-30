/**
 * Mesh Helpers Tests
 *
 * Tests for utility functions that support mesh deployment operations.
 */

import {
    getMeshStatusCategory,
    extractAndParseJSON,
    pollForMeshDeployment,
    MeshStatusCategory,
    PollConfig,
    PollResult,
} from '@/features/mesh/utils/meshHelpers';

describe('meshHelpers', () => {
    describe('getMeshStatusCategory', () => {
        it('should return deployed for ACTIVE status', () => {
            const result = getMeshStatusCategory('ACTIVE');
            expect(result).toBe('deployed');
        });

        it('should return deployed for DEPLOYED status', () => {
            const result = getMeshStatusCategory('DEPLOYED');
            expect(result).toBe('deployed');
        });

        it('should return error for FAILED status', () => {
            const result = getMeshStatusCategory('FAILED');
            expect(result).toBe('error');
        });

        it('should return error for ERROR status', () => {
            const result = getMeshStatusCategory('ERROR');
            expect(result).toBe('error');
        });

        it('should return pending for DEPLOYING status', () => {
            const result = getMeshStatusCategory('DEPLOYING');
            expect(result).toBe('pending');
        });

        it('should return pending for UNKNOWN status', () => {
            const result = getMeshStatusCategory('UNKNOWN');
            expect(result).toBe('pending');
        });

        it('should return pending for empty string', () => {
            const result = getMeshStatusCategory('');
            expect(result).toBe('pending');
        });

        it('should handle case insensitivity', () => {
            expect(getMeshStatusCategory('active')).toBe('deployed');
            expect(getMeshStatusCategory('Active')).toBe('deployed');
            expect(getMeshStatusCategory('failed')).toBe('error');
            expect(getMeshStatusCategory('deploying')).toBe('pending');
        });
    });

    describe('extractAndParseJSON', () => {
        it('should extract and parse JSON object from stdout', () => {
            const stdout = 'Some prefix text\n{"meshId": "123", "status": "deployed"}\nSome suffix';
            const result = extractAndParseJSON<{ meshId: string; status: string }>(stdout);
            expect(result).toEqual({ meshId: '123', status: 'deployed' });
        });

        it('should extract and parse JSON array from stdout', () => {
            const stdout = 'Prefix [{"id": 1}, {"id": 2}] suffix';
            const result = extractAndParseJSON<Array<{ id: number }>>(stdout);
            expect(result).toEqual([{ id: 1 }, { id: 2 }]);
        });

        it('should return null when no JSON found', () => {
            const stdout = 'No JSON content here at all';
            const result = extractAndParseJSON(stdout);
            expect(result).toBeNull();
        });

        it('should return null for malformed JSON', () => {
            const stdout = '{"broken: json}';
            const result = extractAndParseJSON(stdout);
            expect(result).toBeNull();
        });

        it('should extract first JSON when multiple present', () => {
            const stdout = '{"first": true} {"second": true}';
            const result = extractAndParseJSON<{ first?: boolean; second?: boolean }>(stdout);
            expect(result).toEqual({ first: true });
        });

        it('should return null for empty string', () => {
            const result = extractAndParseJSON('');
            expect(result).toBeNull();
        });
    });

    describe('pollForMeshDeployment', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should return success when condition met immediately', async () => {
            const config: PollConfig = {
                checkFn: jest.fn().mockResolvedValue({ success: true, data: 'done' }),
                maxAttempts: 5,
                intervalMs: 100,
            };

            const resultPromise = pollForMeshDeployment(config);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(result.data).toBe('done');
            expect(config.checkFn).toHaveBeenCalledTimes(1);
        });

        it('should return failure when max retries exceeded', async () => {
            const config: PollConfig = {
                checkFn: jest.fn().mockResolvedValue({ success: false }),
                maxAttempts: 3,
                intervalMs: 100,
            };

            const resultPromise = pollForMeshDeployment(config);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.success).toBe(false);
            expect(config.checkFn).toHaveBeenCalledTimes(3);
        });

        it('should call onProgress callback with attempt info', async () => {
            const onProgress = jest.fn();
            const config: PollConfig = {
                checkFn: jest.fn()
                    .mockResolvedValueOnce({ success: false })
                    .mockResolvedValueOnce({ success: true, data: 'done' }),
                maxAttempts: 5,
                intervalMs: 100,
                onProgress,
            };

            const resultPromise = pollForMeshDeployment(config);
            await jest.runAllTimersAsync();
            await resultPromise;

            expect(onProgress).toHaveBeenCalledWith(1, 5);
            expect(onProgress).toHaveBeenCalledWith(2, 5);
        });

        it('should respect interval between attempts', async () => {
            const checkFn = jest.fn()
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: false })
                .mockResolvedValueOnce({ success: true, data: 'done' });

            const config: PollConfig = {
                checkFn,
                maxAttempts: 5,
                intervalMs: 1000,
            };

            const resultPromise = pollForMeshDeployment(config);

            // First call happens immediately
            await Promise.resolve();
            expect(checkFn).toHaveBeenCalledTimes(1);

            // Advance time for second call
            await jest.advanceTimersByTimeAsync(1000);
            expect(checkFn).toHaveBeenCalledTimes(2);

            // Advance time for third call
            await jest.advanceTimersByTimeAsync(1000);
            expect(checkFn).toHaveBeenCalledTimes(3);

            await resultPromise;
        });

        it('should handle errors in check function gracefully', async () => {
            const config: PollConfig = {
                checkFn: jest.fn()
                    .mockRejectedValueOnce(new Error('Network error'))
                    .mockResolvedValueOnce({ success: true, data: 'recovered' }),
                maxAttempts: 5,
                intervalMs: 100,
            };

            const resultPromise = pollForMeshDeployment(config);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(result.data).toBe('recovered');
        });
    });
});
