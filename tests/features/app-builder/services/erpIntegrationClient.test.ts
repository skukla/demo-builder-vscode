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

/** A run id as the integration's `erp/detach` accepts one (its contract, AB-61). */
const RUN_ID = /^[A-Za-z0-9_-]{8,64}$/;

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
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        // Always a run id, and nothing else unless asked (AB-61).
        expect(JSON.parse(String(init.body))).toEqual({ run: expect.stringMatching(RUN_ID) });
        expect(report).toEqual(body);
    });

    it('POSTs detach with closeOrders for a reset (AB-16n)', async () => {
        const fetchImpl = answering(200, { closed: { cancelled: 1, commented: 0, alreadyClosed: 0, partsRemoved: 1, failed: [] } });

        const report = await new ErpIntegrationClient(URLS, AUTH, fetchImpl).detach({ closeOrders: true });

        expect(fetchImpl.mock.calls[0][0]).toBe(URLS['runtime/erp/detach']);
        const init = fetchImpl.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({
            run: expect.stringMatching(RUN_ID),
            closeOrders: true,
        });
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

/*
 * A detach that outlives its answer (AB-61). A web action's HTTP answer is cut off at 60 s
 * with a 504 while the action runs on, so the client names every detach with a run id and,
 * when the integration records runs (`detachRuns` on erp/status), reads the run's record
 * until it ends. The record's shape is the integration's contract as handed over on
 * 2026-10-02: `{ run, status, startedAt, finishedAt?, result?, error? }`. The 504's body
 * here is a stand-in: only its status is read.
 */
describe('ErpIntegrationClient.detach, when the answer is cut off at 60 seconds (AB-61)', () => {
    const DETACH = URLS['runtime/erp/detach'];
    const STATUS = URLS['runtime/erp/status'];
    const LIVE = {
        app: { id: 'erp', version: '1' },
        erp: { reachable: true, ok: true },
        erpBaseUrl: 'x',
        ledger: { entries: 103 },
        closesOrdersOnReset: true,
    };
    const CUT_OFF = { status: 504, body: { error: 'Response not yet ready' } };
    const CUT_OFF_ERROR = new ErpIntegrationApiError('detach', 504, 'Response not yet ready');
    const RESULT = {
        reverted: { reverted: 103, failed: [] },
        orders: { cleared: 2, failed: [] },
        closed: { cancelled: 2, commented: 0, alreadyClosed: 0, partsRemoved: 2, failed: [] },
    };
    const STARTED = '2026-10-02T14:33:10Z';

    interface Answer {
        status: number;
        body: unknown;
    }

    /**
     * A fetch that cuts the POST off, answers erp/status with `status`, and answers each
     * read of the run with the next of `reads` (the last one repeats).
     */
    function cutOffThen(status: Answer, reads: Answer[] = []) {
        let read = 0;
        return jest.fn(async (url: string, init: RequestInit) => {
            let answer: Answer = CUT_OFF;
            if (url.startsWith(STATUS)) answer = status;
            else if (init.method === 'GET') answer = reads[Math.min(read++, reads.length - 1)];
            return {
                ok: answer.status >= 200 && answer.status < 300,
                status: answer.status,
                text: async () => JSON.stringify(answer.body),
            };
        }) as unknown as jest.MockedFunction<typeof fetch>;
    }

    /** Every call made to erp/detach, as `<METHOD> <url>`, in order. */
    function detachCalls(fetchImpl: jest.MockedFunction<typeof fetch>): string[] {
        return fetchImpl.mock.calls
            .filter(([url]) => String(url).startsWith(DETACH))
            .map(([url, init]) => `${init?.method} ${String(url)}`);
    }

    /** The run id the POST carried. */
    function sentRun(fetchImpl: jest.MockedFunction<typeof fetch>): string {
        const post = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST');
        return (JSON.parse(String(post?.[1]?.body)) as { run: string }).run;
    }

    const record = (status: string, more: Record<string, unknown> = {}): Answer => ({
        status: 200,
        body: { run: 'echoed', status, startedAt: STARTED, ...more },
    });
    const RECORDS = { status: 200, body: { ...LIVE, detachRuns: true } };
    const NO_RECORD = { status: 404, body: { error: 'No such run' } };
    const noWait = () => jest.fn(async (_ms: number) => undefined);

    it('names each detach with a fresh run id', async () => {
        const fetchImpl = answering(200, RESULT);
        const client = new ErpIntegrationClient(URLS, AUTH, fetchImpl);

        await client.detach({ closeOrders: true });
        await client.detach({ closeOrders: true });

        const runs = fetchImpl.mock.calls.map(
            ([, init]) => (JSON.parse(String(init?.body)) as { run: string }).run
        );
        expect(runs[0]).toMatch(RUN_ID);
        expect(runs[1]).toMatch(RUN_ID);
        expect(runs[0]).not.toBe(runs[1]);
    });

    it("reads the run's record by the same id until it is done, and answers its result", async () => {
        const fetchImpl = cutOffThen(RECORDS, [
            record('running'),
            record('done', { finishedAt: '2026-10-02T14:34:20Z', result: RESULT }),
        ]);
        const wait = noWait();
        const onProgress = jest.fn();

        const report = await new ErpIntegrationClient(URLS, AUTH, fetchImpl, wait).detach(
            { closeOrders: true },
            onProgress
        );

        expect(report).toEqual(RESULT);
        const run = sentRun(fetchImpl);
        expect(run).toMatch(RUN_ID);
        expect(detachCalls(fetchImpl)).toEqual([
            `POST ${DETACH}`,
            `GET ${DETACH}?run=${run}`,
            `GET ${DETACH}?run=${run}`,
        ]);
        // It pauses before each read, and says once that the undo is still going.
        expect(wait).toHaveBeenCalledTimes(2);
        expect(onProgress.mock.calls).toEqual([["Still undoing the ERP's changes in Commerce"]]);
    });

    it("throws the run's own error when the run failed", async () => {
        const fetchImpl = cutOffThen(RECORDS, [
            record('failed', { error: 'Commerce answered 503: unavailable' }),
        ]);

        await expect(
            new ErpIntegrationClient(URLS, AUTH, fetchImpl, noWait()).detach({ closeOrders: true })
        ).rejects.toThrow('ERP detach failed: Commerce answered 503: unavailable');
    });

    it('never reads a run from an integration that does not record them: it would run a detach', async () => {
        const fetchImpl = cutOffThen({ status: 200, body: LIVE }, [record('done')]);
        const wait = noWait();
        const onProgress = jest.fn();

        const detaching = new ErpIntegrationClient(URLS, AUTH, fetchImpl, wait).detach(
            { closeOrders: true },
            onProgress
        );

        await expect(detaching).rejects.toThrow(CUT_OFF_ERROR);
        await expect(detaching).rejects.toBeInstanceOf(ErpIntegrationApiError);
        // The POST and nothing else: a GET to an older erp/detach starts another detach.
        expect(detachCalls(fetchImpl)).toEqual([`POST ${DETACH}`]);
        expect(wait).not.toHaveBeenCalled();
        expect(onProgress).not.toHaveBeenCalled();
    });

    it('treats a status it could not read as an integration that records no runs', async () => {
        const fetchImpl = cutOffThen({ status: 500, body: { error: 'ledger unreadable' } });

        await expect(
            new ErpIntegrationClient(URLS, AUTH, fetchImpl, noWait()).detach()
        ).rejects.toThrow(CUT_OFF_ERROR);
        expect(detachCalls(fetchImpl)).toEqual([`POST ${DETACH}`]);
    });

    it("stops a little past the action's 300-second limit and says the undo is still running", async () => {
        const fetchImpl = cutOffThen(RECORDS, [record('running')]);
        const wait = noWait();

        await expect(
            new ErpIntegrationClient(URLS, AUTH, fetchImpl, wait).detach({ closeOrders: true })
        ).rejects.toThrow(
            "The integration is still undoing the ERP's changes in Commerce. Try again in a few minutes."
        );

        const waited = wait.mock.calls.reduce((total, [ms]) => total + ms, 0);
        expect(waited).toBeGreaterThan(300_000);
        expect(waited).toBeLessThanOrEqual(360_000);
    });

    it('takes a 404 on the first reads as "no record yet"', async () => {
        const fetchImpl = cutOffThen(RECORDS, [
            NO_RECORD,
            NO_RECORD,
            record('done', { result: RESULT }),
        ]);

        const report = await new ErpIntegrationClient(URLS, AUTH, fetchImpl, noWait()).detach();

        expect(report).toEqual(RESULT);
    });

    it('gives up on a run that never gets a record, with the failure it started from', async () => {
        const fetchImpl = cutOffThen(RECORDS, [NO_RECORD]);

        await expect(
            new ErpIntegrationClient(URLS, AUTH, fetchImpl, noWait()).detach()
        ).rejects.toThrow(CUT_OFF_ERROR);

        const reads = detachCalls(fetchImpl).filter((call) => call.startsWith('GET')).length;
        expect(reads).toBeGreaterThan(2);
        expect(reads).toBeLessThan(10);
    });

    it('follows nothing after any other failure', async () => {
        const fetchImpl = answering(500, { error: 'Commerce answered 503: unavailable' });
        const wait = noWait();

        await expect(new ErpIntegrationClient(URLS, AUTH, fetchImpl, wait).detach()).rejects.toThrow(
            new ErpIntegrationApiError('detach', 500, 'Commerce answered 503: unavailable')
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
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
