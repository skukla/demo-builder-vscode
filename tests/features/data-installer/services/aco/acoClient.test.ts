/**
 * The one ACO client (PL-60): an IMS token from the project's ACO credential, then typed calls to
 * the Data Ingestion API under the instance's base URL.
 *
 * The shapes asserted are Adobe's documented ones (developer.adobe.com, read 2026-10-31):
 * - token: `POST https://ims-na1.adobelogin.com/ims/token/v3`, form body `grant_type=client_credentials`,
 *   `client_id`, `client_secret`, `scope=openid,AdobeID,profile,email,commerce.aco.ingestion`
 *   (data-ingestion/authentication/);
 * - base URL `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}`, JSON array bodies,
 *   `Authorization: Bearer …`, 429 past 300 requests a minute (data-ingestion/using-the-api/).
 */

import {
    ACO_IMS_TOKEN_URL,
    ACO_INGESTION_SCOPES,
    AcoApiError,
    acoApiBase,
    acoGraphqlUrl,
    createAcoClient,
} from '@/features/data-installer/services/aco/acoClient';
import type { AcoInstance } from '@/types/aco';

const SANDBOX: AcoInstance = { tenantId: 'TenantAbc123', region: 'na1', environment: 'sandbox' };
const PRODUCTION: AcoInstance = { tenantId: 'TenantAbc123', region: 'eu1', environment: 'production' };
const CREDENTIAL = { clientId: 'client-id-1', clientSecret: 'fake-test-pw-not-a-secret' };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const TOKEN = () => json(200, { access_token: 'token-1', expires_in: 86399 });

function client(fetchImpl: jest.Mock, extra: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    return createAcoClient({ instance: SANDBOX, credential: CREDENTIAL, fetch: fetchImpl, sleep: async () => undefined, ...extra });
}

describe('acoApiBase / acoGraphqlUrl', () => {
    it('puts -sandbox in a sandbox host and the tenant in the path', () => {
        expect(acoApiBase(SANDBOX)).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123');
        expect(acoGraphqlUrl(SANDBOX)).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/graphql');
    });

    it('has no environment part for production', () => {
        expect(acoApiBase(PRODUCTION)).toBe('https://eu1.api.commerce.adobe.com/TenantAbc123');
    });

    it('refuses a tenant id or region that could change the URL', () => {
        expect(() => acoApiBase({ ...SANDBOX, tenantId: 'abc/../x' })).toThrow(/tenant id/i);
        expect(() => acoApiBase({ ...SANDBOX, region: 'na1.evil.com#' })).toThrow(/region/i);
        expect(() => acoApiBase({ ...SANDBOX, tenantId: '' })).toThrow(/tenant id/i);
    });
});

describe('createAcoClient', () => {
    it('asks IMS for a client-credentials token with the ingestion scope', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN()).mockResolvedValueOnce(json(200, { status: 'ACCEPTED', acceptedCount: 1 }));
        await client(fetchImpl).post('/v1/catalog/products', [{ sku: 'a' }]);

        const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(ACO_IMS_TOKEN_URL);
        expect(init.method).toBe('POST');
        const form = new URLSearchParams(String(init.body));
        expect(form.get('grant_type')).toBe('client_credentials');
        expect(form.get('client_id')).toBe('client-id-1');
        expect(form.get('client_secret')).toBe('fake-test-pw-not-a-secret');
        expect(form.get('scope')).toBe(ACO_INGESTION_SCOPES);
        expect(ACO_INGESTION_SCOPES.split(',')).toContain('commerce.aco.ingestion');
    });

    it('posts the rows as a JSON array to the path under the instance, with the bearer token', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN()).mockResolvedValueOnce(json(200, { status: 'ACCEPTED', acceptedCount: 2 }));
        const accepted = await client(fetchImpl).post('/v1/catalog/products/delete', [{ sku: 'a' }, { sku: 'b' }]);

        const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
        expect(url).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/v1/catalog/products/delete');
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
        expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
        expect(JSON.parse(String(init.body))).toEqual([{ sku: 'a' }, { sku: 'b' }]);
        expect(accepted).toBe(2);
    });

    it('answers the row count when ACO says nothing about how many it accepted', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN()).mockResolvedValueOnce(new Response('', { status: 200 }));
        await expect(client(fetchImpl).post('/v1/catalog/categories', [{ slug: 'a' }])).resolves.toBe(1);
    });

    it('reuses the token until it is close to expiring', async () => {
        let clock = 0;
        const fetchImpl = jest.fn(async (url: string) => (url === ACO_IMS_TOKEN_URL ? TOKEN() : json(200, { acceptedCount: 1 })));
        const aco = client(fetchImpl as unknown as jest.Mock, { now: () => clock });
        await aco.post('/v1/catalog/products', [{}]);
        await aco.post('/v1/catalog/products', [{}]);
        expect(fetchImpl.mock.calls.filter(([url]) => url === ACO_IMS_TOKEN_URL)).toHaveLength(1);
        clock = 86_399_000; // past the token's life
        await aco.post('/v1/catalog/products', [{}]);
        expect(fetchImpl.mock.calls.filter(([url]) => url === ACO_IMS_TOKEN_URL)).toHaveLength(2);
    });

    it('says IMS refused the credential, with its status, and never the secret', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(json(401, { error: 'invalid_client' }));
        const error = await client(fetchImpl).post('/v1/catalog/products', [{}]).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AcoApiError);
        expect((error as AcoApiError).status).toBe(401);
        expect((error as AcoApiError).stage).toBe('token');
        expect((error as Error).message).toMatch(/ACO credential/);
        expect((error as Error).message).not.toContain('fake-test-pw-not-a-secret');
    });

    it('carries the status and ACO\'s own words when a write is refused', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN()).mockResolvedValueOnce(json(400, { message: 'sku is required' }));
        const error = await client(fetchImpl).post('/v1/catalog/products', [{}]).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AcoApiError);
        expect((error as AcoApiError).status).toBe(400);
        expect((error as AcoApiError).stage).toBe('ingestion');
        expect((error as Error).message).toBe('ACO answered 400 for POST /v1/catalog/products: sku is required');
    });

    it('waits and retries when ACO asks it to slow down, then gives up naming the 429', async () => {
        const sleep = jest.fn(async () => undefined);
        const fetchImpl = jest.fn(async (url: string) => (url === ACO_IMS_TOKEN_URL ? TOKEN() : json(429, {}, { 'retry-after': '2' })));
        const error = await client(fetchImpl as unknown as jest.Mock, { sleep }).post('/v1/catalog/products', [{}]).catch((e: unknown) => e);
        expect((error as AcoApiError).status).toBe(429);
        expect(sleep).toHaveBeenCalledWith(2000);
        // one first try and the retries
        expect(fetchImpl.mock.calls.filter(([url]) => url !== ACO_IMS_TOKEN_URL).length).toBeGreaterThan(1);
    });

    it('goes on after one 429 when the retry is answered', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce(TOKEN())
            .mockResolvedValueOnce(json(429, {}))
            .mockResolvedValueOnce(json(200, { acceptedCount: 1 }));
        await expect(client(fetchImpl).post('/v1/catalog/products', [{}])).resolves.toBe(1);
    });

    it('says ACO did not answer when the call never returns', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN()).mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
        const error = await client(fetchImpl).post('/v1/catalog/products', [{}]).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AcoApiError);
        expect((error as AcoApiError).status).toBeUndefined();
        expect((error as Error).message).toMatch(/did not answer/);
    });

    it('authenticates by minting a token, writing nothing', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN());
        await client(fetchImpl).authenticate();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toBe(ACO_IMS_TOKEN_URL);
    });

    it('passes a timeout signal on every call', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(TOKEN()).mockResolvedValueOnce(json(200, { acceptedCount: 1 }));
        await client(fetchImpl).post('/v1/catalog/products', [{}]);
        for (const [, init] of fetchImpl.mock.calls as Array<[string, RequestInit]>) expect(init.signal).toBeDefined();
    });
});
