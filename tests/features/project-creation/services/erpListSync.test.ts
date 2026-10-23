/**
 * erpListSync — telling the ERP integration its ERPs (`PUT erp/erps`), each added ERP with its
 * own credential (AB-16a).
 *
 * Measured on Bodea, 2026-09-28: Contoso ERP (`demo-erp-2`) is in its own workspace and
 * refused the integration 401 "Technical account mismatch". These drive the REAL integration
 * client over a fake fetch and assert the body it sent: the added ERP carries its workspace's
 * credential, the first ERP none. They also pin that the secret never leaves the call: not in
 * the outcome, a warning or a log.
 */

import type { ErpAuth } from '@/features/app-builder/services/erpList';
import { syncErpList, unlistErp } from '@/features/project-creation/services/erpListSync';
import type { AppBuilderComponentState } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const SECRET = 'fake-test-pw-not-a-secret';
const AUTH = { accessToken: 'fake-token', imsOrgId: 'FAKE@AdobeOrg' };
const CONTOSO_WS = { id: 'ws-contoso', name: 'ContosoERP' };
const CONTOSO_AUTH: ErpAuth = { clientId: 'fake-contoso-client', clientSecret: SECRET, orgId: 'FAKE@AdobeOrg', scopes: ['AdobeID'] };
const ERPS_URL = 'https://ns.adobeioruntime.net/api/v1/web/erp/erps';
const SOURCE = { owner: 'skukla', repo: 'x' };

const web = (pkg: string) => ({ [`runtime/${pkg}/health`]: `https://ns.adobeioruntime.net/api/v1/web/${pkg}/health` });

function project(contoso: Partial<AppBuilderComponentState> = {}) {
    return createMockProject({
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                systems: ['demo-erp', 'demo-erp-2'],
                source: SOURCE,
                deployedUrls: { 'erp/erps': ERPS_URL },
            },
            'demo-erp': { kind: 'system', status: 'deployed', name: 'Acme ERP', source: SOURCE, deployedUrls: web('demo-erp') },
            'demo-erp-2': {
                kind: 'system',
                status: 'deployed',
                name: 'Contoso ERP',
                catalogId: 'demo-erp',
                source: SOURCE,
                deployedUrls: web('demo-erp-2'),
                workspace: CONTOSO_WS,
                ...contoso,
            },
        },
    });
}

/** A fetch that answers the list GET with an empty list and every PUT with ok. */
function fakeFetch() {
    return jest.fn(async (_url: string, init?: RequestInit) => {
        const text = init?.method === 'GET' ? JSON.stringify({ entries: [] }) : '{}';
        return { ok: true, status: 200, text: async () => text } as Response;
    });
}

/** The entries the PUT carried. */
function sentEntries(fetchImpl: ReturnType<typeof fakeFetch>) {
    const put = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[0]).toBe(ERPS_URL);
    return (JSON.parse(String(put?.[1]?.body)) as { entries: Array<{ id: string; connection: Record<string, unknown> }> }).entries;
}

describe('syncErpList — each added ERP with its own credential', () => {
    it("sends the added ERP's credential, read from ITS workspace, and none for the first ERP", async () => {
        const fetchImpl = fakeFetch();
        const readCredential = jest.fn(async () => CONTOSO_AUTH);

        const outcome = await syncErpList(project(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch, readCredential });

        expect(readCredential).toHaveBeenCalledTimes(1);
        expect(readCredential).toHaveBeenCalledWith(CONTOSO_WS);
        const [first, contoso] = sentEntries(fetchImpl);
        expect(first.id).toBe('acme');
        expect(first.connection).not.toHaveProperty('auth');
        expect(contoso.id).toBe('contoso');
        expect(contoso.connection.auth).toStrictEqual(CONTOSO_AUTH);
        expect(outcome).toStrictEqual({ status: 'registered', ids: ['acme', 'contoso'], warnings: [] });
    });

    it('still sends the list when the credential cannot be read, without auth, and says why', async () => {
        const fetchImpl = fakeFetch();
        const readCredential = jest.fn(async () => {
            throw new Error('the ContosoERP workspace has no OAuth server-to-server credential');
        });

        const outcome = await syncErpList(project(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch, readCredential });

        expect(sentEntries(fetchImpl)[1].connection).not.toHaveProperty('auth');
        expect(outcome).toStrictEqual({
            status: 'registered',
            ids: ['acme', 'contoso'],
            warnings: [
                "Contoso ERP's credential could not be read; the integration cannot reach it: " +
                    'the ContosoERP workspace has no OAuth server-to-server credential.',
            ],
        });
    });

    it('warns, and reads nothing, for an added ERP that records no workspace of its own', async () => {
        const fetchImpl = fakeFetch();
        const readCredential = jest.fn(async () => CONTOSO_AUTH);

        const outcome = await syncErpList(project({ workspace: undefined }), 'erp-integration', AUTH, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            readCredential,
        });

        expect(readCredential).not.toHaveBeenCalled();
        expect(outcome.status === 'registered' && outcome.warnings).toStrictEqual([
            "Contoso ERP's credential could not be read; the integration cannot reach it: it records no workspace of its own.",
        ]);
    });

    it('with no reader (a removal), sends no auth, so the integration keeps what it holds', async () => {
        const fetchImpl = fakeFetch();

        await syncErpList(project(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch, leaving: 'demo-erp' });

        const entries = sentEntries(fetchImpl);
        expect(entries.map((entry) => entry.id)).toStrictEqual(['contoso']);
        expect(entries[0].connection).not.toHaveProperty('auth');
    });

    it('never answers or logs the secret', async () => {
        const fetchImpl = fakeFetch();
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        const outcome = await syncErpList(project(), 'erp-integration', AUTH, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            readCredential: async () => CONTOSO_AUTH,
        });

        expect(JSON.stringify(outcome)).not.toContain(SECRET);
        expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);
        log.mockRestore();
    });

    it('unlistErp sends the list without the ERP leaving, and with no auth', async () => {
        const fetchImpl = fakeFetch();
        const spy = jest.spyOn(global, 'fetch').mockImplementation(fetchImpl as unknown as typeof fetch);

        await expect(unlistErp(project(), 'erp-integration', 'demo-erp-2', AUTH)).resolves.toBeUndefined();

        const entries = sentEntries(fetchImpl);
        expect(entries.map((entry) => entry.id)).toStrictEqual(['acme']);
        expect(entries[0].connection).not.toHaveProperty('auth');
        spy.mockRestore();
    });
});

/**
 * Justrite, 2026-10-22: one ERP on "all" (the rule a lone ERP holds), a second added by
 * attribute. The integration reads an entry with no rule of its own, once there are several,
 * as `erp_owner=<its id>`, so the first ERP silently owned nothing and the add's pass marked its
 * products discontinued. The PUT that makes the list grow now carries the rule the lone ERP was
 * holding, on its own entry.
 */
describe('syncErpList — growing from one ERP keeps the first ERP on its rule', () => {
    const SETTINGS_URL = 'https://ns.adobeioruntime.net/api/v1/web/erp/settings';
    const LONE = { id: 'acme', name: 'Acme ERP', adapter: 'demo-erp', connection: { baseUrl: 'https://acme.example' } };

    function growingProject() {
        const grown = project();
        const integration = grown.appBuilderComponents?.['erp-integration'];
        if (integration) integration.deployedUrls = { 'erp/erps': ERPS_URL, 'erp/settings': SETTINGS_URL };
        return grown;
    }

    /** The list GET answers `listed`; the settings GET answers `resolved`; a PUT is ok. */
    function fetchWith(listed: unknown[], resolved: Record<string, unknown> = {}) {
        return jest.fn(async (url: string, init?: RequestInit) => {
            let text = '{}';
            if (init?.method === 'GET' && url.startsWith(ERPS_URL)) text = JSON.stringify({ entries: listed });
            if (init?.method === 'GET' && url.startsWith(SETTINGS_URL)) text = JSON.stringify({ default: resolved, websites: {} });
            return { ok: true, status: 200, text: async () => text } as Response;
        });
    }

    function settingsSent(fetchImpl: ReturnType<typeof fetchWith>) {
        const put = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PUT');
        const { entries } = JSON.parse(String(put?.[1]?.body)) as { entries: Array<{ id: string; settings?: Record<string, string> }> };
        return Object.fromEntries(entries.map((entry) => [entry.id, entry.settings]));
    }

    it('pins "all" on the lone ERP that never saved a rule, and leaves the new ERP to its own save', async () => {
        const fetchImpl = fetchWith([LONE]);

        await syncErpList(growingProject(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch });

        expect(settingsSent(fetchImpl)).toStrictEqual({ acme: { structure_owns: 'all' }, contoso: undefined });
        const read = fetchImpl.mock.calls.find(([url]) => url.startsWith(SETTINGS_URL));
        expect(read?.[0]).toContain('erp=acme');
    });

    it("pins the integration's shared rule when the lone ERP was holding one", async () => {
        const fetchImpl = fetchWith([LONE], { structure_owns: 'attribute', structure_owns_attribute: 'brand=acme' });

        await syncErpList(growingProject(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch });

        expect(settingsSent(fetchImpl).acme).toStrictEqual({ structure_owns: 'attribute', structure_owns_attribute: 'brand=acme' });
    });

    it('keeps the rule the lone ERP saved itself, with its other settings, and reads nothing', async () => {
        const own = { structure_owns: 'websites', structure_owns_websites: 'base', structure_order_prefix: 'ACM' };
        const fetchImpl = fetchWith([{ ...LONE, settings: own }]);

        await syncErpList(growingProject(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch });

        expect(settingsSent(fetchImpl).acme).toStrictEqual(own);
        expect(fetchImpl.mock.calls.some(([url]) => url.startsWith(SETTINGS_URL))).toBe(false);
    });

    it('adds the rule beside settings the lone ERP already has, such as its order prefix', async () => {
        const fetchImpl = fetchWith([{ ...LONE, settings: { structure_order_prefix: 'ACM' } }]);

        await syncErpList(growingProject(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch });

        expect(settingsSent(fetchImpl).acme).toStrictEqual({ structure_order_prefix: 'ACM', structure_owns: 'all' });
    });

    it('pins nothing when the list already had several ERPs: each already reads its own rule', async () => {
        const fetchImpl = fetchWith([LONE, { ...LONE, id: 'contoso', name: 'Contoso ERP' }]);

        await syncErpList(growingProject(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch });

        expect(settingsSent(fetchImpl).acme).toBeUndefined();
        expect(fetchImpl.mock.calls.some(([url]) => url.startsWith(SETTINGS_URL))).toBe(false);
    });

    it('does not send the list when the rule in force could not be read', async () => {
        const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
            if (url.startsWith(SETTINGS_URL)) return { ok: false, status: 500, text: async () => '{"error":"down"}' } as Response;
            const text = init?.method === 'GET' ? JSON.stringify({ entries: [LONE] }) : '{}';
            return { ok: true, status: 200, text: async () => text } as Response;
        });

        const outcome = await syncErpList(growingProject(), 'erp-integration', AUTH, { fetchImpl: fetchImpl as unknown as typeof fetch });

        expect(outcome.status).toBe('failed');
        expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    });
});
