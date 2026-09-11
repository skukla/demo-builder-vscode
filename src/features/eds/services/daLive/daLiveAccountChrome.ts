/**
 * Account chrome — making the B2B account experience exist on the destination site.
 *
 * Two operations that share one job and belong to neither generic content copy nor
 * site duplication:
 *
 *   - `overlayAccountChrome` pulls `/customer/*` chrome from a SECOND content site
 *     on top of already-copied brand content, for hybrid packages whose brand and
 *     catalog live on one site while the B2B account experience is canonical
 *     elsewhere.
 *   - `createAuthPageStubs` writes empty block-shaped pages for auth surfaces the
 *     source does not have, so the dropin has somewhere to render.
 *
 * Both are about the AUTH surfaces named in `RUNTIME_SURFACES.authPages`; neither
 * is about copying a document because it exists.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-09-10, the second cut of that file
 * (1,082 lines against a 400-line service limit, and coupled). It follows the same
 * shape as `daLiveSpreadsheetCopy.ts`, the first cut: dependencies arrive as
 * parameters (ADR-015), the class keeps its public API and delegates.
 *
 * The difference from that cut is that these two need two of the class's own copy
 * primitives, so they arrive as an explicit `AccountChromeCollaborators` rather than
 * being reached through `this` — the same choice `helixBulkJobs` made for its auth
 * header provider, and for the same reason: an extraction that keeps reaching back
 * into the class is a move of text, not of responsibility.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack in a
 * separate Node process).
 *
 * @module features/eds/services/daLive/daLiveAccountChrome
 */

import type { PatchReport } from '../patches/patchReportHelper';
import { RUNTIME_SURFACES } from '../runtimeSurfaceInventory';
import type { DaLiveCopyResult } from '../types';
import type { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL } from './daLiveConstants';
import { resolveDaPath } from './daLiveContentHelpers';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/**
 * The two copy primitives the overlay borrows from `DaLiveContentCopy`.
 *
 * Typed to the real method signatures rather than loosely, so a change to either
 * one fails here at compile time instead of silently at a call boundary.
 */
export interface AccountChromeCollaborators {
    copySingleFile: (
        token: string,
        source: { org: string; site: string; preview?: boolean },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport,
        discoveredPaths?: Set<string>
    ) => Promise<boolean>;
    discoverAndCopyReferences: (
        source: { org: string; site: string },
        dest: { org: string; site: string },
        enumeratedPaths: string[],
        discoveredPaths: Set<string>,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport
    ) => Promise<string[]>;
}

/**
 * Overlay `/customer/*` account chrome from a second content source, on top of
 * already-copied brand content.
 *
 * Used by hybrid packages whose brand/catalog content lives on one site but whose
 * B2B account experience must come from the canonical B2B content site (B2B base +
 * brand overlay). Additive; pulls live from the public CDN (no fork); copies only
 * what exists on the account source (no stubs — the brand copy already created any
 * base stubs). Reference-following then pulls `/customer/nav` automatically.
 *
 * @param accountSource - The content site to source `/customer/*` chrome from.
 * @returns Copy result for the overlaid files (best-effort; never throws).
 */
export async function overlayAccountChrome(
    logger: Logger,
    apiClient: DaLiveApiClient,
    collaborators: AccountChromeCollaborators,
    accountSource: { org: string; site: string },
    destOrg: string,
    destSite: string,
    patchReport?: PatchReport,
): Promise<DaLiveCopyResult> {
    const baseUrl = `https://main--${accountSource.site}--${accountSource.org}.aem.live`;
    const dest = { org: destOrg, site: destSite };
    const discoveredPaths = new Set<string>();
    const copiedFiles: string[] = [];
    const failedFiles: { path: string; error: string }[] = [];

    // Entry points: the auth pages that actually exist on the account source.
    const entryPaths: string[] = [];
    for (const authPage of RUNTIME_SURFACES.authPages) {
        try {
            const probe = await fetch(`${baseUrl}${authPage.path}.plain.html`, {
                method: 'HEAD',
            });
            if (probe.ok) entryPaths.push(authPage.path);
        } catch {
            // Unreachable on the account source — skip.
        }
    }

    if (entryPaths.length === 0) {
        logger.warn(
            `[DA.live] Account-chrome overlay: no auth pages found on ${accountSource.org}/${accountSource.site}`,
        );
        return { success: true, copiedFiles, failedFiles, totalFiles: 0 };
    }

    const token = await apiClient.getImsToken();
    for (const path of entryPaths) {
        const ok = await collaborators.copySingleFile(
            token,
            accountSource,
            path,
            dest,
            path,
            undefined,
            undefined,
            patchReport,
            discoveredPaths,
        );
        if (ok) copiedFiles.push(path);
        else failedFiles.push({ path, error: 'Copy failed' });
    }

    // Follow references (pulls /customer/nav + any sub-fragments) from the account source.
    const discovered = await collaborators.discoverAndCopyReferences(
        accountSource,
        dest,
        entryPaths,
        discoveredPaths,
        undefined,
        undefined,
        patchReport,
    );
    copiedFiles.push(...discovered);

    logger.info(
        `[DA.live] Account-chrome overlay from ${accountSource.org}/${accountSource.site}: ${copiedFiles.join(', ') || '(none)'}`,
    );
    return {
        success: failedFiles.length === 0,
        copiedFiles,
        failedFiles,
        totalFiles: copiedFiles.length + failedFiles.length,
    };
}

/**
 * Create stub pages for auth pages missing on source. Returns how many stubs were
 * created; created paths are appended to `copiedFiles`.
 */
export async function createAuthPageStubs(
    logger: Logger,
    apiClient: DaLiveApiClient,
    destOrg: string,
    destSite: string,
    missingAuthPages: Array<{ path: string; blockClass: string }>,
    copiedFiles: string[],
): Promise<number> {
    let created = 0;
    // Each stub uses the correct block class so the dropin renders properly.
    if (missingAuthPages.length > 0) {
        const token = await apiClient.getImsToken();
        for (const { path: authPath, blockClass } of missingAuthPages) {
            try {
                const daPath = resolveDaPath(authPath, true);
                const stubHtml = [
                    '<body><header></header><main><div>',
                    `<div class="${blockClass}"><div><div></div></div></div>`,
                    '</div></main><footer></footer></body>',
                ].join('');
                const blob = new Blob([stubHtml], { type: 'text/html' });

                const destUrl = `${DA_LIVE_BASE_URL}/source/${destOrg}/${destSite}/${daPath}`;
                // DA.live write via the shared client (retry + fresh
                // FormData per attempt; 429 tolerated per stub).
                const response = await apiClient.fetchWithRetry(
                    destUrl,
                    () => {
                        const fd = new FormData();
                        fd.append('data', blob);
                        return {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                            body: fd,
                        };
                    },
                    { rateLimit: 'return' },
                );

                if (response.ok) {
                    copiedFiles.push(authPath);
                    created++;
                    logger.info(`[DA.live] Created stub page for ${authPath}`);
                } else {
                    logger.warn(
                        `[DA.live] Failed to create stub for ${authPath}: ${response.status}`,
                    );
                }
            } catch (error) {
                logger.warn(
                    `[DA.live] Failed to create stub for ${authPath}: ${(error as Error).message}`,
                );
            }
        }
    }
    return created;
}
