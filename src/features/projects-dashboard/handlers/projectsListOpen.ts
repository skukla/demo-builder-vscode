/**
 * Projects list: start, stop and open a project's demo, its AI chat, its live
 * site, DA.live and the Commerce Admin. Split from `dashboardHandlers.ts` by job
 * (EDS-8, 2026-10-05), which re-exports every handler.
 *
 * @module features/projects-dashboard/handlers/projectsListOpen
 */

import * as vscode from 'vscode';
import { withProjectFromPath } from './projectFromPath';
import { executeCommandForProject } from '@/core/handlers/projectCommandHelper';
import { openInIncognito, openPrivateBrowser } from '@/core/utils/browserUtils';
import { validateURL } from '@/core/validation/URLValidator';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import { getEdsLiveUrl, getEdsDaLiveUrl, getAdminPanelUrl } from '@/types/typeGuards';

// ============================================================================
// Demo Control Handlers (Start/Stop/Open)
// ============================================================================

/**
 * Start a demo for a project
 */
export const handleStartDemo: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.startDemo');
};

/**
 * Stop a demo for a project
 */
export const handleStopDemo: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.stopDemo');
};

/**
 * Open a running demo in browser
 */
export const handleOpenBrowser: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.openBrowser');
};

/**
 * Open the configured AI chat surface for a specific project — home-grid kebab
 * "Open AI" wiring. AI = chat (the Claude Code terminal tab), not the Prompt
 * Library.
 *
 * Always-root home model: the home Chat launches at the projects root, not the
 * project subdir, so nothing anchors the workspace here. We only set the
 * current-project pointer; the home Chat resolves "the active project" from that
 * pointer via the `get_current_project` MCP tool.
 *
 * Flow:
 *   1. Load the project for the given path and set it as the current-project
 *      pointer (`saveProject`).
 *   2. Dispatch `demoBuilder.openInClaude` with NO project arg — the command
 *      always launches the home Chat at the projects root.
 */
export const handleOpenAiForProject = withProjectFromPath<{ projectPath: string }>(
    async (context, project): Promise<HandlerResponse> => {
        // Set the current-project pointer so the dashboard / state reads and the
        // home Chat's `get_current_project` tool resolve to this project. No
        // workspace anchor — the home Chat launches at the projects root.
        await context.stateManager.saveProject(project);
        await vscode.commands.executeCommand('demoBuilder.openInClaude');
        return { success: true };
    },
);

/**
 * Open EDS live site in browser
 *
 * Opens in incognito/private browsing mode to ensure a clean session
 * without cached content or logged-in states that could affect the demo.
 */
export const handleOpenLiveSite = withProjectFromPath<{ projectPath: string }>(
    async (_context, project): Promise<HandlerResponse> => {
        const liveUrl = getEdsLiveUrl(project);

        if (!liveUrl) {
            return { success: false, error: 'EDS live URL not available' };
        }

        // Validate before anything opens (defence against injection via stored URLs),
        // so a bad URL is refused instead of failing inside a notification.
        try {
            validateURL(liveUrl);
        } catch {
            return { success: false, error: `Invalid live URL: ${liveUrl}` };
        }

        // Incognito keeps the demo clean — no cached content, nobody signed in — and
        // falls back to the normal browser where it is not available.
        await openPrivateBrowser(liveUrl);

        return { success: true };
    },
);

/**
 * Open DA.live for authoring
 */
export const handleOpenDaLive = withProjectFromPath<{ projectPath: string }>(
    async (_context, project): Promise<HandlerResponse> => {
        const daLiveUrl = getEdsDaLiveUrl(
            project,
            resolveProjectAuthoringExperience(project),
            getEwCanvasBranch(),
        );

        if (!daLiveUrl) {
            return { success: false, error: 'DA.live URL not available' };
        }

        await vscode.env.openExternal(vscode.Uri.parse(daLiveUrl));
        return { success: true };
    },
);

/**
 * Open the Adobe Commerce Admin Panel for a project.
 *
 * The admin URL resolves via getAdminPanelUrl: an explicit
 * ADOBE_COMMERCE_ADMIN_URL (PaaS Configure field / override) wins, otherwise
 * SaaS projects derive it from the ACCS tenant endpoint. When unresolvable,
 * a notification offers a jump to the Configure screen instead of failing.
 */
export const handleOpenAdminPanel = withProjectFromPath<{ projectPath: string }>(
    async (context, project): Promise<HandlerResponse> => {
        const url = getAdminPanelUrl(project);

        if (!url) {
            // No URL configured — offer the Configure screen. Fire-and-forget so the
            // webview response isn't held on the user's notification choice. The
            // saveProject sets the current-project pointer, which configureProject
            // resolves from (mirrors handleOpenAiForProject).
            void vscode.window
                .showInformationMessage('No Admin Panel URL is set for this project.', 'Open Configure')
                .then(async (selection) => {
                    if (selection === 'Open Configure') {
                        await context.stateManager.saveProject(project);
                        await vscode.commands.executeCommand('demoBuilder.configureProject');
                    }
                })
                .then(undefined, (error) => {
                    context.logger.error(
                        '[ProjectsList] Failed to open Configure from admin-panel prompt',
                        error as Error,
                    );
                });
            return { success: true };
        }

        // Validate URL before opening (defense against injection via stored URLs).
        // Generic error only — the stored URL may embed credentials, never echo it.
        // http is allowed alongside https — the Configure field accepts both, and
        // the localhost/private-IP blocks still apply (mirrors configureHandlers).
        try {
            validateURL(url, ['https', 'http']);
        } catch (validationError) {
            context.logger.error(
                '[ProjectsList] Admin Panel URL validation failed',
                validationError as Error,
            );
            return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
        }

        // A private window, like the live site: Commerce Admin rejects a request whose
        // adobe.com cookies have grown too large ("400 Request Header Or Cookie Too
        // Large"), and a normal profile collects them.
        await openInIncognito(url);
        return { success: true };
    },
);

// The per-project authoring-experience control is a setup-time preference set
// in the Configure webview (EDS-only radio group with an explicit Save), not an
// on-the-fly action. The handler that flipped it from this surface was removed,
// and menu/tile labels are STATIC ("Author Content") — the resolved experience
// only decides WHERE the Author action opens (resolved at open time).
