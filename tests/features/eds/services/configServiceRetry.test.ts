/**
 * configServiceRetry tests
 *
 * The helper retries a Configuration Service write while it returns 403
 * (admin-role propagation), and returns the first non-403 result.
 */

jest.setTimeout(5000);

// 0ms delays so the retry loop runs instantly under test.
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { CONFIG_SERVICE_RETRY_DELAY: 0 },
}));

import {
    retryConfigWriteOnPropagation,
    CONFIG_SERVICE_PROPAGATION_DELAYS_MS,
} from '@/features/eds/services/configServiceRetry';

describe('retryConfigWriteOnPropagation', () => {
    it('returns immediately on success without retrying', async () => {
        const write = jest.fn().mockResolvedValue({ success: true });

        const result = await retryConfigWriteOnPropagation(write);

        expect(result.success).toBe(true);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it.each([401, 404, 409, 500])('does not retry on a non-403 failure (%i)', async (statusCode) => {
        const write = jest.fn().mockResolvedValue({ success: false, statusCode });

        const result = await retryConfigWriteOnPropagation(write);

        expect(result.statusCode).toBe(statusCode);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('retries on 403 then returns the first non-403 success', async () => {
        const write = jest.fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: true });
        const onRetry = jest.fn();

        const result = await retryConfigWriteOnPropagation(write, onRetry);

        expect(result.success).toBe(true);
        expect(write).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(1, CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length);
    });

    it('exhausts retries on continuous 403 and returns the final 403', async () => {
        const write = jest.fn().mockResolvedValue({ success: false, statusCode: 403 });
        const onRetry = jest.fn();

        const result = await retryConfigWriteOnPropagation(write, onRetry);

        expect(result.statusCode).toBe(403);
        // initial + one per delay
        expect(write).toHaveBeenCalledTimes(1 + CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length);
        expect(onRetry).toHaveBeenCalledTimes(CONFIG_SERVICE_PROPAGATION_DELAYS_MS.length);
    });

    it('stops retrying when a 403 is followed by a non-403', async () => {
        const write = jest.fn()
            .mockResolvedValueOnce({ success: false, statusCode: 403 })
            .mockResolvedValueOnce({ success: false, statusCode: 500 });

        const result = await retryConfigWriteOnPropagation(write);

        expect(result.statusCode).toBe(500);
        expect(write).toHaveBeenCalledTimes(2);
    });
});
