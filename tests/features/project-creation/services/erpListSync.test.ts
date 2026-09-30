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
