/**
 * Configure Screen Handlers
 *
 * Handler map for the Configure Project webview.
 * Extracted from inline comm.onStreaming() handlers in configure.ts
 * to match the standard handler map + dispatchHandler pattern.
 *
 * Note: save-configuration remains inline in the command class because
 * it depends on private notification/deployment methods. Same mixed pattern
 * as the Wizard (simple handlers in map, complex middleware inline).
 *
 * AI-related handlers (`verify-ai-setup`, `inspect-mcp`,
 * `regenerate-ai-files`, `openInClaude`) now live in `aiHandlers.ts` and are
 * routed by the standalone AI surface.
 *
 * @module features/dashboard/handlers/configureHandlers
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { validateURL } from '@/core/validation';
import { handleCreateWorkspaceCredential } from '@/features/authentication';
import { handleSyncComponentConfigs } from '@/features/components/handlers/componentHandlers';
import { handleDiscoverStoreStructure } from '@/features/eds';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import { parseJSON } from '@/types/typeGuards';

// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle cancel — dispose the panel
 */
export async function handleCancelConfigure(
    context: HandlerContext,
): Promise<HandlerResponse> {
    context.panel?.dispose();
    return { success: true };
}

/**
 * Handle get-components-data — read and return components.json
 */
export async function handleGetComponentsData(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const componentsPath = path.join(context.context.extensionPath, 'src', 'features', 'components', 'config', 'components.json');
    const componentsContent = await fsPromises.readFile(componentsPath, 'utf-8');
    const componentsData = parseJSON<Record<string, unknown>>(componentsContent);
    if (!componentsData) {
        throw new Error('Failed to parse components.json');
    }
    return componentsData as unknown as HandlerResponse;
}

/**
 * Handle openExternal — open a URL in the system browser
 */
export async function handleOpenExternal(
    _context: HandlerContext,
    payload?: { url?: string },
): Promise<HandlerResponse> {
    if (payload?.url) {
        validateURL(payload.url, ['https', 'http']);
        await vscode.env.openExternal(vscode.Uri.parse(payload.url));
    }
    return { success: true };
}

/**
 * Handle open-eds-settings — open VS Code settings for DA.live
 */
export async function handleOpenEdsSettings(
    _context: HandlerContext,
): Promise<HandlerResponse> {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'demoBuilder.daLive');
    return { success: true };
}

// ==========================================================
// Handler Map
// ==========================================================

/**
 * Configure screen handler map.
 *
 * Does NOT include save-configuration (stays inline in command class
 * due to notification/deployment method dependencies).
 */
export const configureHandlers = defineHandlers({
    'cancel': handleCancelConfigure,
    'get-components-data': handleGetComponentsData,
    'openExternal': handleOpenExternal,
    'open-eds-settings': handleOpenEdsSettings,
    'discover-store-structure': handleDiscoverStoreStructure,
    'sync-component-configs': handleSyncComponentConfigs,
    'create-workspace-credential': handleCreateWorkspaceCredential,
});
