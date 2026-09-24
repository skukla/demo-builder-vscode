/**
 * recordSync — once the ERP integration is installed, its `POST
 * erp/mirror?background=true` fills the ERP from Commerce. The route is the
 * integration's own (`skukla/commerce-erp-integration`,
 * `actions/erp/mirror/index.js`: `?background=true` answers 202 `{ started }`),
 * and the URL keys are what `aio app get-url` answers.
 */

import { startRecordSync } from '@/features/app-builder/services/recordSync';

const URLS = {
    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
    'runtime/erp/erp': 'https://ns.adobeioruntime.net/api/v1/web/erp/erp',
};
const SYNC = { sync: { action: 'erp', path: 'mirror?background=true' } };
const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

function answering(status: number, body: unknown) {
    return jest.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    })) as unknown as jest.MockedFunction<typeof fetch>;
}

function deps(fetchImpl: typeof fetch, signedIn = true) {
    return { getAuth: jest.fn(async () => (signedIn ? AUTH : undefined)), fetchImpl };
}

describe('startRecordSync', () => {
    it('POSTs the background mirror with the signed-in identity and reports it started', async () => {
        const fetchImpl = answering(202, { started: true, activationId: 'act-1' });

        const result = await startRecordSync(SYNC, URLS, deps(fetchImpl));

        expect(result).toEqual({ status: 'started' });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://ns.adobeioruntime.net/api/v1/web/erp/erp/mirror?background=true',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer fake-test-pw-not-a-secret',
                    'x-gw-ims-org-id': 'ABC@AdobeOrg',
                    Accept: 'application/json',
                },
            },
        );
    });

    it('skips an entry that declares no sync, or whose action is not deployed, without signing in', async () => {
        const fetchImpl = answering(202, {});
        const d = deps(fetchImpl);

        await expect(startRecordSync({}, URLS, d)).resolves.toEqual({ status: 'skipped' });
        await expect(
            startRecordSync(SYNC, { 'runtime/erp/status': URLS['runtime/erp/status'] }, d),
        ).resolves.toEqual({ status: 'skipped' });
        expect(d.getAuth).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("fails with the action's own words on an HTTP error", async () => {
        const result = await startRecordSync(
            SYNC,
            URLS,
            deps(answering(500, { error: 'Commerce refused the credential (401)' })),
        );

        expect(result).toEqual({ status: 'failed', detail: '500: Commerce refused the credential (401)' });
    });

    it('fails without calling when nobody is signed in', async () => {
        const fetchImpl = answering(202, {});

        const result = await startRecordSync(SYNC, URLS, deps(fetchImpl, false));

        expect(result).toEqual({ status: 'failed', detail: 'could not sign in' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fails, never throws, when the call itself throws', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new Error('getaddrinfo ENOTFOUND');
        }) as unknown as typeof fetch;

        const result = await startRecordSync(SYNC, URLS, deps(fetchImpl));

        expect(result).toEqual({ status: 'failed', detail: 'getaddrinfo ENOTFOUND' });
    });
});
