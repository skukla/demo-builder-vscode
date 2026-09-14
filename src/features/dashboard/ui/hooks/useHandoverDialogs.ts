/**
 * The two hand-over dialogs' open state (owner, 2026-09-13): Export hands the
 * demo to someone else; "Save as demo package" is the SC's own act. They touch
 * in one place: Export's link form opens the Save dialog when the storefront is
 * not a package yet, closing itself as it does.
 *
 * @module features/dashboard/ui/hooks/useHandoverDialogs
 */

import { useCallback, useState } from 'react';

export interface HandoverDialogs {
    exportOpen: boolean;
    demoPackageOpen: boolean;
    openExport: () => void;
    closeExport: () => void;
    /** Absent for a headless project: it has no storefront of its own to save. */
    openDemoPackage?: () => void;
    closeDemoPackage: () => void;
    /** From Export's link form: close Export, open Save as demo package. */
    saveDemoPackageFromExport: () => void;
}

/**
 * Open state and openers for Export and Save as demo package.
 *
 * @param isEds - Whether the project has a storefront of its own
 * @returns the state and the callbacks the screen binds
 */
export function useHandoverDialogs(isEds: boolean): HandoverDialogs {
    const [exportOpen, setExportOpen] = useState(false);
    const [demoPackageOpen, setDemoPackageOpen] = useState(false);
    const openExport = useCallback(() => setExportOpen(true), []);
    const closeExport = useCallback(() => setExportOpen(false), []);
    const openPackage = useCallback(() => setDemoPackageOpen(true), []);
    const closeDemoPackage = useCallback(() => setDemoPackageOpen(false), []);
    const saveDemoPackageFromExport = useCallback(() => {
        setExportOpen(false);
        setDemoPackageOpen(true);
    }, []);
    return {
        exportOpen,
        demoPackageOpen,
        openExport,
        closeExport,
        openDemoPackage: isEds ? openPackage : undefined,
        closeDemoPackage,
        saveDemoPackageFromExport,
    };
}
