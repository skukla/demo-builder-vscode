/**
 * useLiveDestination Hook Tests
 *
 * The Integrations header's "project · workspace" crumb. Seeded from the init
 * payload — which is delivered ONCE — so before this hook existed a destination
 * change left the header naming the OLD target for the rest of the session while
 * every card deployed to the new one (reported live 2026-08-07).
 *
 * @jest-environment jsdom
 */

import '../../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';

import { useLiveDestination } from '@/features/dashboard/ui/hooks/useLiveDestination';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

const mockOnMessage = webviewClient.onMessage as jest.Mock;

const SEED = { projectTitle: 'Old Project', workspaceTitle: 'Stage' };
const MOVED = { projectTitle: 'New Project', workspaceTitle: 'Production' };

describe('useLiveDestination', () => {
    let messageHandler: ((data: unknown) => void) | undefined;
    let unsubscribe: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandler = undefined;
        unsubscribe = jest.fn();
        mockOnMessage.mockImplementation((type: string, handler: (data: unknown) => void) => {
            if (type === 'projectDestinationUpdate') {
                messageHandler = handler;
            }
            return unsubscribe;
        });
    });

    it('starts at the seeded destination', () => {
        const { result } = renderHook(() => useLiveDestination(SEED));

        expect(result.current).toEqual(SEED);
    });

    it('follows a push — this is the whole point of the hook', () => {
        const { result } = renderHook(() => useLiveDestination(SEED));

        act(() => messageHandler?.({ destination: MOVED }));

        expect(result.current).toEqual(MOVED);
    });

    it('re-seeds when the screen hands down a different destination', () => {
        const { result, rerender } = renderHook(({ seed }) => useLiveDestination(seed), {
            initialProps: { seed: SEED },
        });

        rerender({ seed: MOVED });

        expect(result.current).toEqual(MOVED);
    });

    it('ignores a malformed push rather than blanking the header', () => {
        const { result } = renderHook(() => useLiveDestination(SEED));

        act(() => messageHandler?.({}));
        act(() => messageHandler?.(undefined));

        expect(result.current).toEqual(SEED);
    });

    it('unsubscribes on unmount', () => {
        const { unmount } = renderHook(() => useLiveDestination(SEED));

        unmount();

        expect(unsubscribe).toHaveBeenCalled();
    });
});
