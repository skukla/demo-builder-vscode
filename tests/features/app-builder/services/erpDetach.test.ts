/**
 * erpDetach — before the ERP integration is removed, its `erp/detach` undoes
 * what it wrote onto Commerce. The report shape is the integration's
 * `src/lib/detach.js` (`{ reverted: { reverted, failed }, orders: { cleared,
 * failed } }`).
 */

import { detachErpWrites } from '@/features/app-builder/services/erpDetach';

const URLS = {
    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
    'runtime/erp/detach': 'https://ns.adobeioruntime.net/api/v1/web/erp/detach',
};
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

describe('detachErpWrites', () => {
    it('POSTs erp/detach with the signed-in identity and says what it undid', async () => {
        const fetchImpl = answering(200, {
            reverted: { reverted: 2, failed: [] },
            orders: { cleared: 1, failed: [] },
        });
        const d = deps(fetchImpl);

        const result = await detachErpWrites(URLS, d);

        expect(result).toEqual({
            status: 'detached',
            detail: 'Undid 2 company changes and cleared 1 ERP order number in Commerce.',
        });
        expect(fetchImpl).toHaveBeenCalledWith(URLS['runtime/erp/detach'], {
            method: 'POST',
            headers: {
                Authorization: 'Bearer fake-test-pw-not-a-secret',
                'x-gw-ims-org-id': 'ABC@AdobeOrg',
                Accept: 'application/json',
            },
        });
        expect(d.onProgress).toHaveBeenCalledWith("Undoing the ERP's changes in Commerce…");
    });

    it('skips, silently and without signing in, a component that deploys no detach', async () => {
        const fetchImpl = answering(200, {});
        const d = deps(fetchImpl);

        await expect(
            detachErpWrites({ 'runtime/app': 'https://ns.adobeioruntime.net/api/v1/web/app/x' }, d),
        ).resolves.toEqual({ status: 'skipped' });
        expect(d.getAuth).not.toHaveBeenCalled();
        expect(d.onProgress).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fails, saying the changes stay, when the undo was partial', async () => {
        const result = await detachErpWrites(
            URLS,
            deps(
                answering(200, {
                    reverted: { reverted: 1, failed: [{ companyId: '4' }] },
                    orders: { cleared: 0, failed: [{ orderId: '*', error: 'ERP orders answered 503' }] },
                }),
            ),
        );

        expect(result).toEqual({
            status: 'failed',
            detail: 'Undid 1 company change and cleared 0 ERP order numbers in Commerce. 2 changes could not be undone and stay in Commerce.',
        });
    });

    it('fails with the reason when the action errors', async () => {
        const result = await detachErpWrites(URLS, deps(answering(500, { error: 'ledger unreadable' })));

        expect(result.status).toBe('failed');
        expect(result.detail).toMatch(/^The ERP's changes in Commerce were not undone: ERP detach answered 500/);
    });

    it('fails without calling anything when there is no sign-in', async () => {
        const fetchImpl = answering(200, {});

        await expect(detachErpWrites(URLS, deps(fetchImpl, false))).resolves.toEqual({
            status: 'failed',
            detail: "Could not sign in to undo the ERP's changes in Commerce; they stay there.",
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
