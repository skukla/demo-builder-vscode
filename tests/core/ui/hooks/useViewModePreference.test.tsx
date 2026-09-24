/**
 * useViewModePreference — a list's cards/rows choice in the webview.
 * `choose` switches AND tells the extension; `adopt` switches only, for a view
 * the extension announced (echoing that back would record a choice nobody made).
 */

import { act, renderHook } from '@testing-library/react';
import { useViewModePreference } from '@/core/ui/hooks/useViewModePreference';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: jest.fn() },
}));

const postMessage = webviewClient.postMessage as jest.Mock;

describe('useViewModePreference', () => {
    beforeEach(() => postMessage.mockClear());

    it('starts on the view the init payload named, cards when it named none', () => {
        expect(renderHook(() => useViewModePreference('projects')).result.current.viewMode).toBe('cards');
        expect(renderHook(() => useViewModePreference('projects', 'rows')).result.current.viewMode).toBe('rows');
        expect(renderHook(() => useViewModePreference('projects', undefined)).result.current.viewMode).toBe('cards');
    });

    it('choose switches the view and tells the extension which list chose', () => {
        const { result } = renderHook(() => useViewModePreference('integrations'));

        act(() => result.current.choose('rows'));

        expect(result.current.viewMode).toBe('rows');
        expect(postMessage).toHaveBeenCalledWith('setViewModeOverride', {
            list: 'integrations',
            viewMode: 'rows',
        });
    });

    it('adopt switches the view without telling anyone', () => {
        const { result } = renderHook(() => useViewModePreference('projects'));

        act(() => result.current.adopt('rows'));

        expect(result.current.viewMode).toBe('rows');
        expect(postMessage).not.toHaveBeenCalled();
    });
});
