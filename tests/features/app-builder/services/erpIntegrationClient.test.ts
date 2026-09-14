/**
 * erpIntegrationClient — the integration's erp/status and erp/reset, called with
 * the signed-in IMS identity, addressed by the URLs the deploy answered.
 */

import {
    ErpIntegrationApiError,
    ErpIntegrationClient,
    deriveErpActionUrl,
} from '@/features/app-builder/services/erpIntegrationClient';

const URLS = {
    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
    'runtime/erp/reset': 'https://ns.adobeioruntime.net/api/v1/web/erp/reset',
    'runtime/erp/mirror': 'https://ns.adobeioruntime.net/api/v1/web/erp/mirror',
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
