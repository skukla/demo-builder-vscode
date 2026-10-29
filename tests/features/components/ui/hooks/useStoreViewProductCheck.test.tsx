/**
 * useStoreViewProductCheck — should the store pickers warn that guests will see
 * no products? (EDS-46)
 *
 * Asserted: it asks only once an endpoint and all three codes are set; it asks
 * with exactly those values; it warns only on `none` / `no-index`; it says
 * nothing while asking or when the check cannot answer; and it asks once per
 * endpoint + codes, so flipping the pickers back does not ask again.
 *
 * The answers are cached for the webview's lifetime (module scope), so every
 * test below uses codes no other test uses.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { useStoreViewProductCheck } from '@/features/components/ui/hooks/useStoreViewProductCheck';
import type { CheckStoreViewProductsResponse } from '@/types/webviewRequests';
import type { StoreViewProducts } from '@/types/commerceStore';

const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/tenant/graphql';

function answer(verdict: StoreViewProducts): CheckStoreViewProductsResponse {
    return { success: true, data: { verdict } };
}

interface Codes {
    endpoint?: string;
    website: string;
    store: string;
    view: string;
}

function renderCheck(initial: Codes) {
    return renderHook(
        ({ endpoint, website, store, view }: Codes) =>
            useStoreViewProductCheck(endpoint, website, store, view),
        { initialProps: initial },
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
});

describe('useStoreViewProductCheck', () => {
    it('asks nothing until the endpoint and all three codes are set', () => {
        const { rerender, result } = renderCheck({ endpoint: ENDPOINT, website: 'w1', store: 's1', view: '' });
        rerender({ endpoint: undefined, website: 'w1', store: 's1', view: 'v1' });

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current).toBe(false);
    });

    it('asks once, with the endpoint and the three codes, for the ACCS backend', async () => {
        mockRequest.mockResolvedValue(answer('found'));

        const { rerender } = renderCheck({ endpoint: ENDPOINT, website: 'w2', store: 's2', view: 'v2' });
        await act(async () => {});
        rerender({ endpoint: ENDPOINT, website: 'w2', store: 's2', view: 'v2' });
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('check-store-view-products', {
            backendType: 'accs',
            endpoint: ENDPOINT,
            websiteCode: 'w2',
            storeCode: 's2',
            storeViewCode: 'v2',
        });
    });

    it.each<[StoreViewProducts, boolean]>([
        ['none', true],
        ['no-index', true],
        ['found', false],
        ['unknown', false],
    ])("on '%s' warns: %s", async (verdict, warns) => {
        mockRequest.mockResolvedValue(answer(verdict));

        const { result } = renderCheck({ endpoint: ENDPOINT, website: `w-${verdict}`, store: 's3', view: 'v3' });
        await act(async () => {});

        expect(result.current).toBe(warns);
    });

    it('says nothing while the check is still running', () => {
        mockRequest.mockReturnValue(new Promise(() => {}));

        const { result } = renderCheck({ endpoint: ENDPOINT, website: 'w4', store: 's4', view: 'v4' });

        expect(result.current).toBe(false);
    });

    it('says nothing when the request itself fails', async () => {
        mockRequest.mockRejectedValue(new Error('Request timeout'));

        const { result } = renderCheck({ endpoint: ENDPOINT, website: 'w5', store: 's5', view: 'v5' });
        await act(async () => {});

        expect(result.current).toBe(false);
    });

    it('does not ask again when the pickers flip back to a store view it already checked', async () => {
        mockRequest.mockImplementation(async (_type: string, payload: { storeViewCode: string }) =>
            answer(payload.storeViewCode === 'empty6' ? 'none' : 'found'),
        );

        const { rerender, result } = renderCheck({ endpoint: ENDPOINT, website: 'w6', store: 's6', view: 'empty6' });
        await act(async () => {});
        expect(result.current).toBe(true);

        rerender({ endpoint: ENDPOINT, website: 'w6', store: 's6', view: 'full6' });
        await act(async () => {});
        expect(result.current).toBe(false);

        rerender({ endpoint: ENDPOINT, website: 'w6', store: 's6', view: 'empty6' });
        expect(result.current).toBe(true);
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('a row remounted mid-check shows the answer when it lands, without asking twice', async () => {
        let land: (value: CheckStoreViewProductsResponse) => void = () => {};
        mockRequest.mockReturnValue(
            new Promise<CheckStoreViewProductsResponse>((resolve) => {
                land = resolve;
            }),
        );
        const codes = { endpoint: ENDPOINT, website: 'w8', store: 's8', view: 'v8' };

        renderCheck(codes).unmount();
        const { result } = renderCheck(codes);
        await act(async () => land(answer('none')));

        expect(result.current).toBe(true);
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('asks again for the same codes on a different endpoint', async () => {
        mockRequest.mockResolvedValue(answer('found'));

        const { rerender } = renderCheck({ endpoint: ENDPOINT, website: 'w7', store: 's7', view: 'v7' });
        await act(async () => {});
        rerender({ endpoint: `${ENDPOINT}-other`, website: 'w7', store: 's7', view: 'v7' });
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(2);
    });
});
