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
 * AI-related handlers (`verify-ai-setup`, `regenerate-ai-files`,
 * `openInClaude`) now live in `aiHandlers.ts` and are routed by the standalone
 * AI surface.
 *
 * @module features/dashboard/handlers/configureHandlers
 */

import * as vscode from 'vscode';
import { validateURL } from '@/core/validation/URLValidator';
import { handleCheckCredentialService } from '@/features/eds/handlers/credentialServiceHandler';
import { handleDiscoverStoreStructure } from '@/features/eds/handlers/edsHandlers';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle cancel — dispose the panel
 */
export async function handleCancelConfigure(context: HandlerContext): Promise<HandlerResponse> {
    context.panel?.dispose();
    return { success: true };
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
export async function handleOpenEdsSettings(_context: HandlerContext): Promise<HandlerResponse> {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'demoBuilder.daLive');
    return { success: true };
}

/**
 * Store discovery, plus: persist the hierarchy it just fetched onto the project.
 *
 * The structure is the only place a store CODE can be turned back into the NAME
 * the user picked it by — `citisignal_store` → "CitiSignal Store". It was fetched
 * and discarded on every discovery, so the Integrations flyout (a different
 * webview, which never makes this call) could only ever show codes. Persisting it
 * once makes naming an offline lookup on every surface, for free and forever.
 *
 * Wrapped rather than folded into the shared handler because that handler is also
 * registered by the WIZARD (`ProjectCreationHandlerRegistry`), where there is no
 * project yet — `getCurrentProject()` there would return whatever was last open
 * and write another project's structure onto it. The wizard carries its structure
 * through `buildProjectConfig` at creation instead. Configure is the only surface
 * that is, by definition, configuring the current project.
 *
 * Best-effort: discovery has already succeeded and been sent to the webview by the
 * time this runs, so a persistence failure must not turn a working picker into an
 * error. It just means the flyout keeps showing codes.
 */
export async function handleDiscoverStoreStructureAndPersist(
    context: HandlerContext,
    payload?: Parameters<typeof handleDiscoverStoreStructure>[1],
): Promise<HandlerResponse> {
    let discovered: CommerceStoreStructure | undefined;

    // The handler reports its result by SENDING it, not returning it, so the
    // structure is intercepted on its way to the webview.
    const response = await handleDiscoverStoreStructure(
        {
            ...context,
            sendMessage: async (type: string, data?: unknown) => {
                if (type === 'store-discovery-result') {
                    const result = data as { success?: boolean; data?: CommerceStoreStructure };
                    if (result?.success && result.data) discovered = result.data;
                }
                return context.sendMessage(type, data);
            },
        } as HandlerContext,
        payload,
    );

    if (discovered) {
        try {
            const project = await context.stateManager.getCurrentProject();
            if (project) {
                project.commerceStoreStructure = discovered;
                await context.stateManager.saveProject(project);
            }
        } catch (error) {
            context.logger.warn(
                `[Configure] Could not persist the store structure: ${(error as Error).message}`,
            );
        }
    }

    return response;
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
// No 'get-components-data' here: nothing on the Configure webview sends it
// (the screen gets componentsData in its init payload). The wizard's handler
// (componentHandlers.handleGetComponentsData) serves the one real caller —
// this map briefly carried a SECOND implementation with a DIFFERENT response
// shape (raw components.json, no {success,data} wrapper), which could never
// have answered the shared hook correctly had anything ever asked.
export const configureHandlers = defineHandlers({
    cancel: handleCancelConfigure,
    openExternal: handleOpenExternal,
    'open-eds-settings': handleOpenEdsSettings,
    'discover-store-structure': handleDiscoverStoreStructureAndPersist,
    // Whether the OAuth fields need filling in at all. Status only — never a pair.
    'check-credential-service': handleCheckCredentialService,
});
