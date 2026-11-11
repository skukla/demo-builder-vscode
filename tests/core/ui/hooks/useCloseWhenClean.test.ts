/**
 * useCloseWhenClean: the contract every window's self-close leans on. A clean result closes once,
 * a glance after it turned clean; anything else stays; a caller's inline `onClose` does not
 * restart the glance.
 */

import { renderHook } from '@testing-library/react';
import { useCloseWhenClean } from '@/core/ui/hooks/useCloseWhenClean';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

describe('useCloseWhenClean', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('closes a clean result once, a glance after it turned clean', () => {
        const onClose = jest.fn();
        renderHook(() => useCloseWhenClean(true, onClose));

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE - 1);
        expect(onClose).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: leaves a result with something to read open', () => {
        const onClose = jest.fn();
        renderHook(() => useCloseWhenClean(false, onClose));

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('does not close when the result stops being clean before the glance is up', () => {
        const onClose = jest.fn();
        const { rerender } = renderHook(({ clean }) => useCloseWhenClean(clean, onClose), {
            initialProps: { clean: true },
        });

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE - 1);
        rerender({ clean: false });
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('keeps the glance when the caller passes a new onClose every render', () => {
        const calls: number[] = [];
        const { rerender } = renderHook(({ tick }) => useCloseWhenClean(true, () => calls.push(tick)), {
            initialProps: { tick: 0 },
        });

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE - 1);
        rerender({ tick: 1 });
        jest.advanceTimersByTime(1);
        expect(calls).toEqual([1]);
    });

    it('does not close after the window is gone', () => {
        const onClose = jest.fn();
        const { unmount } = renderHook(() => useCloseWhenClean(true, onClose));

        unmount();
        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        expect(onClose).not.toHaveBeenCalled();
    });
});
