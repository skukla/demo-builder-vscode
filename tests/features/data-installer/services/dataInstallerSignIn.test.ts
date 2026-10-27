/**
 * The sign-in every Data Installer request carries: the IMS bearer and, when the SC's
 * org is known, `x-gw-ims-org-id`.
 *
 * Measured 2026-10-27 against the service's Stage deployment, which has the gateway
 * check (`require-adobe-auth: true`, DEMOSYS-1695): find-datapacks with the bearer
 * alone answered 401 "missing x-gw-ims-org-id header"; the same call with the org
 * header answered 200 with 42 datapacks.
 */

import { DataInstallerExportClient } from '@/features/data-installer/services/dataInstallerExportClient';
import { signInHeaders } from '@/features/data-installer/services/dataInstallerSignIn';
import { DataInstallerTransport } from '@/features/data-installer/services/dataInstallerTransport';
import { DataInstallerWriteClient } from '@/features/data-installer/services/dataInstallerWriteClient';

const ORG = '8EBB33FE5E43BA110A495EF8@AdobeOrg';
const BASE = 'https://example.adobeioruntime.net/api/v1/web/data-installer-api';
const getToken = async (): Promise<string> => 'ims-token';

/** A fetch that answers every request with `body`, and records the headers sent. */
function okFetch(body: unknown): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    });
}

const headersOf = (f: jest.Mock): Record<string, string> => f.mock.calls[0][1].headers as Record<string, string>;

describe('signInHeaders', () => {
    it('sends the bearer and the org', async () => {
        await expect(signInHeaders({ getToken, orgCode: ORG })).resolves.toEqual({
            Authorization: 'Bearer ims-token',
            'x-gw-ims-org-id': ORG,
        });
    });

    it('sends the bearer alone when the org is not known', async () => {
        await expect(signInHeaders({ getToken })).resolves.toEqual({ Authorization: 'Bearer ims-token' });
    });
});

describe('every client sends the org', () => {
    it('the read transport', async () => {
        const f = okFetch({ datapacks: [] });
        await new DataInstallerTransport({ baseUrl: BASE, getToken, orgCode: ORG, fetchImpl: f as unknown as typeof fetch }).request(
            'find-datapacks',
        );
        expect(headersOf(f)['x-gw-ims-org-id']).toBe(ORG);
        expect(headersOf(f).Authorization).toBe('Bearer ims-token');
    });

    it('the write client', async () => {
        const f = okFetch({ success: true });
        await new DataInstallerWriteClient({ baseUrl: BASE, getToken, orgCode: ORG, fetchImpl: f as unknown as typeof fetch }).checkCredentials({
            id: { name: 'bodea', version: 'main' },
            commerceInstance: 'x',
            dataTypes: ['categories'],
            credentials: { kind: 'paas', username: 'admin', password: 'fake-test-pw-not-a-secret' },
        });
        expect(headersOf(f)['x-gw-ims-org-id']).toBe(ORG);
    });

    it('the export client', async () => {
        const f = okFetch({ success: true, items: [], pagination: { page: 1, page_size: 1000, total_count: 0, total_pages: 0 } });
        await new DataInstallerExportClient({ baseUrl: BASE, getToken, orgCode: ORG, fetchImpl: f as unknown as typeof fetch })
            .listExportItems(
                {
                    id: { name: 'p', version: 'v1' },
                    commerceInstance: 't',
                    restBaseUrl: 'https://na1-sandbox.api.commerce.adobe.com/t',
                    dataTypes: ['attribute_sets'],
                    credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-secret-not-a-secret' },
                },
                'attribute_sets',
            )
            .catch(() => undefined);
        expect(headersOf(f)['x-gw-ims-org-id']).toBe(ORG);
    });
});
