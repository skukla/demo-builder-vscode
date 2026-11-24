/**
 * Writes to a DA.live site's own config: the AEM Assets binding, the editor
 * row, and the user's site permissions.
 *
 * All of it targets `/config/<org>/<site>` for one project, and all of it is
 * non-fatal by design — a demo whose Assets panel is missing is worse than a
 * demo that failed to build, so these log and carry on rather than throw.
 *
 * @module features/eds/handlers/daLive/daLiveSiteConfig
 */

import * as vscode from 'vscode';
import { DaLiveConfigService } from '../../services/daLive/daLiveConfigService';
import { DaLiveContentOperations } from '../../services/daLive/daLiveContentOperations';
import { type TokenProvider } from '../../services/daLive/daLiveOrgOperations';
import { DaLiveAuthError } from '../../services/types';
import { getEwCanvasBranch, resolveAuthoringExperience } from '../authoringExperience';
import { maskEmail } from '@/core/utils/maskEmail';
import type { AuthoringExperience } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Build the site-scoped `editor.path` row value for the active experience.
 *
 * - Experience Workspace: the da.live-native canvas, pinned to the supplied
 *   ewCanvasBranch (the `?nx=` override); the row is always written when the
 *   project is set to EW. An empty branch drops the override.
 * - DA.live Classic: no row. da.live opens its own document editor when the
 *   site config names none.
 *
 * Returns undefined when there is no row to write (DA.live Classic).
 */
function buildEditorPathValue(
    experience: AuthoringExperience,
    ewCanvasBranch: string,
): string | undefined {
    if (experience !== 'experience-workspace') return undefined;
    // `?nx=<branch>` pins the canvas to a pre-release da-nx branch while EW is
    // in early access; an empty branch drops to `https://da.live/canvas#`
    // (the documented production form). Mirrors getEdsDaLiveUrl's EW form.
    const nxParam = ewCanvasBranch ? `?nx=${ewCanvasBranch}` : '';
    return `https://da.live/canvas${nxParam}#`;
}

/**
 * Apply DA.live site config settings from extension settings.
 *
 * Reads the AEM Author URL (demoBuilder.daLive.aemAuthorUrl) and the project's
 * authoring experience, and applies them to the DA.live site config sheet.
 *
 * Clears a stale `editor.path` row symmetrically: DA.live Classic has no row to
 * write, so a prior Experience Workspace canvas row, or the Universal Editor
 * row older Classic projects carry, is removed (via applySiteConfig's
 * `removeKeys`) rather than left behind.
 *
 * This should be called from all EDS flows: creation, reset, edit, import, copy.
 * Non-fatal: logs warnings on failure but does not throw.
 */
export async function applyDaLiveOrgConfigSettings(
    daLiveContentOps: DaLiveContentOperations,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
    experience: AuthoringExperience = resolveAuthoringExperience(undefined),
): Promise<void> {
    try {
        const edsSettings = vscode.workspace.getConfiguration('demoBuilder.daLive');
        const aemAuthorUrl = edsSettings.get<string>('aemAuthorUrl');

        // Both keys land in the SAME per-site config (/config/<org>/<site>), so
        // collect them and write once — one GET-merge-POST round-trip, no window
        // for a concurrent writer to slip between two separate writes.
        //   - aem.repositoryId: da.live's Library reads the AEM Assets binding
        //     from the per-site config.
        //   - editor.path: site-scoped, keyed on /<org>/<site>, so flipping one
        //     project's authoring experience never clobbers a sibling site's row.
        const updates: Record<string, string> = {};
        const removeKeys: string[] = [];
        if (aemAuthorUrl) {
            updates['aem.repositoryId'] = aemAuthorUrl;
        } else {
            // Symmetric with editor.path below. Without this, clearing
            // `aemAuthorUrl` left the previous binding on the site for good —
            // a state the extension could create and then never undo.
            removeKeys.push('aem.repositoryId');
        }
        const ewCanvasBranch = getEwCanvasBranch();
        const editorValue = buildEditorPathValue(experience, ewCanvasBranch);
        if (editorValue) {
            updates['editor.path'] = `/${daLiveOrg}/${daLiveSite}=${editorValue}`;
        } else {
            // DA.live Classic → there is no row to write, but da.live may hold a
            // stale Experience Workspace canvas row from a prior flip, or the
            // Universal Editor row Classic wrote before EDS-71. The correct state
            // is NO editor.path row, so clear it. (applySiteConfig's no-op
            // optimization absorbs the case where no stale row exists.)
            removeKeys.push('editor.path');
        }

        // No "nothing to do" early return: there cannot be one. `aemAuthorUrl`
        // either has a value (an update) or does not (a removal), so one of the
        // two lists is always non-empty and the guard that used to sit here was
        // unreachable by construction.
        const appliedKeys = Object.keys(updates);

        const result = await daLiveContentOps.configOps.applySiteConfig(
            daLiveOrg,
            daLiveSite,
            updates,
            removeKeys,
        );
        // Name the AEM host, not just the key. `aemAuthorUrl` ships with a
        // DEFAULT, so "aem.repositoryId was applied" is true for every user and
        // tells nobody which repository they were bound to — a colleague's
        // missing Assets panel could not be told apart from a wrong host without
        // asking her to read her own settings. The value is a hostname already
        // published in package.json, so logging it discloses nothing new.
        const boundHost = updates['aem.repositoryId'];
        const summary = [
            appliedKeys.length ? `Applied: ${appliedKeys.join(', ')}` : '',
            boundHost ? `AEM Assets bound to ${boundHost}` : '',
            removeKeys.length ? `Cleared: ${removeKeys.join(', ')}` : '',
        ]
            .filter(Boolean)
            .join('; ');
        if (result.success) {
            logger.info(`[EDS Config] ${summary}`);
            // Losing the Assets panel because a setting is unset is the same
            // silent failure the rest of this branch exists to fix — it removed a
            // working binding from a live site within an hour of the no-default
            // change, and said so only at info level.
            //
            // Gated on what was ACTUALLY removed, not on what was asked for: a
            // site that never had a binding has lost nothing, and warning there
            // would train people to ignore the message that matters.
            if (result.removed?.includes('aem.repositoryId')) {
                logger.warn(
                    "[EDS Config] Removed this site's AEM Assets binding because " +
                        'demoBuilder.daLive.aemAuthorUrl is not set — the Assets panel will ' +
                        'no longer appear in da.live. Set it (bare host, e.g. ' +
                        'author-pXXXXX-eYYYYY.adobeaemcloud.com) and re-run to restore it.',
                );
            }
        } else {
            logger.warn(`[EDS Config] Failed to apply settings (${summary}): ${result.error}`);
        }
    } catch (error) {
        logger.warn(`[EDS Config] Error: ${(error as Error).message}`);
    }
}

/**
 * Configure DA.live site permissions for the user.
 *
 * Grants the user CONFIG and content write permissions via DA.live Config API.
 * This enables document editing and site management in DA.live.
 *
 * This should be called from all EDS flows: creation, reset, republish.
 * Non-fatal: logs warnings on failure but does not throw, except for an expired DA.live
 * sign-in (`DaLiveAuthError`), which every later DA.live step would hit too (EDS-54).
 *
 * @param tokenProvider - Token provider for DA.live API authentication
 * @param daLiveOrg - DA.live organization name
 * @param daLiveSite - DA.live site name
 * @param userEmail - User email to grant permissions to
 * @param logger - Logger instance
 * @returns Result with success status and optional error message
 */
export async function configureDaLivePermissions(
    tokenProvider: TokenProvider,
    daLiveOrg: string,
    daLiveSite: string,
    userEmail: string,
    logger: Logger,
): Promise<{ success: boolean; error?: string }> {
    try {
        const daLiveConfigService = new DaLiveConfigService(tokenProvider, logger);
        const result = await daLiveConfigService.grantUserAccess(daLiveOrg, daLiveSite, userEmail);
        if (result.success) {
            // `info` IS buffered into the debug export; mask like the rest of the batch.
            logger.info(`[DaLivePermissions] Configured for ${maskEmail(userEmail)}`);
        } else {
            logger.warn(`[DaLivePermissions] Warning: ${result.error}`);
        }
        return result;
    } catch (error) {
        // The one failure that is not "non-fatal": an expired sign-in fails every DA.live
        // step after this one too (EDS-54).
        if (error instanceof DaLiveAuthError) throw error;
        const errorMessage = (error as Error).message;
        logger.warn(`[DaLivePermissions] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
