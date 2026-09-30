/**
 * erpIntegrationClient — the integration's erp/status, erp/detach, erp/lookup and erp/history, called with
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
    'runtime/erp/detach': 'https://ns.adobeioruntime.net/api/v1/web/erp/detach',
    'runtime/erp/keymap': 'https://ns.adobeioruntime.net/api/v1/web/erp/keymap',
    'runtime/erp/lookup': 'https://ns.adobeioruntime.net/api/v1/web/erp/lookup',
    'runtime/erp/history': 'https://ns.adobeioruntime.net/api/v1/web/erp/history',
    'runtime/erp/erps': 'https://ns.adobeioruntime.net/api/v1/web/erp/erps',
    'runtime/erp/settings': 'https://ns.adobeioruntime.net/api/v1/web/erp/settings',
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
        expect(deriveErpActionUrl(URLS, 'detach')).toBe(URLS['runtime/erp/detach']);
        expect(
            deriveErpActionUrl(
                { 'web/app': 'https://x/api/v1/web/app-management/installation' },
                'status'
            )
        ).toBeUndefined();
        expect(deriveErpActionUrl(undefined, 'detach')).toBeUndefined();
    });
});

describe('ErpIntegrationClient', () => {
    it('GETs status with the bearer token and the org header, and answers the body', async () => {
        const fetchImpl = answering(200, {
            app: { id: 'erp', version: '1' },
            erp: { reachable: true, ok: true },
            erpBaseUrl: 'x',
            ledger: { entries: 2 },
        });

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

    it('asks status for one ERP by its list id', async () => {
        const fetchImpl = answering(200, {
            app: { id: 'erp', version: '1' },
            erp: { reachable: true },
            erpBaseUrl: 'x',
            ledger: { entries: 0 },
        });

        await new ErpIntegrationClient(URLS, AUTH, fetchImpl).status('demo-erp-2');

        expect(fetchImpl.mock.calls[0][0]).toBe(`${URLS['runtime/erp/status']}?erp=demo-erp-2`);
    });

    it('POSTs detach and answers the report', async () => {
        const body = { reverted: { reverted: 1, failed: [] }, orders: { cleared: 2, failed: [] } };
        const fetchImpl = answering(200, body);

        const report = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).detach();

        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/detach']);
        expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('POST');
        expect(report).toEqual(body);
    });

    it('POSTs detach with closeOrders for a reset (AB-16n)', async () => {
        const fetchImpl = answering(200, { closed: { cancelled: 1, commented: 0, alreadyClosed: 0, partsRemoved: 1, failed: [] } });

        const report = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).detach({ closeOrders: true });

        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/detach']);
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({ closeOrders: true });
        expect(report.closed?.cancelled).toBe(1);
    });

    it('PUTs the whole key map as JSON, and knows a deployment without the action keeps none', async () => {
        const fetchImpl = answering(200, { entries: 1 });
        const entries = [{ kind: 'customer' as const, commerce: '12', erp: 'C12' }];

        await new ErpIntegrationClient(URLS, AUTH, fetchImpl).replaceKeyMap(entries);

        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/keymap']);
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('PUT');
        expect(JSON.parse(String(init.body))).toEqual({ entries });
        expect(new ErpIntegrationClient(URLS, AUTH, fetchImpl).keepsKeyMap()).toBe(true);
        const { ['runtime/erp/keymap']: _gone, ...older } = URLS;
        expect(new ErpIntegrationClient(older, AUTH, fetchImpl).keepsKeyMap()).toBe(false);
    });

    /*
     * Prices (AB-26z). Shape from the integration's `actions/erp/prices/index.js` (read
     * 2026-09-28): POST `{ erpId? }`, answering the counts of what it published.
     */
    it("POSTs prices for one ERP by its list id, and answers the integration's counts", async () => {
        const answer = {
            erps: ['demo-erp-2'],
            written: 3,
            removed: 1,
            unchanged: 2,
            skipped: [],
            failed: [],
        };
        const fetchImpl = answering(200, answer);
        const urls = {
            ...URLS,
            'runtime/erp/prices': 'https://ns.adobeioruntime.net/api/v1/web/erp/prices',
        };

        const report = await new ErpIntegrationClient(urls, AUTH, fetchImpl).publishPrices(
            'demo-erp-2'
        );

        expect(fetchImpl.mock.calls[0][0]).toBe(urls['runtime/erp/prices']);
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({ erpId: 'demo-erp-2' });
        expect(report).toEqual(answer);
    });

    it('POSTs prices with no body for every ERP, and knows a deployment without the action has none', async () => {
        const fetchImpl = answering(200, {
            erps: ['erp'],
            written: 0,
            removed: 0,
            unchanged: 0,
            skipped: [],
            failed: [],
        });
        const urls = {
            ...URLS,
            'runtime/erp/prices': 'https://ns.adobeioruntime.net/api/v1/web/erp/prices',
        };

        await new ErpIntegrationClient(urls, AUTH, fetchImpl).publishPrices();

        expect((fetchImpl.mock.calls[0][1] as RequestInit).body).toBeUndefined();
        expect(new ErpIntegrationClient(urls, AUTH, fetchImpl).publishesPrices()).toBe(true);
        expect(new ErpIntegrationClient(URLS, AUTH, fetchImpl).publishesPrices()).toBe(false);
    });

    /*
     * Several ERPs (AB-16). Shapes from the integration's `actions/erp/erps/index.js` and
     * `actions/erp/keymap/index.js` (read 2026-09-28): GET answers `{ entries }` (erps adds
     * `stored`), PUT takes `{ entries }` and replaces the whole list or map.
     */
    it('GETs and PUTs the ERP list, and says whether the deployment has one', async () => {
        const entries = [
            {
                id: 'erp',
                name: 'Acme ERP',
                adapter: 'demo-erp',
                connection: { baseUrl: 'https://x/web/demo-erp' },
            },
        ];
        const fetchImpl = answering(200, { entries, stored: false });
        const client = new ErpIntegrationClient(URLS, AUTH, fetchImpl);

        expect(await client.listErps()).toEqual(entries);
        await client.replaceErps(entries);

        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/erps']);
        expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('GET');
        const put = fetchImpl.mock.calls[1][1] as RequestInit;
        expect(put.method).toBe('PUT');
        expect(JSON.parse(String(put.body))).toEqual({ entries });
        expect(client.keepsErpList()).toBe(true);
        const { ['runtime/erp/erps']: _gone, ...older } = URLS;
        expect(new ErpIntegrationClient(older, AUTH, fetchImpl).keepsErpList()).toBe(false);
    });

    it("PATCHes one ERP's own settings at a website scope and answers its entry (AB-16j)", async () => {
        const entry = {
            id: 'demo-erp-2',
            name: 'Contoso ERP',
            adapter: 'demo-erp',
            connection: { baseUrl: 'https://x/web/demo-erp-2' },
            settings: { websites: { bodea: { structure_sales_org: '2000' } } },
        };
        const fetchImpl = answering(200, { entry });
        const client = new ErpIntegrationClient(URLS, AUTH, fetchImpl);

        const answer = await client.updateErpSettings('demo-erp-2', 'bodea', {
            structure_sales_org: '2000',
        });

        expect(answer).toEqual({ entry });
        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/erps']);
        const patch = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(patch.method).toBe('PATCH');
        expect(JSON.parse(String(patch.body))).toEqual({
            id: 'demo-erp-2',
            values: { structure_sales_org: '2000' },
            website: 'bodea',
        });
    });

    it("PATCHes one ERP's own defaults when no website is named, and can clear an override with null", async () => {
        const fetchImpl = answering(200, { entry: { id: 'demo-erp-2' } });
        await new ErpIntegrationClient(URLS, AUTH, fetchImpl).updateErpSettings(
            'demo-erp-2',
            undefined,
            { structure_owns: null }
        );

        expect(JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body))).toEqual({
            id: 'demo-erp-2',
            values: { structure_owns: null },
        });
    });

    it('GETs the key map the integration holds', async () => {
        const entries = [{ kind: 'customer', commerce: '12', erp: 'C12', erpId: 'demo-erp-2' }];
        const fetchImpl = answering(200, { entries });

        expect(await new ErpIntegrationClient(URLS, AUTH, fetchImpl).readKeyMap()).toEqual(entries);
        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/keymap']);
    });

    it("reads the settings in force with one ERP's own on top when it names the ERP", async () => {
        const fetchImpl = answering(200, { default: {}, websites: {} });
        const client = new ErpIntegrationClient(URLS, AUTH, fetchImpl);

        await client.resolvedSettings(['base', 'b2b'], 'demo-erp-2');
        await client.resolvedSettings(['base']);

        expect(fetchImpl.mock.calls[0][0]).toBe(
            `${URLS['runtime/erp/settings']}?websites=base%2Cb2b&erp=demo-erp-2`
        );
        expect(fetchImpl.mock.calls[1][0]).toBe(`${URLS['runtime/erp/settings']}?websites=base`);
    });

    it('GETs lookup with the one query the action takes, encoded, and answers the lookup', async () => {
        // Shape from lib/lookup.js productLookup (read 2026-09-24).
        const body = {
            kind: 'product',
            key: 'A 1/B',
            found: { commerce: true, erp: false },
            rows: [],
            erpHash: null,
        };
        const fetchImpl = answering(200, body);

        const lookup = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).lookup({
            sku: 'A 1/B',
        });

        expect(fetchImpl.mock.calls[0][0]).toBe(`${URLS['runtime/erp/lookup']}?sku=A+1%2FB`);
        expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('GET');
        expect(lookup).toEqual(body);

        await new ErpIntegrationClient(URLS, AUTH, fetchImpl).lookup({ company: '12' });
        expect(fetchImpl.mock.calls[1][0]).toBe(`${URLS['runtime/erp/lookup']}?company=12`);
    });

    it('GETs history?trace=<order> and unwraps the trace the action returns under `trace`', async () => {
        // Shape from lib/order-trace.js buildOrderTrace, wrapped as history/index.js answers it.
        const trace = {
            summary: {
                incrementId: '000000123',
                commerceStatus: 'processing',
                erpNumber: '0000001003',
                erpStatus: 'confirmed',
                reachedErp: true,
            },
            steps: [
                { at: '2026-09-24T10:00:00Z', where: 'commerce', what: 'Order 000000123 placed' },
            ],
        };
        const fetchImpl = answering(200, { trace });

        const answer = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).traceOrder(
            '000000123'
        );

        expect(fetchImpl.mock.calls[0][0]).toBe(`${URLS['runtime/erp/history']}?trace=000000123`);
        expect(answer).toEqual(trace);
    });

    it("a non-2xx answer throws with the action's own message", async () => {
        const fetchImpl = answering(500, { error: 'Commerce answered 503: unavailable' });

        await expect(new ErpIntegrationClient(URLS, AUTH, fetchImpl).detach()).rejects.toThrow(
            new ErpIntegrationApiError('detach', 500, 'Commerce answered 503: unavailable')
        );
    });

    it('an integration without the action is refused before any call', async () => {
        const fetchImpl = answering(200, {});
        await expect(new ErpIntegrationClient({}, AUTH, fetchImpl).status()).rejects.toThrow(
            /deployed no erp\/status action/
        );
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

        const answer = await callErpApi(
            ERP_URLS,
            AUTH,
            'POST',
            'orders/0000001003/confirm?force=1',
            { reason: 'demo' },
            fetchImpl
        );

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders/0000001003/confirm?force=1',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer fake-test-pw-not-a-secret',
                    'x-gw-ims-org-id': 'ABC@AdobeOrg',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason: 'demo' }),
            }
        );
        expect(answer).toMatchObject({ ok: true, status: 200, body: { status: 'confirmed' } });
    });

    it('a GET carries no body and no Content-Type', async () => {
        const fetchImpl = answering(200, { items: [] });
        await callErpApi(ERP_URLS, AUTH, 'GET', 'partners', undefined, fetchImpl);
        const [, init] = fetchImpl.mock.calls[0] as unknown as [
            string,
            RequestInit & { headers: Record<string, string> },
        ];
        expect(init.method).toBe('GET');
        expect(init.body).toBeUndefined();
        expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('refuses a malformed route and an action the ERP does not deploy, before any call', async () => {
        const fetchImpl = answering(200, {});
        expect(
            await callErpApi(ERP_URLS, AUTH, 'GET', '../admin', undefined, fetchImpl)
        ).toHaveProperty('refusal');
        expect(
            await callErpApi(ERP_URLS, AUTH, 'GET', 'https://x/partners', undefined, fetchImpl)
        ).toHaveProperty('refusal');
        expect(await callErpApi(ERP_URLS, AUTH, 'GET', 'pricing', undefined, fetchImpl)).toEqual({
            refusal: 'The ERP deploys no "pricing" action.',
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
