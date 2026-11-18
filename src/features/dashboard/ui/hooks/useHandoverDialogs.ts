/**
 * The Share row's dialogs. Share Demo is one dialog since 2026-10-22 (Export and Save as demo
 * package did the same job and became a link or a file). Save as Package is its own again since
 * EDS-72 (owner, 2026-11-18): the card on the SC's own Welcome step, which Share no longer places.
 *
 * @module features/dashboard/ui/hooks/useHandoverDialogs
 */

import { useCallback, useState } from 'react';

export interface HandoverDialogs {
    shareOpen: boolean;
    openShare: () => void;
    closeShare: () => void;
    savePackageOpen: boolean;
    openSavePackage: () => void;
    closeSavePackage: () => void;
}

/**
 * Open state and stable openers for Share Demo and Save as Package.
 *
 * @returns the state and the callbacks the screen binds
 */
export function useHandoverDialogs(): HandoverDialogs {
    const [shareOpen, setShareOpen] = useState(false);
    const [savePackageOpen, setSavePackageOpen] = useState(false);
    const openShare = useCallback(() => setShareOpen(true), []);
    const closeShare = useCallback(() => setShareOpen(false), []);
    const openSavePackage = useCallback(() => setSavePackageOpen(true), []);
    const closeSavePackage = useCallback(() => setSavePackageOpen(false), []);
    return { shareOpen, openShare, closeShare, savePackageOpen, openSavePackage, closeSavePackage };
}
