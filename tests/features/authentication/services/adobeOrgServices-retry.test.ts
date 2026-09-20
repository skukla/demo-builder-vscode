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

    it('two fast failures throw — exactly one retry, never a loop', async () => {
        const call = jest.fn().mockRejectedValue(new Error('500'));

        await expect(serviceWith(call).getServicesForOrg('org-1')).rejects.toThrow();
        expect(call).toHaveBeenCalledTimes(2);
    });

    it('a success on the first try never sleeps or re-calls', async () => {
        const call = jest.fn().mockResolvedValue({ body: SERVICES });

        await expect(serviceWith(call).getServicesForOrg('org-1')).resolves.toEqual(SERVICES);
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

            const pending = serviceWith(call).getServicesForOrg('org-1');
            // The assertion IS awaited below; the handler must attach BEFORE the
            // timers advance or the rejection is unhandled. The rule cannot see a
            // deferred await.
            // eslint-disable-next-line jest/valid-expect
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

/**
 * The same hardening on the calls an ADD dies on.
 *
 * 2026-09-20: Developer Console answered 504 Gateway Timeout on its own licence
 * lookup three minutes into an add, and the SC was told to try again in a few
 * minutes — which is what one retry does without asking them. A 504 says the
 * outcome is UNKNOWN, which is why the subscribe is safe to repeat: it replaces
 * the credential's whole list, so the same list twice converges.
 */
describe('the credential calls an add depends on', () => {
    beforeEach(() => jest.clearAllMocks());

    const GATEWAY_TIMEOUT = new Error(
        '[CoreConsoleAPISDK:ERROR_GET_INTEGRATION] 504 - Gateway Timeout ("upstream request timeout")',
    );

    it('retries a 504 on the credential read and lands the second answer', async () => {
        const { service, client } = makeService();
        client.getIntegration
            .mockRejectedValueOnce(GATEWAY_TIMEOUT)
            .mockResolvedValueOnce({ body: { sdkList: ['AdobeAnalyticsSDK'] } });

        await expect(service.getSubscribedServiceCodes('org-1', 'int-1')).resolves.toEqual([
            'AdobeAnalyticsSDK',
        ]);
        expect(client.getIntegration).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
    });

    it('retries a 504 on the subscribe, which is safe because it replaces the whole list', async () => {
        const { service, client } = makeService();
        client.subscribeOAuthServerToServerIntegrationToServices
            .mockRejectedValueOnce(GATEWAY_TIMEOUT)
            .mockResolvedValueOnce({ body: {} });

        await service.subscribeOAuthServerToServerIntegrationToServices('org-1', 'int-1', []);

        expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledTimes(2);
    });

    // Repeating the same call with the same credentials does the same thing, so a
    // refusal is answered, never retried.
    it('never retries a refusal', async () => {
        const { service, client } = makeService();
        const refused = new Error('403 Forbidden — not entitled');
        client.getIntegration.mockRejectedValue(refused);

        await expect(service.getSubscribedServiceCodes('org-1', 'int-1')).resolves.toStrictEqual(
            [],
        );
        expect(client.getIntegration).toHaveBeenCalledTimes(1);
    });

    it('two 504s in a row still fail, rather than retrying forever', async () => {
        const { service, client } = makeService();
        client.subscribeOAuthServerToServerIntegrationToServices.mockRejectedValue(
            GATEWAY_TIMEOUT,
        );

        await expect(
            service.subscribeOAuthServerToServerIntegrationToServices('org-1', 'int-1', []),
        ).rejects.toThrow('504');
        expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledTimes(2);
    });
});
