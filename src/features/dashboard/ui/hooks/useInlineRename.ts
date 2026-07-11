/**
 * useInlineRename Hook
 *
 * The dashboard title's rename-in-place commit (replaces the deleted
 * useRenameDialog / DashboardRenameDialog pair). Requests `renameProject`
 * with just the new name — the backend resolves the current project, runs the
 * shared renameProjectCore, and re-sends status so the title refreshes.
 *
 * Returns the InlineRenameField contract: resolve null on success, or an
 * error message string (collision, validation, running guard) for inline
 * display next to the input.
 *
 * @module features/dashboard/ui/hooks/useInlineRename
 */

import { useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * Hook for the dashboard title's inline rename commit.
 *
 * @returns async commit: newName → null (success) | error message
 */
export function useInlineRename(): (newName: string) => Promise<string | null> {
    return useCallback(async (newName: string): Promise<string | null> => {
        try {
            const response = await webviewClient.request<{ success: boolean; error?: string }>(
                'renameProject',
                { newName },
            );
            if (response?.success) return null;
            return response?.error ?? 'Rename failed';
        } catch (error) {
            return error instanceof Error ? error.message : 'Rename failed';
        }
    }, []);
}
