/**
 * Handler: rename-adobe-project — change an Adobe I/O project's TITLE.
 *
 * Reached from the project picker's rename action (wizard and the Integrations
 * "Change" flow share that picker) and from the `rename_adobe_project` agent tool.
 * Only the title changes: the project's machine name and id are its identity and are
 * never touched, so a rename is reversible by renaming it back — which is also why
 * there is no ownership gate here, unlike delete. Adobe refuses what the user may not
 * change, and that refusal is returned in plain words.
 *
 * @module features/authentication/handlers/renameAdobeProjectHandler
 */

import { refreshProjects } from './deleteAdobeProjectHandler';
import { resolveOrgContext, sendOrgMismatch } from './projectHandlers';
import { validateOrgId, validateProjectId } from '@/core/validation/validators/AdobeResourceValidator';
import { explainAdobeAccessFailure } from '@/features/authentication/services/authenticationErrorFormatter';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { RenameAdobeProjectRequestPayload } from '@/types/webviewRequests';

/** The longest title accepted — the same cap the picker already applies for display. */
const MAX_TITLE_LENGTH = 100;

/** A refusal Adobe gave that has no plainer reading of its own. */
const RENAME_FALLBACK = 'Adobe did not rename the project. Details are in Debug Logs.';

/** The first thing wrong with a rename request, or `undefined` when it is usable. */
function invalidRename(
    context: HandlerContext,
    payload: RenameAdobeProjectRequestPayload | undefined,
): HandlerResponse | undefined {
    if (!payload?.projectId || !payload?.orgId) {
        return {
            success: false,
            error: 'projectId and orgId are required to rename an Adobe project.',
            code: ErrorCode.PROJECT_INVALID,
        };
    }
    const title = (payload.title ?? '').trim();
    if (!title) {
        return { success: false, error: 'Enter a name.', code: ErrorCode.PROJECT_INVALID };
    }
    if (title.length > MAX_TITLE_LENGTH) {
        return {
            success: false,
            error: `Use ${MAX_TITLE_LENGTH} characters or fewer.`,
            code: ErrorCode.PROJECT_INVALID,
        };
    }
    // SECURITY: these ids flow into Adobe Console API paths.
    try {
        validateOrgId(payload.orgId);
        validateProjectId(payload.projectId);
    } catch (validationError) {
        context.logger.error('[Project] Invalid Adobe resource ID', validationError as Error);
        return {
            success: false,
            error: 'That Adobe project id is not valid.',
            code: ErrorCode.PROJECT_INVALID,
        };
    }
    return undefined;
}

/**
 * The open demo deploys to this project: keep its stored title in step. No push — a
 * handler answers by returning (Pattern B) — so an open Integrations header shows the
 * new name the next time its destination is written or the screen loads. Other demos
 * on disk that use the same project keep their stored title until the same.
 */
async function syncOpenDemoTitle(context: HandlerContext, projectId: string, title: string): Promise<void> {
    const project = await context.stateManager.getCurrentProject();
    if (project?.adobe?.projectId !== projectId) return;
    project.adobe.projectTitle = title;
    await context.stateManager.saveProjectConfigOnly(project);
}

/** Rename an Adobe I/O project's title. Never throws. */
export async function handleRenameAdobeProject(
    context: HandlerContext,
    payload: RenameAdobeProjectRequestPayload,
): Promise<HandlerResponse> {
    const invalid = invalidRename(context, payload);
    if (invalid) return invalid;
    if (!context.authManager) {
        return { success: false, error: 'Authentication not available' };
    }
    const { orgId, projectId } = payload;
    const title = payload.title.trim();

    // Org gate — never act under a wrong-org context.
    const ctxResult = await resolveOrgContext(context, orgId);
    if (ctxResult.status !== 'ok') {
        return { ...(await sendOrgMismatch(context, 'rename-adobe-project', ctxResult)) };
    }

    const renamed = await context.authManager.renameRemoteProject(orgId, projectId, title);
    if (!renamed.ok) {
        context.logger.warn(`[Project] Adobe refused to rename ${projectId}: ${renamed.error}`);
        return {
            success: false,
            error: explainAdobeAccessFailure(renamed.error) ?? RENAME_FALLBACK,
        };
    }

    context.logger.info(`[Project] Renamed Adobe project ${projectId} to "${title}"`);
    await refreshProjects(context, orgId);
    await syncOpenDemoTitle(context, projectId, title);
    return { success: true, data: { projectId, title } };
}
