/**
 * Org-services fetch — the retry-once-on-fast-failure hardening.
 *
 * The 2026-08-28 incident: Adobe's services-catalog endpoint intermittently
 * answered sub-second 500s (its own error template says retry) while a raw
 * retry succeeded — and three add_integration attempts died on single 500s.
 * The contract pinned here:
 *   - a FAST failure gets exactly one retry after a short pause
 *   - a TIMEOUT is never retried (it already spent the full budget — the
 *     picker's fast-fail + Retry stays the answer there)
 *   - two failures still throw (the picker's typed-error path is unchanged)
 *
 * sleep() is module-mocked; the timeout case fakes timers explicitly.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { AdobeOrgServices } from '@/features/authentication/services/adobeOrgServices';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const SERVICES = [{ code: 'GraphQLServiceSDK', name: 'Mesh', type: 't' }];

function makeService(getServicesForOrg: jest.Mock): AdobeOrgServices {
    const sdkClient = {
        isInitialized: () => true,
        ensureInitialized: jest.fn(),
        getClient: () => ({ getServicesForOrg }),
    };
    return new AdobeOrgServices(sdkClient as never);
}

describe('getServicesForOrg retry hardening', () => {
    beforeEach(() => jest.clearAllMocks());

    it('a fast 500 is retried once and the retry answer lands', async () => {
        const call = jest
            .fn()
            .mockRejectedValueOnce(new Error('500 Internal Server Error'))
            .mockResolvedValueOnce({ body: SERVICES });

        const result = await makeService(call).getServicesForOrg('org-1');

        expect(result).toEqual(SERVICES);
        expect(call).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
    });

    it('two fast failures throw — exactly one retry, never a loop', async () => {
        const call = jest.fn().mockRejectedValue(new Error('500'));

        await expect(makeService(call).getServicesForOrg('org-1')).rejects.toThrow();
        expect(call).toHaveBeenCalledTimes(2);
    });

    it('a success on the first try never sleeps or re-calls', async () => {
        const call = jest.fn().mockResolvedValue({ body: SERVICES });

        await expect(makeService(call).getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
        expect(call).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('a TIMEOUT is not retried — the budget is already spent', async () => {
        // Node-project suites run REAL timers; fake them here so the 60s fetch
        // deadline can be crossed instantly.
        jest.useFakeTimers();
        try {
            // Never settles → tryWithTimeout reports timedOut.
            const call = jest.fn(() => new Promise(() => undefined));

            const pending = makeService(call).getServicesForOrg('org-1');
            const guard = expect(pending).rejects.toThrow(/timed out|org services/i);
            await jest.advanceTimersByTimeAsync(TIMEOUTS.ORG_SERVICES_FETCH + 1000);
            await guard;

            expect(call).toHaveBeenCalledTimes(1);
            expect(sleep).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});
