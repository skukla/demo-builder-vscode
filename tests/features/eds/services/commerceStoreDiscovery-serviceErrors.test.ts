/**
 * commerceStoreDiscovery — the failure paths, asserted exactly.
 *
 * The discovery service's rejections are the field-diagnosis surface: the same
 * "Token is invalid or expired" body comes back for several unrelated causes, so
 * the status, the statusText and the body's own `error` all have to survive into
 * the message. The sibling suite pins that they APPEAR; this one pins the whole
 * message, because a raw body that happens to contain the parsed error reads
 * identically to a parsed one.
 *
 * The rest is the guard chain around it: which half of a missing pair is
 * enough, which endpoint the service is asked about, and the two structural
 * error classifications that replaced substring matching after it collided with
 * service-response bodies containing the words "timeout" and "fetch failed".
 */

import {
    discoverStoreStructure,
    errorFromDiscovery,
    fetchStoreStructurePaas,
    spyOnFetch,
} from './commerceStoreDiscovery.testUtils';
import type { CommerceStoreStructure, StoreDiscoveryParams } from '@/types/commerceStore';

const SERVICE_URL = 'https://actions.adobeioruntime.net/api/v1/web/discovery/discover-stores';

const STRUCTURE: CommerceStoreStructure = {
    websites: [{ id: 1, code: 'base', name: 'Main Website' }],
    storeGroups: [{ id: 1, code: 'main', name: 'Main Store', website_id: 1, root_category_id: 2 }],
    storeViews: [
        {
            id: 1,
            code: 'default',
            name: 'Default View',
            store_group_id: 1,
            website_id: 1,
            is_active: 1,
        },
    ],
};

const ACCS_PARAMS: StoreDiscoveryParams = {
    backendType: 'accs',
    baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
    imsToken: 'mock-ims-token',
    discoveryServiceUrl: SERVICE_URL,
};

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
    fetchSpy = spyOnFetch();
});

afterEach(() => {
    fetchSpy.mockRestore();
});

describe('fetchStoreResource — how an HTTP failure is described', () => {
    it.each([401, 403])('calls %s an access problem, naming the status', async (status) => {
        fetchSpy.mockResolvedValue({ ok: false, status, statusText: 'Denied' });

        await expect(fetchStoreStructurePaas('https://magento.test', 'tok')).rejects.toThrow(
            `Access denied (${status}). Your credentials may lack Commerce access permissions.`,
        );
    });

    it('does not call a 500 an access problem — the credentials were fine', async () => {
        fetchSpy.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

        await expect(fetchStoreStructurePaas('https://magento.test', 'tok')).rejects.toThrow(
            'Store API request failed: 500 Internal Server Error',
        );
    });
});

describe('the discovery service request', () => {
    it('asks about the ACCS endpoint the caller named, with the IMS token', async () => {
        fetchSpy.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true, data: STRUCTURE }),
        });

        await discoverStoreStructure({
            ...ACCS_PARAMS,
            accsGraphqlEndpoint: 'https://na1-sandbox.api.commerce.adobe.com/tenant/graphql',
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            `${SERVICE_URL}?accsEndpoint=${encodeURIComponent(
                'https://na1-sandbox.api.commerce.adobe.com/tenant/graphql',
            )}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock-ims-token',
                    'Content-Type': 'application/json',
                },
                signal: expect.anything(),
            },
        );
    });

    it('falls back to the base URL when no GraphQL endpoint was configured', async () => {
        fetchSpy.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true, data: STRUCTURE }),
        });

        await discoverStoreStructure(ACCS_PARAMS);

        expect(fetchSpy).toHaveBeenCalledWith(
            `${SERVICE_URL}?accsEndpoint=${encodeURIComponent(
                'https://na1-sandbox.api.commerce.adobe.com',
            )}`,
            expect.anything(),
        );
    });
});

describe('what the discovery service said when it refused', () => {
    const refuseWith = (body: string, textThrows = false): void => {
        fetchSpy.mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: () =>
                textThrows ? Promise.reject(new Error('stream closed')) : Promise.resolve(body),
        });
    };

    it("uses the body's own error field, not the JSON it arrived in", async () => {
        refuseWith('{"error":"Token is invalid or expired"}');

        // Whole message, not a substring: a raw body containing the same words
        // reads identically to a parsed one, which is how the parse block could
        // stop working without any test noticing.
        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe(
            '401 Unauthorized — Token is invalid or expired',
        );
    });

    it('falls back to the raw body when it is not JSON at all', async () => {
        refuseWith('<html>Bad Gateway</html>');

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe(
            '401 Unauthorized — <html>Bad Gateway</html>',
        );
    });

    it('falls back to the raw body when the JSON carries no error field', async () => {
        refuseWith('{"detail":"nope"}');

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('401 Unauthorized — {"detail":"nope"}');
    });

    it('says so plainly when there was no body to read', async () => {
        refuseWith('');

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('401 Unauthorized — (empty body)');
    });

    it('says so plainly when the body could not be read at all', async () => {
        refuseWith('', true);

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('401 Unauthorized — (empty body)');
    });
});

describe('what the discovery service returned when it answered', () => {
    const answerWith = (body: unknown): void => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
    };

    it('reports the service error when it says it did not succeed', async () => {
        answerWith({ success: false, error: 'Commerce unreachable from the action' });

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe(
            'Commerce unreachable from the action',
        );
    });

    it('does not trust data attached to an unsuccessful answer', async () => {
        answerWith({ success: false, error: 'partial read', data: STRUCTURE });

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('partial read');
    });

    it('says the service returned no data when it succeeded with none', async () => {
        answerWith({ success: true });

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('Discovery service returned no data');
    });

    it('says the service returned no data when it failed without saying why', async () => {
        answerWith({ success: false });

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('Discovery service returned no data');
    });
});

describe('the guards before any request is made', () => {
    it.each([
        ['no password', { username: 'admin' }],
        ['no username', { password: 'fake-test-pw-not-a-secret' }],
        ['neither', {}],
    ])('refuses a PaaS discovery with %s', async (_label, credentials) => {
        const error = await errorFromDiscovery({
            backendType: 'paas',
            baseUrl: 'https://magento.test',
            ...credentials,
        });

        expect(error).toBe(
            'Fill in the Admin Username and Admin Password fields above, then try again.',
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        ['no IMS token', { discoveryServiceUrl: SERVICE_URL }],
        ['no service URL', { imsToken: 'mock-ims-token' }],
        ['neither', {}],
    ])('refuses an ACCS discovery with %s', async (_label, partial) => {
        const error = await errorFromDiscovery({
            backendType: 'accs',
            baseUrl: 'https://na1-sandbox.api.commerce.adobe.com',
            ...partial,
        });

        expect(error).toBe('Discovery service not configured or IMS token missing.');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses a discovery service URL that is not HTTPS', async () => {
        const error = await errorFromDiscovery({
            ...ACCS_PARAMS,
            discoveryServiceUrl: 'http://actions.adobeioruntime.net/api/v1/web/discovery',
        });

        expect(error).toContain('protocol must be one of: https');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses a discovery service URL pointing at a private address', async () => {
        const error = await errorFromDiscovery({
            ...ACCS_PARAMS,
            discoveryServiceUrl: 'https://192.168.1.10/discover',
        });

        expect(error).toContain('local/private networks');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('classifying a thrown failure', () => {
    it('recognises a real network failure by its type AND message', async () => {
        fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe(
            'Cannot reach the Commerce instance. Check the URL and ensure the server is running.',
        );
    });

    it('does not claim unreachable for a different TypeError', async () => {
        fetchSpy.mockRejectedValue(new TypeError('Invalid URL'));

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('Invalid URL');
    });

    it('does not claim unreachable for an ordinary error that merely says so', async () => {
        // The structural check exists because service-response bodies contain
        // these words; a substring match swallowed the HTTP status they carry.
        fetchSpy.mockRejectedValue(new Error('fetch failed'));

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe('fetch failed');
    });

    it('recognises an aborted request by its name', async () => {
        fetchSpy.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

        await expect(errorFromDiscovery(ACCS_PARAMS)).resolves.toBe(
            'Connection timed out. Check the Commerce URL and try again.',
        );
    });
});
