/** The views Configure offers: asked for only when ACO is on, and the plain field stays when none arrive. */

import { renderHook, waitFor } from '@testing-library/react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useAcoCatalogViews } from '@/features/dashboard/ui/configure/hooks/useAcoCatalogViews';

jest.mock('@/core/ui/utils/WebviewClient', () => ({ webviewClient: { request: jest.fn() } }));

const request = webviewClient.request as jest.Mock;
const VIEWS = [{ id: 'v1', name: 'One', locale: 'en-US' }];

describe('useAcoCatalogViews', () => {
    beforeEach(() => request.mockReset());

    it('asks for nothing while ACO is off', () => {
        const { result } = renderHook(() => useAcoCatalogViews(false));
        expect(request).not.toHaveBeenCalled();
        expect(result.current).toStrictEqual([]);
    });

    it('offers the views the extension answers', async () => {
        request.mockResolvedValue({ success: true, data: { views: VIEWS } });
        const { result } = renderHook(() => useAcoCatalogViews(true));
        await waitFor(() => expect(result.current).toEqual(VIEWS));
        expect(request).toHaveBeenCalledWith('list-aco-catalog-views');
    });

    it('offers none when the request fails, which leaves the plain field', async () => {
        request.mockRejectedValue(new Error('no'));
        const { result } = renderHook(() => useAcoCatalogViews(true));
        await waitFor(() => expect(request).toHaveBeenCalled());
        expect(result.current).toStrictEqual([]);
    });
});
