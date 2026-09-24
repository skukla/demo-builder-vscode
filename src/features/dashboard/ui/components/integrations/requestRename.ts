/**
 * Commit an in-drawer or in-card rename of an integration.
 *
 * Moved out of `IntegrationsGrid` on 2026-09-24, when the grid's cards/rows
 * item loop took it past the component size limit; the grid only hands this to
 * its items. Mirrors the InlineRenameField contract (null = success, string =
 * inline error); the payload `name` makes the handler skip its input box and
 * round-trip validation errors.
 */

import { webviewClient } from '@/core/ui/utils/WebviewClient';

export async function requestRename(id: string, name: string): Promise<string | null> {
    try {
        const response = await webviewClient.request<{ success: boolean; error?: string }>(
            'renameAppBuilderComponent',
            { id, name },
        );
        return response?.success ? null : (response?.error ?? 'Rename failed');
    } catch (error) {
        return error instanceof Error ? error.message : 'Rename failed';
    }
}
