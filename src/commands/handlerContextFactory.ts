/**
 * handlerContextFactory — build a COMPLETE HandlerContext for a webview panel.
 *
 * Every panel command hand-rolled its own context, and four of the five filled the
 * managers with `undefined as unknown as ...` because their own handlers did not
 * happen to need them. Then a panel started reusing another panel's handlers, and an
 * absent dependency became a confident, wrong, user-facing diagnosis: the
 * integrations destination picker reported "this organization is not available on
 * your current Adobe account" for a perfectly reachable org, because
 * `context.authManager?.getOrganizations() ?? []` returned an empty list
 * (2026-07-31).
 *
 * The lesson is not "wire authManager" — it is that a hand-built context makes each
 * panel guess which dependencies its handlers will ever touch, and reusing handlers
 * across panels makes that guess unknowable. This factory removes the guess.
 *
 * The managers it constructs are per-panel and cheap; callers should build the
 * context ONCE per panel (not per message) and reuse it.
 *
 * Lives in `commands/`, not `core/`: it constructs a PrerequisitesManager, and core
 * must not import features. Commands are the orchestration layer that may.
 *
 * @module commands/handlerContextFactory
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getLogger, getStepLogger } from '@/core/logging';
import { ErrorLogger } from '@/core/logging/errorLogger';
import { ProgressUnifier } from '@/core/utils/progressUnifier/ProgressUnifier';
import { getPrerequisitesManager } from '@/features/prerequisites/services/prerequisitesManagerInstance';
import type { HandlerContext, SharedState } from '@/types/handlers';
import { getComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';

/** The panel-specific half — everything the factory cannot know. */
export interface PanelContextParts {
    context: vscode.ExtensionContext;
    panel: vscode.WebviewPanel | undefined;
    stateManager: HandlerContext['stateManager'];
    communicationManager: HandlerContext['communicationManager'];
    sendMessage: HandlerContext['sendMessage'];
    /** Defaults to a fresh, non-authenticating shared state. */
    sharedState?: SharedState;
}

/**
 * A HandlerContext with every manager present.
 *
 * @param parts - the panel-specific half (VS Code + transport wiring)
 * @returns a context no handler can find a hole in
 */
export function createPanelHandlerContext(parts: PanelContextParts): HandlerContext {
    const logger = getLogger();

    return {
        prereqManager: getPrerequisitesManager(
            parts.context.extensionPath,
            logger,
            ServiceLocator.getCommandExecutor(),
        ),
        componentRegistry: getComponentRegistryManager(parts.context.extensionPath),
        authManager: ServiceLocator.getAuthenticationService(),
        errorLogger: new ErrorLogger(parts.context),
        progressUnifier: new ProgressUnifier(logger),
        stepLogger: getStepLogger(logger),

        logger,
        debugLogger: logger,

        context: parts.context,
        panel: parts.panel,
        stateManager: parts.stateManager,
        communicationManager: parts.communicationManager,
        sendMessage: parts.sendMessage,

        sharedState: parts.sharedState ?? ({ isAuthenticating: false } as SharedState),
    };
}
