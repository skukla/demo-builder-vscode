/**
 * The Share dialog's open state. One dialog since 2026-10-22: Export and Save
 * as demo package did the same job and became Share Demo (a link or a file).
 *
 * @module features/dashboard/ui/hooks/useHandoverDialogs
 */

import { useCallback, useState } from 'react';

export interface HandoverDialogs {
    shareOpen: boolean;
    openShare: () => void;
    closeShare: () => void;
}

/**
 * Open state and openers for the Share dialog.
 *
 * @returns the state and the callbacks the screen binds
 */
export function useHandoverDialogs(): HandoverDialogs {
    const [shareOpen, setShareOpen] = useState(false);
    const openShare = useCallback(() => setShareOpen(true), []);
    const closeShare = useCallback(() => setShareOpen(false), []);
    return { shareOpen, openShare, closeShare };
}
