/**
 * pollForMeshDeployment — the waiting, asserted as calls rather than as elapsed time.
 *
 * The sibling suite drives the loop on fake timers, which proves the attempts happen
 * but cannot see the one decision that only shows at the END: the interval is skipped
 * after the LAST attempt, so a poll that is going to fail returns as soon as it knows
 * instead of sleeping one more time for nothing. Mocking `sleep` makes that countable.
 */

import { sleep } from '@/core/utils/sleep';
import { pollForMeshDeployment } from '@/features/mesh/utils/meshHelpers';

jest.mock('@/core/utils/sleep');

const sleepMock = sleep as jest.MockedFunction<typeof sleep>;

describe('pollForMeshDeployment — the interval between attempts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('waits between attempts but not after the last one', async () => {
        const checkFn = jest.fn().mockResolvedValue({ success: false });

        const result = await pollForMeshDeployment({ checkFn, maxAttempts: 3, intervalMs: 2500 });

        expect(result.success).toBe(false);
        expect(checkFn).toHaveBeenCalledTimes(3);
        expect(sleepMock).toHaveBeenCalledTimes(2);
        expect(sleepMock).toHaveBeenCalledWith(2500);
    });

    it('does not wait at all when the first attempt succeeds', async () => {
        const checkFn = jest.fn().mockResolvedValue({ success: true, data: 'ready' });

        const result = await pollForMeshDeployment({ checkFn, maxAttempts: 5, intervalMs: 2500 });

        expect(result).toEqual({ success: true, data: 'ready' });
        expect(sleepMock).not.toHaveBeenCalled();
    });

    it('still waits after an attempt that threw', async () => {
        const checkFn = jest
            .fn()
            .mockRejectedValueOnce(new Error('mesh not ready'))
            .mockResolvedValue({ success: true, data: 'ready' });

        const result = await pollForMeshDeployment({ checkFn, maxAttempts: 4, intervalMs: 1000 });

        expect(result.success).toBe(true);
        expect(sleepMock).toHaveBeenCalledTimes(1);
    });
});
