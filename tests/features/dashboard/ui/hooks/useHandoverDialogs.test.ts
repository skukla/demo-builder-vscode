/**
 * The Share dialog's open state: one dialog since 2026-10-22 (Export and Save
 * as demo package became Share Demo), for every project kind.
 */

import { act, renderHook } from '@testing-library/react';
import { useHandoverDialogs } from '@/features/dashboard/ui/hooks/useHandoverDialogs';

describe('useHandoverDialogs', () => {
    it('opens and closes the Share dialog', () => {
        const { result } = renderHook(() => useHandoverDialogs());
        expect(result.current.shareOpen).toBe(false);

        act(() => result.current.openShare());
        expect(result.current.shareOpen).toBe(true);
        act(() => result.current.closeShare());
        expect(result.current.shareOpen).toBe(false);
    });

    it('keeps its openers stable across renders, so a tile prop does not change every render', () => {
        const { result, rerender } = renderHook(() => useHandoverDialogs());
        const { openShare, closeShare } = result.current;
        rerender();
        expect(result.current.openShare).toBe(openShare);
        expect(result.current.closeShare).toBe(closeShare);
    });
});
