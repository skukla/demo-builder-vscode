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
 *
 * "Touches sendMessage" is NOT among the disqualifiers, despite how it reads:
 * `progressCapture.withCapturedProgress` wraps this context so the pushes are
 * collected and `lastCompleteData` reads the payload back out. `createProjectTool`
 * has used that in production since it shipped.
 */

import type * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di';
import type { StateManager } from '@/core/state';
import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import type { HandlerContext, SharedState } from '@/types/handlers';
import type { Logger } from '@/types/logger';

export function createHeadlessHandlerContext(
    context: vscode.ExtensionContext,
    stateManager: StateManager,
    logger: Logger,
): HandlerContext {
    return {
        // Real, not undefined. `PrerequisitesManager` takes only an extension path
        // and a logger and contains ZERO `vscode.window` references, so it works
        // headlessly exactly as it does behind the panel
        // (`src/commands/handlerContextFactory.ts:55` builds it the same way).
        //
        // Leaving it undefined was actively dangerous, not merely limiting:
        // `initializePrerequisiteCheck` calls `context.prereqManager?.loadConfig()`,
        // gets nothing, iterates zero prerequisites, and `[].every(...)` is `true`
        // — so a prerequisites check would report "everything installed" on a bare
        // machine. Any tool over that handler needs this line first.
        prereqManager: new PrerequisitesManager(context.extensionPath, logger),
        authManager: ServiceLocator.getAuthenticationService(),
        // Deliberately absent on the agent surface. These are OPTIONAL on
        // HandlerContext, and every reader in the handler tree uses `?.`
        // (verified 2026-08-21: zero non-optional-chained reads of
        // errorLogger/progressUnifier/stepLogger in src/), so plain undefined
        // is the honest value — the old `undefined as unknown as` casts were
        // widening a field that never needed it.
        errorLogger: undefined,
        progressUnifier: undefined,
        stepLogger: undefined,

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
