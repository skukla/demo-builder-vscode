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

/**
 * The window's StateManager, with `getCurrentProject()` reading the pointer from
 * disk instead of from memory.
 *
 * Every extension window computes the same MCP socket name and the last to bind
 * serves, so the host answering an agent is frequently NOT the host the user is
 * working in. In-memory state is loaded once at `initialize()` and there is no
 * watcher on the state file (`reload()` exists with zero callers), so the
 * serving host reports whichever project IT held at startup — and reports it
 * confidently, because `getCurrentProject()` re-reads that project's manifest
 * fresh. Right data, wrong project. `get_current_project` is the first tool the
 * home AGENTS.md tells an agent to call, so everything pointer-based inherits
 * the wrong answer, including `reset_eds_project`, which is confirm-only and
 * rewrites the storefront repo and DA.live content.
 *
 * Scoped to the agent surface on purpose. Making the UI disk-authoritative too
 * would silently switch a window's visible project mid-session — a bigger change
 * that needs its own decision. Everything else delegates unchanged; methods are
 * bound to the real instance so no `this` is rebound onto the proxy.
 */
function withDiskBackedCurrentProject(stateManager: StateManager): StateManager {
    return new Proxy(stateManager, {
        get(target, prop, _receiver) {
            if (prop === 'getCurrentProject') {
                return () => target.readCurrentProjectFromDisk();
            }
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

export function createHeadlessHandlerContext(
    context: vscode.ExtensionContext,
    stateManager: StateManager,
    logger: Logger,
): HandlerContext {
    const diskBacked = withDiskBackedCurrentProject(stateManager);
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
        stateManager: diskBacked,
        communicationManager: undefined,
        sendMessage: async () => {
            /* no webview on the agent surface — handlers reached this way must not rely on it */
        },

        sharedState: { isAuthenticating: false } as SharedState,
    };
}
