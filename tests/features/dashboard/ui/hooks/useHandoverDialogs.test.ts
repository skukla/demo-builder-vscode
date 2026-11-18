/**
 * The Share row's dialogs: Share Demo (one dialog since 2026-10-22, for every project kind) and
 * Save as Package (EDS-72, Edge Delivery projects), each with its own open state.
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

    it('opens and closes Save as Package on its own, leaving Share closed', () => {
        const { result } = renderHook(() => useHandoverDialogs());
        expect(result.current.savePackageOpen).toBe(false);

        act(() => result.current.openSavePackage());
        expect(result.current.savePackageOpen).toBe(true);
        expect(result.current.shareOpen).toBe(false);
        act(() => result.current.closeSavePackage());
        expect(result.current.savePackageOpen).toBe(false);
    });

    it('keeps its openers stable across renders, so a tile prop does not change every render', () => {
        const { result, rerender } = renderHook(() => useHandoverDialogs());
        const { openShare, closeShare, openSavePackage, closeSavePackage } = result.current;
        rerender();
        expect(result.current.openShare).toBe(openShare);
        expect(result.current.closeShare).toBe(closeShare);
        expect(result.current.openSavePackage).toBe(openSavePackage);
        expect(result.current.closeSavePackage).toBe(closeSavePackage);
    });
});
