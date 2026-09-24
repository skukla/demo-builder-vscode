/**
 * erpIntegrationClient — the integration's erp/status, erp/reset, erp/lookup and erp/history, called with
 * the signed-in IMS identity, addressed by the URLs the deploy answered.
 */

import {
    ErpIntegrationApiError,
    ErpIntegrationClient,
    callErpApi,
    deriveErpActionUrl,
} from '@/features/app-builder/services/erpIntegrationClient';

const URLS = {
    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
    'runtime/erp/reset': 'https://ns.adobeioruntime.net/api/v1/web/erp/reset',
    'runtime/erp/mirror': 'https://ns.adobeioruntime.net/api/v1/web/erp/mirror',
    'runtime/erp/lookup': 'https://ns.adobeioruntime.net/api/v1/web/erp/lookup',
    'runtime/erp/history': 'https://ns.adobeioruntime.net/api/v1/web/erp/history',
};
const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

function answering(status: number, body: unknown) {
    return jest.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    })) as unknown as jest.MockedFunction<typeof fetch>;
}

describe('deriveErpActionUrl', () => {
    it('finds the action by its path suffix and nothing else', () => {
        expect(deriveErpActionUrl(URLS, 'status')).toBe(URLS['runtime/erp/status']);
        expect(deriveErpActionUrl(URLS, 'reset')).toBe(URLS['runtime/erp/reset']);
        expect(deriveErpActionUrl({ 'web/app': 'https://x/api/v1/web/app-management/installation' }, 'status')).toBeUndefined();
        expect(deriveErpActionUrl(undefined, 'reset')).toBeUndefined();
    });
});

describe('ErpIntegrationClient', () => {
    it('GETs status with the bearer token and the org header, and answers the body', async () => {
        const fetchImpl = answering(200, { app: { id: 'erp', version: '1' }, erp: { reachable: true, ok: true }, erpBaseUrl: 'x', ledger: { entries: 2 } });

        const status = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).status();

        expect(fetchImpl).toHaveBeenCalledWith(URLS['runtime/erp/status'], {
            method: 'GET',
            headers: {
                Authorization: 'Bearer fake-test-pw-not-a-secret',
                'x-gw-ims-org-id': 'ABC@AdobeOrg',
                Accept: 'application/json',
            },
        });
        expect(status.ledger.entries).toBe(2);
    });

    it('POSTs reset and answers the report', async () => {
        const fetchImpl = answering(200, { reverted: { reverted: 1, failed: [] }, mirrored: { counts: { products: 40, companies: 3 } } });

        const report = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).reset();

        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/reset']);
        expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('POST');
        expect(report.mirrored?.counts).toEqual({ products: 40, companies: 3 });
    });

    it('GETs lookup with the one query the action takes, encoded, and answers the lookup', async () => {
        // Shape from lib/lookup.js productLookup (read 2026-09-24).
        const body = { kind: 'product', key: 'A 1/B', found: { commerce: true, erp: false }, rows: [], erpHash: null };
        const fetchImpl = answering(200, body);

        const lookup = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).lookup({ sku: 'A 1/B' });

        expect(fetchImpl.mock.calls[0][0]).toBe(`${URLS['runtime/erp/lookup']}?sku=A+1%2FB`);
        expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('GET');
        expect(lookup).toEqual(body);

        await new ErpIntegrationClient(URLS, AUTH, fetchImpl).lookup({ company: '12' });
        expect(fetchImpl.mock.calls[1][0]).toBe(`${URLS['runtime/erp/lookup']}?company=12`);
    });

    it('GETs history?trace=<order> and unwraps the trace the action returns under `trace`', async () => {
        // Shape from lib/order-trace.js buildOrderTrace, wrapped as history/index.js answers it.
        const trace = {
            summary: { incrementId: '000000123', commerceStatus: 'processing', erpNumber: '0000001003', erpStatus: 'confirmed', reachedErp: true },
            steps: [{ at: '2026-09-24T10:00:00Z', where: 'commerce', what: 'Order 000000123 placed' }],
        };
        const fetchImpl = answering(200, { trace });

        const answer = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).traceOrder('000000123');

        expect(fetchImpl.mock.calls[0][0]).toBe(`${URLS['runtime/erp/history']}?trace=000000123`);
        expect(answer).toEqual(trace);
    });

    it("a non-2xx answer throws with the action's own message", async () => {
        const fetchImpl = answering(500, { error: 'ERP wipe answered 503: unavailable' });

        await expect(new ErpIntegrationClient(URLS, AUTH, fetchImpl).reset()).rejects.toThrow(
            new ErpIntegrationApiError('reset', 500, 'ERP wipe answered 503: unavailable'),
        );
    });

    it('an integration without the action is refused before any call', async () => {
        const fetchImpl = answering(200, {});
        await expect(new ErpIntegrationClient({}, AUTH, fetchImpl).status()).rejects.toThrow(/deployed no erp\/status action/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("callErpApi — the ERP's own routes", () => {
    const ERP_URLS = {
        'runtime/demo-erp/partners': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/partners',
        'runtime/demo-erp/orders': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders',
    };

    it('addresses <action>/<rest>?query under the deployed action and sends the JSON body with the sign-in', async () => {
        const fetchImpl = answering(200, { number: '0000001003', status: 'confirmed' });

        const answer = await callErpApi(ERP_URLS, AUTH, 'POST', 'orders/0000001003/confirm?force=1', { reason: 'demo' }, fetchImpl);

        expect(fetchImpl).toHaveBeenCalledWith('https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders/0000001003/confirm?force=1', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer fake-test-pw-not-a-secret',
                'x-gw-ims-org-id': 'ABC@AdobeOrg',
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason: 'demo' }),
        });
        expect(answer).toMatchObject({ ok: true, status: 200, body: { status: 'confirmed' } });
    });

    it('a GET carries no body and no Content-Type', async () => {
        const fetchImpl = answering(200, { items: [] });
        await callErpApi(ERP_URLS, AUTH, 'GET', 'partners', undefined, fetchImpl);
        const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
        expect(init.method).toBe('GET');
        expect(init.body).toBeUndefined();
        expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('refuses a malformed route and an action the ERP does not deploy, before any call', async () => {
        const fetchImpl = answering(200, {});
        expect(await callErpApi(ERP_URLS, AUTH, 'GET', '../admin', undefined, fetchImpl)).toHaveProperty('refusal');
        expect(await callErpApi(ERP_URLS, AUTH, 'GET', 'https://x/partners', undefined, fetchImpl)).toHaveProperty('refusal');
        expect(await callErpApi(ERP_URLS, AUTH, 'GET', 'pricing', undefined, fetchImpl)).toEqual({ refusal: 'The ERP deploys no "pricing" action.' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
