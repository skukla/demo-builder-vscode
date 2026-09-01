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
import { getEwCanvasBranch } from '../authoringExperience';
import { maskEmail } from '@/core/utils/maskEmail';
import type { AuthoringExperience } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Build the site-scoped `editor.path` row value for the active experience.
 *
 * - Experience Workspace: the da.live-native canvas, pinned to the supplied
 *   ewCanvasBranch (the `?nx=` override); the row is always written when the
 *   project is set to EW. An empty branch drops the override.
 * - Universal Editor: punches out to experience.adobe.com and embeds the IMS org
 *   id, so it is only written when `demoBuilder.daLive.IMSOrgId` is configured.
 *
 * Returns undefined when there is no row to write (UE with no IMS org id).
 */
function buildEditorPathValue(
    experience: AuthoringExperience,
    imsOrgId: string | undefined,
    daLiveOrg: string,
    daLiveSite: string,
    ewCanvasBranch: string,
): string | undefined {
    if (experience === 'experience-workspace') {
        // `?nx=<branch>` pins the canvas to a pre-release da-nx branch while EW is
        // in early access; an empty branch drops to `https://da.live/canvas#`
        // (the documented production form). Mirrors getEdsDaLiveUrl's EW form.
        const nxParam = ewCanvasBranch ? `?nx=${ewCanvasBranch}` : '';
        return `https://da.live/canvas${nxParam}#`;
    }
    if (imsOrgId) {
        return (
            `https://experience.adobe.com/#/@${imsOrgId}` +
            `/aem/editor/canvas/main--${daLiveSite}--${daLiveOrg}.ue.da.live`
        );
    }
    return undefined;
}

/**
 * Apply DA.live org config settings from extension settings.
 *
 * Reads the AEM Author URL and IMS Org ID from VS Code settings
 * (demoBuilder.daLive.aemAuthorUrl and demoBuilder.daLive.IMSOrgId)
 * and applies them to the DA.live site config sheet.
 *
 * Also clears a stale `editor.path` row symmetrically: flipping to Universal
 * Editor with no IMS org id has no row to write, so the prior Experience
 * Workspace canvas value is removed (via applySiteConfig's `removeKeys`) rather
 * than left behind.
 *
 * This should be called from all EDS flows: creation, reset, edit, import, copy.
 * Non-fatal: logs warnings on failure but does not throw.
 */
export async function applyDaLiveOrgConfigSettings(
    daLiveContentOps: DaLiveContentOperations,
    daLiveOrg: string,
    daLiveSite: string,
    logger: Logger,
    experience: AuthoringExperience = 'da-live-classic',
): Promise<void> {
    try {
        const edsSettings = vscode.workspace.getConfiguration('demoBuilder.daLive');
        const aemAuthorUrl = edsSettings.get<string>('aemAuthorUrl');
        const imsOrgId = edsSettings.get<string>('IMSOrgId');

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
        const editorValue = buildEditorPathValue(
            experience,
            imsOrgId,
            daLiveOrg,
            daLiveSite,
            ewCanvasBranch,
        );
        if (editorValue) {
            updates['editor.path'] = `/${daLiveOrg}/${daLiveSite}=${editorValue}`;
        } else {
            // UE with no IMS org id → there is no row to write, but da.live may
            // hold a stale Experience Workspace canvas row from a prior flip. The
            // correct state is NO editor.path row, so clear it. (applySiteConfig's
            // no-op optimization absorbs the case where no stale row exists.)
            removeKeys.push('editor.path');
        }

        const appliedKeys = Object.keys(updates);
        if (appliedKeys.length === 0 && removeKeys.length === 0) {
            // Truly nothing to do. Logged (not silent) so a no-op flip is diagnosable.
            logger.debug('[EDS Config] No DA.live config to apply or clear; skipping.');
            return;
        }

        const result = await daLiveContentOps.applySiteConfig(
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
 * This enables Universal Editor access and site management capabilities.
 *
 * This should be called from all EDS flows: creation, reset, republish.
 * Non-fatal: logs warnings on failure but does not throw.
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
        const errorMessage = (error as Error).message;
        logger.warn(`[DaLivePermissions] Error: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}
