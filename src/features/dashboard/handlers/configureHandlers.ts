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
import { clearMcpCache, inspectAllServers, verifyAiSetup } from '@/features/ai';
import { handleCreateWorkspaceCredential } from '@/features/authentication';
import { handleSyncComponentConfigs } from '@/features/components/handlers/componentHandlers';
import { handleDiscoverStoreStructure } from '@/features/eds';
import {
    GLOBAL_MCP_REG_STATE_KEY,
    type GlobalMcpRegistrationState,
    generateAIContextFiles,
    registerGlobalMcp,
} from '@/features/project-creation/services';
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
 *
 * Cycle D: extends the response with `globalMcpRegistration` so the AI
 * Configuration tab can show the Register button when demo-builder is not yet
 * in `~/.claude.json`. The value is the persisted globalState, narrowed to
 * `'unregistered'` when the user has not been prompted yet.
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
    const result = await verifyAiSetup(project.path, extensionDistPath);
    const persisted = context.context.globalState.get<GlobalMcpRegistrationState>(GLOBAL_MCP_REG_STATE_KEY);
    const globalMcpRegistration: GlobalMcpRegistrationState | 'unregistered' =
        persisted ?? 'unregistered';
    return { success: true, ...result, globalMcpRegistration };
}

/**
 * Handle register-global-mcp — upsert the demo-builder MCP entry into
 * `~/.claude.json` and mark globalState as `'registered'`.
 *
 * Bypasses the consent prompt that `ensureGlobalMcpRegistration` runs at
 * project-creation time — this handler is invoked from the AI Configuration
 * tab's explicit Register button, so the user has already opted in.
 */
export async function handleRegisterGlobalMcp(
    context: HandlerContext,
): Promise<HandlerResponse> {
    const extensionDistPath = path.join(context.context.extensionPath, 'dist');
    await registerGlobalMcp(extensionDistPath);
    await context.context.globalState.update(GLOBAL_MCP_REG_STATE_KEY, 'registered');
    return { success: true };
}

/**
 * Handle inspect-mcp — force refresh of MCP inventory by clearing the
 * mcpInspector cache then re-running `inspectAllServers`.
 *
 * Payload `{ serverId? }`:
 *   - When `serverId` is provided, only that entry is cleared and re-fetched.
 *     Other cached entries return immediately (saves spawning every server).
 *   - When omitted, every cached entry is cleared and all servers are
 *     re-inspected.
 *
 * Reads `projectPath` from `stateManager` (server-side) and ignores any
 * webview-supplied paths to prevent path-injection.
 */
export async function handleInspectMcp(
    context: HandlerContext,
    payload?: { serverId?: string },
): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    // Treat empty-string serverId as "clear all" — a webview form field that
    // submits an empty value should not silently degrade to a no-op cache delete.
    const serverId = payload?.serverId ? payload.serverId : undefined;
    clearMcpCache(serverId);
    const mcps = await inspectAllServers(project.path);
    return { success: true, mcps };
}

/**
 * Handle openInClaude — dispatch the demoBuilder.openInClaude command so the
 * AI Configuration tab's right-column CTA can launch Claude Code. Mirrors
 * the dashboard tile dispatch (no payload — command falls back to current
 * project via StateManager).
 */
export async function handleOpenInClaude(): Promise<HandlerResponse> {
    await vscode.commands.executeCommand('demoBuilder.openInClaude');
    return { success: true };
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
    await generateAIContextFiles(project.path, project, context.context.extensionPath);
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
    'inspect-mcp': handleInspectMcp,
    'regenerate-ai-files': handleRegenerateAiFiles,
    'register-global-mcp': handleRegisterGlobalMcp,
    'openInClaude': handleOpenInClaude,
});
