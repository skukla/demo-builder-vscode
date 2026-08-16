/**
 * Headless HandlerContext factory for the in-extension MCP server.
 *
 * Mirrors `BaseWebviewCommand.createHandlerContext()` (see
 * `src/features/dashboard/commands/openAi.ts`) but with no webview: `panel` and
 * `communicationManager` are undefined and `sendMessage` is a no-op. This lets
 * MCP tools dispatch to the existing handler maps (via `dispatchHandler`) with
 * the same context the UI uses — minus the webview the agent surface doesn't have.
 *
 * Only handlers that never touch `panel`/`communicationManager`/`sendMessage`
 * (and never pop a modal `vscode.window.show*Message`) are safe to expose this
 * way; handlers that do get a curated adapter instead (later phases).
 */

import type * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';
import type { StateManager } from '@/core/state';
import type { HandlerContext, SharedState } from '@/types/handlers';
import type { Logger } from '@/types/logger';

export function createHeadlessHandlerContext(
    context: vscode.ExtensionContext,
    stateManager: StateManager,
    logger: Logger,
): HandlerContext {
    return {
        prereqManager: undefined as unknown as HandlerContext['prereqManager'],
        authManager: ServiceLocator.getAuthenticationService(),
        errorLogger: undefined as unknown as HandlerContext['errorLogger'],
        progressUnifier: undefined as unknown as HandlerContext['progressUnifier'],
        stepLogger: undefined as unknown as HandlerContext['stepLogger'],

        logger,
        debugLogger: logger,

        context,
        panel: undefined,
        stateManager,
        communicationManager: undefined,
        sendMessage: async () => {
            /* no webview on the agent surface — handlers reached this way must not rely on it */
        },

        sharedState: { isAuthenticating: false } as SharedState,
    };
}
