/**
 * useActivateOnKey Tests
 *
 * The Enter/Space contract for a div-role button, shared by five tiles
 * (IntegrationCard, BrandGallery, ConfigTile, ProjectButton,
 * useProjectSelectHandlers) after an architecture-duplication scan found it
 * written five times — architecture-duplication scan, 2026-07-31.
 *
 * `preventDefault` is the clause that matters: without it Space scrolls the page
 * while activating the tile, which is easy to ship and hard to notice.
 *
 */

import { renderHook } from '@testing-library/react';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';

function keyEvent(key: string, extra: Record<string, unknown> = {}) {
    return { key, preventDefault: jest.fn(), ...extra } as unknown as React.KeyboardEvent;
}

describe('useActivateOnKey', () => {
    it.each(['Enter', ' '])('activates on %s and prevents the default', (key) => {
        const onActivate = jest.fn();
        const { result } = renderHook(() => useActivateOnKey(onActivate));
        const event = keyEvent(key);

        result.current(event);

        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(event.preventDefault).toHaveBeenCalled();
    });

    it.each(['a', 'Escape', 'Tab', 'ArrowDown'])('ignores %s', (key) => {
        const onActivate = jest.fn();
        const { result } = renderHook(() => useActivateOnKey(onActivate));
        const event = keyEvent(key);

        result.current(event);

        expect(onActivate).not.toHaveBeenCalled();
        // An unrelated key must keep its default — do not swallow Tab.
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('passes the EVENT through, so callers can read modifiers', () => {
        const onActivate = jest.fn();
        const { result } = renderHook(() => useActivateOnKey(onActivate));

        result.current(keyEvent('Enter', { shiftKey: true }));

        expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ shiftKey: true }));
    });

    describe('disabled', () => {
        it('ignores activation keys entirely', () => {
            const onActivate = jest.fn();
            const { result } = renderHook(() => useActivateOnKey(onActivate, { disabled: true }));
            const event = keyEvent('Enter');

            result.current(event);

            expect(onActivate).not.toHaveBeenCalled();
            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('activates again once re-enabled', () => {
            const onActivate = jest.fn();
            const { result, rerender } = renderHook(
                ({ disabled }) => useActivateOnKey(onActivate, { disabled }),
                { initialProps: { disabled: true } }
            );

            result.current(keyEvent('Enter'));
            expect(onActivate).not.toHaveBeenCalled();

            rerender({ disabled: false });
            result.current(keyEvent('Enter'));
            expect(onActivate).toHaveBeenCalledTimes(1);
        });
    });
});
