/**
 * AdobeOrgServices — everything the retry suite does not pin.
 *
 * The SDK is MOCKED via the SDK client's getClient(); no live Adobe calls.
 * Every assertion is on the ARGUMENTS the SDK receives or on the value/error
 * the caller sees — never on a log line.
 *
 *   - lazy SDK init: ensureInitialized runs only when the client is not initialised
 *   - the per-org catalog cache: hit inside the TTL, miss AT the boundary, empty
 *     results never cached
 *   - single-flight: concurrent same-org callers share one SDK fetch
 *   - the fetch budget is exactly ORG_SERVICES_FETCH, on the first try and on the retry
 *   - an SDK that resolves NOTHING is a fast failure (retried once), and two of them
 *     throw the module's own message rather than a TypeError
 *   - getSubscribedServiceCodes reads getIntegration(orgId, idIntegration).sdkList and
 *     is fail-safe to []
 *   - both subscribe wrappers forward (orgId, idIntegration, serviceInfo) verbatim, and
 *     a refusal INSIDE an HTTP 200 throws with the service's own reason
 *
 * sleep() is module-mocked so the retry pause costs nothing.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { makeService, never, SERVICES } from './adobeOrgServices.testUtils';
import type { ServiceSubscriptionInfo } from '@/features/authentication/services/types';
import { sleep } from '@/core/utils/sleep';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';

const SERVICE_INFO: ServiceSubscriptionInfo[] = [
    { sdkCode: 'GraphQLServiceSDK', licenseConfigs: [], roles: [] },
];
const REFUSED = 'Adobe refused the API subscription — ';

describe('AdobeOrgServices — lazy SDK init', () => {
    beforeEach(() => jest.clearAllMocks());

    it('initialises the SDK before the first call when it is not yet initialised', async () => {
        const { service, client, sdkClient } = makeService(false);
        client.getIntegration.mockResolvedValue({ body: { sdkList: ['A'] } });

        await service.getSubscribedServiceCodes('org-1', 'int-1');

        expect(sdkClient.ensureInitialized).toHaveBeenCalledTimes(1);
        expect(sdkClient.ensureInitialized.mock.invocationCallOrder[0]).toBeLessThan(
            client.getIntegration.mock.invocationCallOrder[0]
        );
    });

    it('does not re-initialise an SDK that is already initialised', async () => {
        const { service, client, sdkClient } = makeService(true);
        client.getIntegration.mockResolvedValue({ body: { sdkList: ['A'] } });

        await service.getSubscribedServiceCodes('org-1', 'int-1');

        expect(sdkClient.ensureInitialized).not.toHaveBeenCalled();
    });
});

describe('AdobeOrgServices — getServicesForOrg cache', () => {
    let nowSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
        jest.clearAllMocks();
        nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    });
    afterEach(() => nowSpy.mockRestore());

    it('answers a second call inside the TTL from the cache — one SDK fetch', async () => {
        const { service, client } = makeService();
        client.getServicesForOrg.mockResolvedValue({ body: SERVICES });

        await service.getServicesForOrg('org-1');
        nowSpy.mockReturnValue(1_000 + CACHE_TTL.ORG_SERVICES - 1);
        const second = await service.getServicesForOrg('org-1');

        expect(second).toEqual(SERVICES);
        expect(client.getServicesForOrg).toHaveBeenCalledTimes(1);
    });

    it('refetches AT the TTL boundary — the entry expires on, not after, its deadline', async () => {
        const { service, client } = makeService();
        client.getServicesForOrg.mockResolvedValue({ body: SERVICES });

        await service.getServicesForOrg('org-1');
        nowSpy.mockReturnValue(1_000 + CACHE_TTL.ORG_SERVICES);
        await service.getServicesForOrg('org-1');

        expect(client.getServicesForOrg).toHaveBeenCalledTimes(2);
    });

    it('never caches an empty catalog — the next call fetches again', async () => {
        const { service, client } = makeService();
        client.getServicesForOrg.mockResolvedValue({ body: [] });

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual([]);
        await service.getServicesForOrg('org-1');

        expect(client.getServicesForOrg).toHaveBeenCalledTimes(2);
    });

    it('collapses concurrent same-org callers into one SDK fetch', async () => {
        const { service, client } = makeService();
        client.getServicesForOrg.mockResolvedValue({ body: SERVICES });

        const [a, b] = await Promise.all([
            service.getServicesForOrg('org-1'),
            service.getServicesForOrg('org-1'),
        ]);

        expect(a).toEqual(SERVICES);
        expect(b).toEqual(SERVICES);
        expect(client.getServicesForOrg).toHaveBeenCalledTimes(1);
        expect(client.getServicesForOrg).toHaveBeenCalledWith('org-1');
    });
});

describe('AdobeOrgServices — fetch budget and empty answers', () => {
    beforeEach(() => jest.clearAllMocks());

    it('gives the first try exactly ORG_SERVICES_FETCH before timing out', async () => {
        jest.useFakeTimers();
        try {
            const { service, client } = makeService();
            client.getServicesForOrg.mockImplementation(never);
            let settled = false;

            const pending = service.getServicesForOrg('org-1');
            pending.then(
                () => (settled = true),
                () => (settled = true)
            );
            // The handler must attach BEFORE the timers advance or the rejection is
            // unhandled; the rule cannot see a deferred await.
            // eslint-disable-next-line jest/valid-expect
            const guard = expect(pending).rejects.toThrow(
                `SDK org services fetch timed out after ${TIMEOUTS.ORG_SERVICES_FETCH}ms`
            );

            await jest.advanceTimersByTimeAsync(TIMEOUTS.ORG_SERVICES_FETCH - 1);
            expect(settled).toBe(false);

            await jest.advanceTimersByTimeAsync(1);
            await guard;
            expect(settled).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('gives the retry the same budget, and names it as the retry', async () => {
        jest.useFakeTimers();
        try {
            const { service, client } = makeService();
            client.getServicesForOrg
                .mockRejectedValueOnce(new Error('500'))
                .mockImplementationOnce(never);
            let settled = false;

            const pending = service.getServicesForOrg('org-1');
            pending.then(
                () => (settled = true),
                () => (settled = true)
            );
            // eslint-disable-next-line jest/valid-expect
            const guard = expect(pending).rejects.toThrow(
                `SDK org services fetch (retry) timed out after ${TIMEOUTS.ORG_SERVICES_FETCH}ms`
            );

            await jest.advanceTimersByTimeAsync(TIMEOUTS.ORG_SERVICES_FETCH - 1);
            expect(settled).toBe(false);
            expect(client.getServicesForOrg).toHaveBeenCalledTimes(2);

            await jest.advanceTimersByTimeAsync(1);
            await guard;
        } finally {
            jest.useRealTimers();
        }
    });

    it('an SDK that resolves nothing is a fast failure — retried once, retry answer lands', async () => {
        const { service, client } = makeService();
        client.getServicesForOrg
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ body: SERVICES });

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual(SERVICES);

        expect(client.getServicesForOrg).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
    });

    it("two empty answers throw the module's own message, not a TypeError", async () => {
        const { service, client } = makeService();
        client.getServicesForOrg.mockResolvedValue(undefined);

        await expect(service.getServicesForOrg('org-1')).rejects.toThrow(
            'Adobe org services request failed'
        );
    });

    it("a rejection is rethrown as the SDK's own error instance", async () => {
        const { service, client } = makeService();
        const sdkError = new Error('500 Internal Server Error');
        client.getServicesForOrg.mockRejectedValue(sdkError);

        await expect(service.getServicesForOrg('org-1')).rejects.toBe(sdkError);
    });

    it('a response with no body is an empty catalog', async () => {
        const { service, client } = makeService();
        client.getServicesForOrg.mockResolvedValue({});

        await expect(service.getServicesForOrg('org-1')).resolves.toEqual([]);
    });
});

describe('AdobeOrgServices — getSubscribedServiceCodes', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reads sdkList from getIntegration(orgId, idIntegration)', async () => {
        const { service, client } = makeService();
        client.getIntegration.mockResolvedValue({ body: { sdkList: ['A', 'B'] } });

        await expect(service.getSubscribedServiceCodes('org-1', 'int-9')).resolves.toEqual([
            'A',
            'B',
        ]);
        expect(client.getIntegration).toHaveBeenCalledWith('org-1', 'int-9');
    });

    it('a body without sdkList reads as no subscriptions', async () => {
        const { service, client } = makeService();
        client.getIntegration.mockResolvedValue({ body: {} });

        await expect(service.getSubscribedServiceCodes('org-1', 'int-9')).resolves.toEqual([]);
    });

    it('no response at all reads as no subscriptions', async () => {
        const { service, client } = makeService();
        client.getIntegration.mockResolvedValue(undefined);

        await expect(service.getSubscribedServiceCodes('org-1', 'int-9')).resolves.toEqual([]);
    });

    it('a failing read is fail-safe: [] so callers fall through to subscribing', async () => {
        const { service, client } = makeService();
        client.getIntegration.mockRejectedValue(new Error('403'));

        await expect(service.getSubscribedServiceCodes('org-1', 'int-9')).resolves.toEqual([]);
    });
});

describe('AdobeOrgServices — subscribe wrappers', () => {
    beforeEach(() => jest.clearAllMocks());

    it('AdobeID: forwards (orgId, idIntegration, serviceInfo) and accepts a bodiless 200', async () => {
        const { service, client } = makeService();
        client.subscribeAdobeIdIntegrationToServices.mockResolvedValue({});

        await expect(
            service.subscribeAdobeIdIntegrationToServices('org-1', 'int-1', SERVICE_INFO)
        ).resolves.toBeUndefined();

        expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledTimes(1);
        expect(client.subscribeAdobeIdIntegrationToServices).toHaveBeenCalledWith(
            'org-1',
            'int-1',
            SERVICE_INFO
        );
    });

    it('OAuth S2S: forwards (orgId, idIntegration, serviceInfo) and accepts no response', async () => {
        const { service, client } = makeService();
        client.subscribeOAuthServerToServerIntegrationToServices.mockResolvedValue(undefined);

        await expect(
            service.subscribeOAuthServerToServerIntegrationToServices(
                'org-1',
                'int-2',
                SERVICE_INFO
            )
        ).resolves.toBeUndefined();

        expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledTimes(1);
        expect(client.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
            'org-1',
            'int-2',
            SERVICE_INFO
        );
    });

    it('AdobeID: a refusal inside a 200 throws too', async () => {
        const { service, client } = makeService();
        client.subscribeAdobeIdIntegrationToServices.mockResolvedValue({
            body: { error: ['ACCS-REST-API'] },
        });

        await expect(
            service.subscribeAdobeIdIntegrationToServices('org-1', 'int-1', SERVICE_INFO)
        ).rejects.toThrow(`${REFUSED}ACCS-REST-API`);
    });
});

describe('AdobeOrgServices — a refusal inside an HTTP 200', () => {
    beforeEach(() => jest.clearAllMocks());

    const subscribe = (body: unknown) => {
        const { service, client } = makeService();
        client.subscribeOAuthServerToServerIntegrationToServices.mockResolvedValue({ body });
        return service.subscribeOAuthServerToServerIntegrationToServices(
            'org-1',
            'int-2',
            SERVICE_INFO
        );
    };

    it("carries the service's own reason through verbatim", async () => {
        await expect(
            subscribe({
                error: ['ACCS-REST-API'],
                errorDetails: [
                    {
                        sdkCode: 'ACCS-REST-API',
                        code: 400,
                        message: 'Service ACCS-REST-API requires selection of a product',
                    },
                ],
            })
        ).rejects.toThrow(
            `${REFUSED}ACCS-REST-API: Service ACCS-REST-API requires selection of a product`
        );
    });

    it('joins several reasons with "; "', async () => {
        await expect(
            subscribe({
                error: ['A', 'B'],
                errorDetails: [
                    { sdkCode: 'A', message: 'first' },
                    { sdkCode: 'B', message: 'second' },
                ],
            })
        ).rejects.toThrow(`${REFUSED}A: first; B: second`);
    });

    it('falls back to the HTTP code when a detail has no message', async () => {
        await expect(
            subscribe({ error: ['A'], errorDetails: [{ sdkCode: 'A', code: 400 }] })
        ).rejects.toThrow(`${REFUSED}A: HTTP 400`);
    });

    it('a detail with no sdkCode is just its message', async () => {
        await expect(
            subscribe({ error: ['A'], errorDetails: [{ message: 'no code given' }] })
        ).rejects.toThrow(`${REFUSED}no code given`);
    });

    it('names the refused codes with ", " when there are no details', async () => {
        await expect(subscribe({ error: ['A', 'B'] })).rejects.toThrow(`${REFUSED}A, B`);
    });

    it('a detail with neither code nor message names nothing — the codes stand in', async () => {
        await expect(subscribe({ error: ['A'], errorDetails: [{ code: 400 }] })).rejects.toThrow(
            `${REFUSED}A`
        );
    });

    it('details alone — no error list — still refuse', async () => {
        await expect(
            subscribe({ errorDetails: [{ sdkCode: 'A', message: 'refused' }] })
        ).rejects.toThrow(`${REFUSED}A: refused`);
    });

    it.each([
        ['no body', undefined],
        ['an empty body', {}],
        ['an empty error list', { error: [], errorDetails: [] }],
    ])('only positive evidence fails — %s passes', async (_label, body) => {
        await expect(subscribe(body)).resolves.toBeUndefined();
    });
});
