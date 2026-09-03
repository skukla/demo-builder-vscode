/**
 * useLiveDaLiveUrl Hook Tests
 *
 * The live DA.live authoring-URL state extracted from ProjectDashboardScreen
 * (decompose pass after ADR-011 D3): seeded from the open-time prop, updated
 * by the `authoringExperienceUpdate` message a Configure save pushes, and only
 * ever moved to a new DEFINED value (never cleared).
 *
 * @jest-environment jsdom
 */

import '../../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';

import { useLiveDaLiveUrl } from '@/features/dashboard/ui/hooks/useLiveDaLiveUrl';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

const mockOnMessage = webviewClient.onMessage as jest.Mock;

describe('useLiveDaLiveUrl', () => {
    let messageHandler: ((data: unknown) => void) | undefined;
    let unsubscribe: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandler = undefined;
        unsubscribe = jest.fn();
        mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
            if (type === 'authoringExperienceUpdate') {
                messageHandler = handler;
            }
            return unsubscribe;
        });
    });

    it('returns the seed value from the open-time prop', () => {
        const { result } = renderHook(() => useLiveDaLiveUrl('https://da.live/#/org/site'));

        expect(result.current).toBe('https://da.live/#/org/site');
    });

    it('subscribes to authoringExperienceUpdate and applies a pushed URL', () => {
        const { result } = renderHook(() => useLiveDaLiveUrl('https://da.live/#/org/site'));

        act(() => {
            messageHandler?.({ edsDaLiveUrl: 'https://da.live/#/org/other' });
        });
        expect(result.current).toBe('https://da.live/#/org/other');
    });

    it('ignores a payload without edsDaLiveUrl (never clears the value)', () => {
        const { result } = renderHook(() => useLiveDaLiveUrl('https://da.live/#/org/site'));

        act(() => {
            messageHandler?.({});
        });
        expect(result.current).toBe('https://da.live/#/org/site');
    });

    it('unsubscribes on unmount', () => {
        const { unmount } = renderHook(() => useLiveDaLiveUrl(undefined));

        unmount();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
