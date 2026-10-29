/**
 * systemRecordsWipe — before the ERP is removed, its `POST admin/wipe` deletes
 * its records. The route is the ERP's own (`skukla/demo-erp`,
 * `actions/admin/index.js`: `POST admin/wipe` answers `{ wiped }`), and the
 * URL keys are what `aio app get-url` answers: `runtime/<package>/<action>`.
 */

import { deriveActionCallUrl, wipeSystemRecords } from '@/features/app-builder/services/systemRecordsWipe';

const URLS = {
    'runtime/demo-erp/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health',
    'runtime/demo-erp/admin': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/admin',
};
const WIPE = { wipe: { action: 'admin', path: 'wipe' } };
const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

function answering(status: number, body: unknown) {
    return jest.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    })) as unknown as jest.MockedFunction<typeof fetch>;
}

function deps(fetchImpl: typeof fetch, signedIn = true) {
    return { getAuth: jest.fn(async () => (signedIn ? AUTH : undefined)), onProgress: jest.fn(), fetchImpl };
}

describe('deriveActionCallUrl', () => {
    it("appends the path to the declared action's deployed URL", () => {
        expect(deriveActionCallUrl(WIPE.wipe, URLS)).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp/admin/wipe');
    });

    it('answers nothing when that action was not deployed', () => {
        expect(deriveActionCallUrl(WIPE.wipe, { 'runtime/demo-erp/health': URLS['runtime/demo-erp/health'] })).toBeUndefined();
        expect(deriveActionCallUrl(WIPE.wipe, undefined)).toBeUndefined();
    });
});

describe('wipeSystemRecords', () => {
    it('POSTs the wipe with the signed-in identity and says so', async () => {
        const fetchImpl = answering(200, { wiped: { products: 3 } });
        const d = deps(fetchImpl);

        const result = await wipeSystemRecords(WIPE, URLS, 'Nordwind', d);

        expect(result).toEqual({ status: 'wiped' });
        expect(fetchImpl).toHaveBeenCalledWith('https://ns.adobeioruntime.net/api/v1/web/demo-erp/admin/wipe', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer fake-test-pw-not-a-secret',
                'x-gw-ims-org-id': 'ABC@AdobeOrg',
                Accept: 'application/json',
            },
        });
        expect(d.onProgress).toHaveBeenCalledWith("Deleting Nordwind's records");
    });

    it('skips an entry that declares no wipe, or whose action is not deployed, without signing in', async () => {
        const fetchImpl = answering(200, {});
        const d = deps(fetchImpl);

        await expect(wipeSystemRecords({}, URLS, 'Nordwind', d)).resolves.toEqual({ status: 'skipped' });
        await expect(wipeSystemRecords(WIPE, {}, 'Nordwind', d)).resolves.toEqual({ status: 'skipped' });
        expect(d.getAuth).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("fails with the action's own words on an HTTP error", async () => {
        const result = await wipeSystemRecords(WIPE, URLS, 'Nordwind', deps(answering(401, { error: 'unauthorized' })));

        expect(result).toEqual({ status: 'failed', detail: '401: unauthorized' });
    });

    it('fails without calling when nobody is signed in', async () => {
        const fetchImpl = answering(200, {});

        const result = await wipeSystemRecords(WIPE, URLS, 'Nordwind', deps(fetchImpl, false));

        expect(result).toEqual({ status: 'failed', detail: 'could not sign in' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fails, never throws, when the call itself throws', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new Error('getaddrinfo ENOTFOUND');
        }) as unknown as typeof fetch;

        const result = await wipeSystemRecords(WIPE, URLS, 'Nordwind', deps(fetchImpl));

        expect(result).toEqual({ status: 'failed', detail: 'getaddrinfo ENOTFOUND' });
    });
});
