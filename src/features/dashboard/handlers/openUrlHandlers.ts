/**
 * Dashboard Open-URL Handlers
 *
 * Handlers whose job is opening an external URL in the browser (demo storefront,
 * EDS live site, DA.live, Commerce admin, Developer Console) plus the pure
 * `getProjectUrls` read that computes the same URLs as DATA. Extracted from
 * `dashboardHandlers.ts` for the 500-line handler cap; the parent re-exports
 * everything here so import sites are unchanged.
 */

import * as vscode from 'vscode';
import { hasAdobeWorkspaceContext, hasAdobeProjectContext } from './meshStatusHelpers';
import { openInIncognito } from '@/core/utils/browserUtils';
import { validateURL } from '@/core/validation/URLValidator';
import { validateOrgId, validateProjectId, validateWorkspaceId } from '@/core/validation/validators/AdobeResourceValidator';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler, HandlerContext } from '@/types/handlers';
import {
    getAdminPanelUrl,
    getEdsDaLiveUrl,
    getEdsLiveUrl,
    getProjectFrontendPort,
} from '@/types/typeGuards';

/**
 * Handle 'openBrowser' message - Open demo in browser (non-EDS projects)
 */
export const handleOpenBrowser: MessageHandler = async (context) => {
    const currentProject = await context.stateManager.getCurrentProject();
    const frontendPort = getProjectFrontendPort(currentProject);

    if (frontendPort) {
        const url = `http://localhost:${frontendPort}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        context.logger.debug(`[Dashboard] Opening browser: ${url}`);
    }

    return { success: true };
};

/**
 * Handle 'openLiveSite' message - Open EDS live site in browser
 *
 * Opens in incognito/private browsing mode to ensure a clean session
 * without cached content or logged-in states that could affect the demo.
 */
export const handleOpenLiveSite: MessageHandler = async (context, data) => {
    const payload = data as { url?: string };

    const url = payload?.url;
    if (!url) {
        context.logger.warn('[Dashboard] openLiveSite called without URL');
        return { success: false, error: 'No URL provided', code: ErrorCode.CONFIG_INVALID };
    }

    // Validate URL before opening (security: prevents malicious URL injection)
    try {
        validateURL(url);
    } catch (validationError) {
        context.logger.error(
            '[Dashboard] Live site URL validation failed',
            validationError as Error,
        );
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    // Show progress notification while browser is opening
    // Incognito mode can take a moment to launch
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Opening in private browser...',
            cancellable: false,
        },
        async () => {
            // Open in incognito mode for clean demo experience (no cached content/cookies)
            // Falls back to normal browser if incognito mode is not available
            const openedIncognito = await openInIncognito(url);
            context.logger.debug(
                `[Dashboard] Opening live site: ${url} (incognito: ${openedIncognito})`,
            );
        },
    );

    return { success: true };
};

/**
 * Handle 'openDaLive' message - Open DA.live for authoring (EDS projects)
 */
export const handleOpenDaLive: MessageHandler = async (context, data) => {
    const payload = data as { url?: string };

    if (!payload?.url) {
        context.logger.warn('[Dashboard] openDaLive called without URL');
        return { success: false, error: 'No URL provided', code: ErrorCode.CONFIG_INVALID };
    }

    // Validate URL before opening (security: prevents malicious URL injection)
    try {
        validateURL(payload.url);
    } catch (validationError) {
        context.logger.error('[Dashboard] DA.live URL validation failed', validationError as Error);
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    await vscode.env.openExternal(vscode.Uri.parse(payload.url));
    context.logger.debug(`[Dashboard] Opening DA.live: ${payload.url}`);

    return { success: true };
};

/**
 * Handle 'openAdminPanel' message - Open the Commerce admin panel in the browser
 *
 * The admin URL resolves via getAdminPanelUrl: an explicit
 * ADOBE_COMMERCE_ADMIN_URL (PaaS Configure field / override) wins, otherwise
 * SaaS projects derive it from the ACCS tenant endpoint. When unresolvable,
 * a notification offers a jump to Configure instead of failing.
 */
export const handleOpenAdminPanel: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    const url = getAdminPanelUrl(project);

    if (!url) {
        // Fire-and-forget — the notification must not block the handler response.
        void vscode.window
            .showInformationMessage('No Admin Panel URL is set for this project.', 'Open Configure')
            .then((selection) => {
                if (selection === 'Open Configure') {
                    // Returned (not voided) so a rejection reaches the handler below.
                    return vscode.commands.executeCommand('demoBuilder.configureProject');
                }
                return undefined;
            })
            .then(undefined, (error) => {
                context.logger.error(
                    '[Dashboard] Failed to open Configure from admin-panel prompt',
                    error as Error,
                );
            });
        return { success: true };
    }

    // Validate URL before opening (security: prevents malicious URL injection).
    // http is allowed alongside https — the Configure field accepts both, and the
    // localhost/private-IP blocks still apply (mirrors configureHandlers).
    try {
        validateURL(url, ['https', 'http']);
    } catch (validationError) {
        context.logger.error(
            '[Dashboard] Admin panel URL validation failed',
            validationError as Error,
        );
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    // No URL in the log — the stored value is user-supplied and may embed credentials.
    context.logger.debug('[Dashboard] Opening admin panel');
    await vscode.env.openExternal(vscode.Uri.parse(url));

    return { success: true };
};

/**
 * Handle 'openDevConsole' message - Open Adobe Developer Console
 */
export const handleOpenDevConsole: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    let consoleUrl = 'https://developer.adobe.com/console';

    if (hasAdobeWorkspaceContext(project)) {
        // Validate Adobe IDs before URL construction (security: prevents URL injection)
        try {
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            validateWorkspaceId(project.adobe.workspace);
        } catch (validationError) {
            context.logger.error(
                '[Dev Console] Adobe ID validation failed',
                validationError as Error,
            );
            return {
                success: false,
                error: 'Invalid Adobe resource ID',
                code: ErrorCode.CONFIG_INVALID,
            };
        }

        // Direct link to workspace
        consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/workspaces/${project.adobe.workspace}/details`;
        context.logger.debug('[Dev Console] Opening workspace-specific URL');
    } else if (hasAdobeProjectContext(project)) {
        // Validate Adobe IDs before URL construction (security: prevents URL injection)
        try {
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
        } catch (validationError) {
            context.logger.error(
                '[Dev Console] Adobe ID validation failed',
                validationError as Error,
            );
            return {
                success: false,
                error: 'Invalid Adobe resource ID',
                code: ErrorCode.CONFIG_INVALID,
            };
        }

        // Fallback: project overview
        consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/overview`;
        context.logger.debug('[Dev Console] Opening project-specific URL (no workspace)');
    } else {
        context.logger.debug('[Dev Console] Opening generic console URL (missing IDs)');
    }

    // Validate final URL before opening (defense-in-depth)
    try {
        validateURL(consoleUrl);
    } catch (validationError) {
        context.logger.error('[Dev Console] URL validation failed', validationError as Error);
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
    return { success: true };
};

/**
 * Build the Developer Console deep link for a project (workspace → project →
 * generic). Mirrors {@link handleOpenDevConsole}'s branching but, being a READ,
 * falls back to the generic console URL on a malformed id instead of erroring.
 */
function resolveDevConsoleUrl(
    project: Project | undefined | null,
    context: HandlerContext,
): string {
    const generic = 'https://developer.adobe.com/console';
    try {
        if (hasAdobeWorkspaceContext(project)) {
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            validateWorkspaceId(project.adobe.workspace);
            return `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/workspaces/${project.adobe.workspace}/details`;
        }
        if (hasAdobeProjectContext(project)) {
            validateOrgId(project.adobe.organization);
            validateProjectId(project.adobe.projectId);
            return `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/overview`;
        }
    } catch {
        context.logger.warn(
            '[Get URLs] Dev Console id validation failed; using the generic console URL',
        );
    }
    return generic;
}

/**
 * Handle 'getProjectUrls' message - Return the project's useful URLs as DATA.
 *
 * The read behind the get_project_urls MCP tool. Computes each URL from the
 * SAME getters the open-in-browser handlers use, so an agent gets what a click
 * would open without the browser side effect. Absent URLs are omitted (the
 * getters return undefined). Deliberately pure: it never opens a browser and
 * never runs the admin-panel "Open Configure" prompt — an unresolvable admin
 * URL is simply omitted.
 */
export const handleGetProjectUrls: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const urls: Record<string, string> = {};

    // Local dev storefront — present only while the demo is running (port assigned).
    const frontendPort = getProjectFrontendPort(project);
    if (frontendPort) urls.storefront = `http://localhost:${frontendPort}`;

    // EDS live site + DA.live authoring (undefined for non-EDS projects).
    const liveSite = getEdsLiveUrl(project);
    if (liveSite) urls.liveSite = liveSite;
    const daLive = getEdsDaLiveUrl(
        project,
        resolveProjectAuthoringExperience(project),
        getEwCanvasBranch(),
    );
    if (daLive) urls.daLive = daLive;

    // Commerce admin — the pure getter (explicit field or derived ACCS URL); no prompt.
    const commerceAdmin = getAdminPanelUrl(project);
    if (commerceAdmin) urls.commerceAdmin = commerceAdmin;

    // Developer Console — always resolvable (deep link or generic fallback).
    urls.devConsole = resolveDevConsoleUrl(project, context);

    return { success: true, data: { urls } };
};
