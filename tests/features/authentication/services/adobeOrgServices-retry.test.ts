/**
 * Org-services fetch — three tries inside ONE shared request.
 *
 * 2026-08-28: Adobe's services-catalog endpoint answered sub-second 500s that a
 * raw retry got past. 2026-09-21: its gateway cut a cold load off at 60s with a
 * 504, and the next try loaded the list in 31s — but that retry ran in the
 * dashboard warm-up, so the Manage APIs dialog sharing the first try showed an
 * error while the list loaded behind it. The contract pinned here:
 *   - any failure, fast or a timeout, is tried again, up to three tries
 *   - everyone waiting on the request waits through the tries and gets the list
 *   - three failures throw (the picker's typed-error path is unchanged)
 *
 * sleep() is module-mocked; the timeout case fakes timers explicitly.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { makeService, SERVICES } from './adobeOrgServices.testUtils';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** The service with `getServicesForOrg` answering as `call` does. */
function serviceWith(call: jest.Mock) {
    const { service, client } = makeService();
    client.getServicesForOrg.mockImplementation(call);
    return service;
}

describe('getServicesForOrg retry hardening', () => {
    beforeEach(() => jest.clearAllMocks());

    it('a fast 500 is retried once and the retry answer lands', async () => {
        const call = jest
            .fn()
            .mockRejectedValueOnce(new Error('500 Internal Server Error'))
            .mockResolvedValueOnce({ body: SERVICES });

        const result = await serviceWith(call).getServicesForOrg('org-1');

        expect(result).toEqual(SERVICES);
        expect(call).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
    });

    it('three failures throw — three tries, never a loop', async () => {
        const call = jest.fn().mockRejectedValue(new Error('500'));

        await expect(serviceWith(call).getServicesForOrg('org-1')).rejects.toThrow();
        expect(call).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('a third try that answers still lands', async () => {
        const call = jest
            .fn()
            .mockRejectedValueOnce(new Error('504 Gateway Timeout'))
            .mockRejectedValueOnce(new Error('504 Gateway Timeout'))
            .mockResolvedValueOnce({ body: SERVICES });

        await expect(serviceWith(call).getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
        expect(call).toHaveBeenCalledTimes(3);
    });

    // The 2026-09-21 case: the dialog and the warm-up share the first try, which
    // Adobe's gateway cuts off. Both must get the list from the next try.
    it('everyone waiting on the request gets the list from the retry', async () => {
        const call = jest
            .fn()
            .mockRejectedValueOnce(new Error('504 Gateway Timeout'))
            .mockResolvedValueOnce({ body: SERVICES });
        const service = serviceWith(call);

        const [dialog, warmUp] = await Promise.all([
            service.getServicesForOrg('org-1'),
            service.getServicesForOrg('org-1'),
        ]);

        expect(dialog).toEqual(SERVICES);
        expect(warmUp).toEqual(SERVICES);
        expect(call).toHaveBeenCalledTimes(2);
    });

    it('a success on the first try never sleeps or re-calls', async () => {
        const call = jest.fn().mockResolvedValue({ body: SERVICES });

        await expect(serviceWith(call).getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
        expect(call).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('a TIMEOUT is tried again too — a gateway cutoff often leaves Adobe warmer', async () => {
        // Node-project suites run REAL timers; fake them here so the fetch
        // deadline can be crossed instantly.
        jest.useFakeTimers();
        try {
            const call = jest
                .fn()
                .mockImplementationOnce(() => new Promise(() => undefined))
                .mockResolvedValueOnce({ body: SERVICES });

            const pending = serviceWith(call).getServicesForOrg('org-1');
            await jest.advanceTimersByTimeAsync(TIMEOUTS.ORG_SERVICES_FETCH + 1000);

            await expect(pending).resolves.toEqual(SERVICES);
            expect(call).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });
});
