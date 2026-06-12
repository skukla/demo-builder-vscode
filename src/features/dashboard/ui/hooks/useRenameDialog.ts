/**
 * useRenameDialog Hook
 *
 * Owns the dashboard rename-dialog open/close state and the confirm wiring.
 * Confirm posts `renameProject` with just the new name — the backend resolves
 * the current project and re-sends init so the dashboard title refreshes.
 *
 * Extracted from ProjectDashboardScreen to keep that component under the
 * complexity limit.
 *
 * @module features/dashboard/ui/hooks/useRenameDialog
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * Return type for the useRenameDialog hook
 */
export interface UseRenameDialogReturn {
    /** Whether the rename dialog is currently shown */
    showRenameDialog: boolean;
    /** Open the rename dialog */
    openRenameDialog: () => void;
    /** Close the rename dialog without renaming */
    closeRenameDialog: () => void;
    /** Confirm the rename: post renameProject and close the dialog */
    confirmRename: (newName: string) => void;
}

/**
 * Hook to manage the dashboard rename dialog.
 *
 * @returns Rename dialog state and handlers
 */
export function useRenameDialog(): UseRenameDialogReturn {
    const [showRenameDialog, setShowRenameDialog] = useState(false);

    const openRenameDialog = useCallback(() => setShowRenameDialog(true), []);
    const closeRenameDialog = useCallback(() => setShowRenameDialog(false), []);
    const confirmRename = useCallback((newName: string) => {
        webviewClient.postMessage('renameProject', { newName });
        setShowRenameDialog(false);
    }, []);

    return { showRenameDialog, openRenameDialog, closeRenameDialog, confirmRename };
}
