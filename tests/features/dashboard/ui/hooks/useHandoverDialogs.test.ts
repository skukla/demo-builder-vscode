/**
 * Export and Save as demo package: two dialogs, one hand-over between them.
 */

import { act, renderHook } from '@testing-library/react';
import { useHandoverDialogs } from '@/features/dashboard/ui/hooks/useHandoverDialogs';

describe('useHandoverDialogs', () => {
    it('opens and closes each dialog, and hands over from Export to Save as demo package', () => {
        const { result } = renderHook(() => useHandoverDialogs(true));
        expect(result.current.exportOpen).toBe(false);
        expect(result.current.demoPackageOpen).toBe(false);

        act(() => result.current.openExport());
        expect(result.current.exportOpen).toBe(true);
        act(() => result.current.saveDemoPackageFromExport());
        expect(result.current.exportOpen).toBe(false);
        expect(result.current.demoPackageOpen).toBe(true);
        act(() => result.current.closeDemoPackage());
        expect(result.current.demoPackageOpen).toBe(false);

        act(() => result.current.openDemoPackage?.());
        expect(result.current.demoPackageOpen).toBe(true);
    });

    it('offers no Save as demo package opener for a headless project', () => {
        const { result } = renderHook(() => useHandoverDialogs(false));
        expect(result.current.openDemoPackage).toBeUndefined();
        act(() => result.current.openExport());
        expect(result.current.exportOpen).toBe(true);
    });
});
