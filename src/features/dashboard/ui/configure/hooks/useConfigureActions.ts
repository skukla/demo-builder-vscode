/**
 * useConfigureActions Hook
 *
 * Extracts the action handlers from ConfigureScreen.
 * Handles save and cancel operations.
 */

import { useCallback, Dispatch, SetStateAction } from 'react';
import type { SaveConfigurationResponse } from '../configureTypes';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { ComponentConfigs } from '@/types/webview';

interface UseConfigureActionsProps {
    componentConfigs: ComponentConfigs;
    setIsSaving: Dispatch<SetStateAction<boolean>>;
}

interface UseConfigureActionsReturn {
    handleSave: () => Promise<void>;
    handleCancel: () => void;
}

/**
 * Hook to manage save and cancel actions
 */
export function useConfigureActions({
    componentConfigs,
    setIsSaving,
}: UseConfigureActionsProps): UseConfigureActionsReturn {
    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            const result = await webviewClient.request<SaveConfigurationResponse>('save-configuration', { componentConfigs });
            if (result.success) {
                // Configuration saved successfully
            } else {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [componentConfigs, setIsSaving]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    return {
        handleSave,
        handleCancel,
    };
}
