/**
 * erpMappingAfterFill — the mapping step wired for one ERP (AB-26y): the ERP's own
 * `GET settings/setup`, the integration's `GET erp/erps` and `PATCH erp/erps`, Commerce's
 * websites. Driven through the REAL integration client over a fake fetch, so the assertions
 * are on the calls that leave: which URL, which method, which body.
 */

import type { CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { mapAfterFill } from '@/features/project-creation/services/erpMappingAfterFill';

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };
const ERPS_URL = 'https://ns.adobeioruntime.net/api/v1/web/erp/erps';
const SETTINGS_URL = 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/settings';
const INTEGRATION_URLS = { 'runtime/erp/erps': ERPS_URL };
const ERP_URLS = { 'runtime/demo-erp/settings': SETTINGS_URL };

interface Sent {
    url: string;
    method: string;
    body?: unknown;
}

interface World {
    /** What the ERP's `settings/setup` answers. */
    setup?: unknown;
    setupStatus?: number;
    /** The integration's list entries. */
    entries?: unknown[];
    /** The status `PATCH erp/erps` answers; 200 when absent. */
    patchStatus?: number;
}

function answer(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

function worldOf(world: World): { fetchImpl: typeof fetch; sent: Sent[] } {
    const sent: Sent[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        sent.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
        if (url === `${SETTINGS_URL}/setup`) {
            return answer(world.setupStatus ?? 200, world.setup ?? {});
        }
        if (url === ERPS_URL && method === 'GET') {
            return answer(200, { entries: world.entries ?? [], stored: true });
        }
        if (url === ERPS_URL && method === 'PATCH') {
            const status = world.patchStatus ?? 200;
            return answer(status, status === 200 ? { entry: {} } : { error: 'store unavailable' });
        }
        return answer(404, { error: `unexpected ${method} ${url}` });
    }) as typeof fetch;
    return { fetchImpl, sent };
}

const commerceGet: CommerceGet = async (path) =>
    path === 'store/websites'
        ? [
              { id: 0, code: 'admin', name: 'Admin' },
              { id: 1, code: 'base', name: 'Main Website' },
          ]
        : null;

const SETUP = {
    salesOrganizations: [
        { code: '1000', name: 'Online US', currency: 'USD', websiteCode: 'base' },
    ],
};
const ENTRY = {
    id: 'northwind',
    name: 'Northwind ERP',
    adapter: 'demo-erp',
    connection: { baseUrl: null },
};

function run(world: World, integrationUrls: Record<string, string> = INTEGRATION_URLS) {
    const { fetchImpl, sent } = worldOf(world);
    const steps: string[] = [];
    const done = mapAfterFill({
        erp: { componentId: 'demo-erp', listId: 'northwind', deployedUrls: ERP_URLS },
        client: new ErpIntegrationClient(integrationUrls, AUTH, fetchImpl),
        get: commerceGet,
        auth: AUTH,
        fetchImpl,
        onProgress: (step) => steps.push(step),
    });
    return { done, sent, steps };
}

describe('mapAfterFill', () => {
    it("reads the ERP's sales organizations and saves the unset website on the ERP's entry", async () => {
        const { done, sent, steps } = run({ setup: SETUP, entries: [ENTRY] });

        const result = await done;

        expect(sent.filter((call) => call.method === 'PATCH')).toStrictEqual([
            {
                url: ERPS_URL,
                method: 'PATCH',
                body: {
                    id: 'northwind',
                    website: 'base',
                    values: { structure_sales_org: '1000', structure_sales_org_name: 'Online US' },
                },
            },
        ]);
        expect(sent[0]).toStrictEqual({ url: `${SETTINGS_URL}/setup`, method: 'GET' });
        expect(result).toStrictEqual({
            mapping: {
                filled: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }],
                kept: [],
            },
        });
        expect(steps).toContain(
            "Filled the integration's mapping from the ERP: website base sells under sales organization 1000.",
        );
    });

    it('writes nothing where the entry already maps the website, and reports it kept', async () => {
        const entry = {
            ...ENTRY,
            settings: { websites: { base: { structure_sales_org: '3000' } } },
        };
        const { done, sent } = run({ setup: SETUP, entries: [entry] });

        const result = await done;

        expect(sent.filter((call) => call.method === 'PATCH')).toStrictEqual([]);
        expect(result.mapping?.kept).toStrictEqual([
            { erp: 'demo-erp', website: 'base', salesOrg: '3000', erpSalesOrg: '1000' },
        ]);
        expect(result.note).toBeUndefined();
    });

    it("reads only this ERP's entry when the integration lists two", async () => {
        const other = {
            ...ENTRY,
            id: 'brand-b',
            settings: { websites: { base: { structure_sales_org: '9000' } } },
        };
        const { done, sent } = run({ setup: SETUP, entries: [other, ENTRY] });

        const result = await done;

        expect(result.mapping?.filled).toStrictEqual([
            { erp: 'demo-erp', website: 'base', salesOrg: '1000' },
        ]);
        expect(sent.filter((call) => call.method === 'PATCH').map((call) => call.body)).toStrictEqual(
            [expect.objectContaining({ id: 'northwind' })],
        );
    });

    it('skips an integration deployed before it kept per-ERP settings: a step, no call, no note', async () => {
        const { done, sent, steps } = run({ setup: SETUP, entries: [ENTRY] }, {});

        expect(await done).toStrictEqual({});
        expect(sent).toStrictEqual([]);
        expect(steps).toStrictEqual([
            'The integration keeps no per-ERP settings yet; update it to have its mapping filled',
        ]);
    });

    it('answers a note, never a throw, when the write fails', async () => {
        const { done } = run({ setup: SETUP, entries: [ENTRY], patchStatus: 500 });

        const result = await done;

        expect(result.mapping?.filled).toStrictEqual([]);
        expect(result.mapping?.failed).toHaveLength(1);
        expect(result.note).toBe(
            'Demo data loaded; the mapping for website base was not saved: ERP erps answered 500: store unavailable. Load demo data again to retry.',
        );
    });

    it("answers a note when the ERP's setup cannot be read", async () => {
        const { done, sent } = run({ setupStatus: 500, setup: { error: 'down' }, entries: [ENTRY] });

        const result = await done;

        expect(result).toStrictEqual({
            note: "Demo data loaded; the integration's mapping was not filled: the ERP's setup answered 500: down. Load demo data again to retry.",
        });
        expect(sent.filter((call) => call.method === 'PATCH')).toStrictEqual([]);
    });

    it('fills nothing for an ERP that answers no sales organizations', async () => {
        const { done, sent } = run({ setup: {}, entries: [ENTRY] });

        expect(await done).toStrictEqual({ mapping: { filled: [], kept: [] } });
        expect(sent).toHaveLength(1);
    });
});
