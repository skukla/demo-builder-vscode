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
 * @module features/dashboard/handlers/configureHandlers
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { validateURL } from '@/core/validation';
import { verifyAiSetup } from '@/features/ai';
import { handleCreateWorkspaceCredential } from '@/features/authentication';
import { handleSyncComponentConfigs } from '@/features/components/handlers/componentHandlers';
import { handleDiscoverStoreStructure } from '@/features/eds';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { generateAIContextFiles } from '@/features/project-creation/services';
import { ErrorCode } from '@/types/errorCodes';
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

/**
 * Handle verify-ai-setup — run AI context file health checks
 *
 * Reads projectPath from stateManager (not the webview payload) to prevent
 * a compromised webview from supplying an arbitrary filesystem path.
 */
export async function handleVerifyAiSetup(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // extensionDistPath is always server-side (prevent webview-supplied path traversal)
    const extensionDistPath = path.join(context.context.extensionPath, 'dist');
    return verifyAiSetup(project.path, extensionDistPath) as Promise<HandlerResponse>;
}

/**
 * Handle regenerate-ai-files — re-generate AI context files for the project
 */
export async function handleRegenerateAiFiles(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // Use server-side project.path — do not accept a webview-supplied path override.
    // Pass the stored DA.live token so HELIX_ADMIN_API_TOKEN in mcp.json is auto-populated
    // without requiring the user to retrieve it manually from admin.hlx.page/login.
    const daLiveAuth = new DaLiveAuthService(context.context);
    const helixToken = await daLiveAuth.getAccessToken() ?? undefined;
    await generateAIContextFiles(project.path, project, context.context.extensionPath, helixToken);
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
    'verify-ai-setup': handleVerifyAiSetup,
    'regenerate-ai-files': handleRegenerateAiFiles,
});
