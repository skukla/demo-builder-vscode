/**
 * Refresh Block Library — shared, UI-free core.
 *
 * Re-syncs the DA.live authoring library with the project's current
 * `component-definition.json` (the destructive full-rebuild path, for users who
 * hand-edit `component-definition.json` outside the AI promote flow). Runs
 * `executeEdsPipeline` with `includeBlockLibrary: true` / `skipContent: true` /
 * `skipPublish: false`, retrying once on a mid-pipeline DA.live token expiry.
 *
 * Two callers share this core:
 *   - `RefreshBlockLibraryCommand` — the dashboard kebab action, which wraps it
 *     in a progress notification and success/error toasts.
 *   - `handleRefreshBlockLibraryHeadless` — the `refresh_block_library` MCP tool,
 *     which returns the real result to the agent (not merely "dispatched").
 *
 * Runs in the extension host (uses vscode-coupled services), NOT the MCP proxy.
 */

import type * as vscode from 'vscode';
import {
    ensureDaLiveAuth,
    getDaLiveAuthService,
    getGitHubServices,
} from '@/features/eds/handlers/edsHelpers';
import {
    createDaLiveServiceTokenProvider,
    DaLiveContentOperations,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { extractResetParams } from '@/features/eds/services/reset/edsResetParams';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

const LOG_PREFIX = '[RefreshBlockLibrary]';
const MAX_RETRIES = 1;

/** Result of a headless block-library refresh. */
export interface RefreshBlockLibraryHeadlessResult {
    success: boolean;
    /** User-facing failure reason (absent on success). */
    error?: string;
    /** True when the user cancelled the mid-pipeline DA.live re-auth. */
    cancelled?: boolean;
    /** Rebuilt library paths (present on success). */
    libraryPaths?: string[];
}

/** Dependencies for {@link refreshBlockLibraryHeadless}. */
export interface RefreshBlockLibraryHeadlessDeps {
    project: Project;
    /** Extension context — needed to resolve DA.live/GitHub services. */
    context: vscode.ExtensionContext;
    logger: Logger;
    /** Progress messages (the command bridges these to a progress notification). */
    onProgress?: (message: string) => void;
}

/**
 * Rebuild the DA.live block library for `project`, UI-free.
 *
 * Returns the ACTUAL outcome — success with library paths, a cancelled flag when
 * the user declined re-auth, or an error message. The only interactive point is
 * the mid-pipeline DA.live re-auth on token expiry (same conditionally-headless
 * pattern as the mesh deploy's Adobe sign-in): it prompts only when the token
 * has expired, and passes silently otherwise.
 */
export async function refreshBlockLibraryHeadless(
    deps: RefreshBlockLibraryHeadlessDeps,
): Promise<RefreshBlockLibraryHeadlessResult> {
    const { project, context, logger, onProgress } = deps;

    const paramsResult = extractResetParams(project);
    if (!paramsResult.success) {
        return { success: false, error: `Cannot refresh block library: ${paramsResult.error}` };
    }
    const params = paramsResult.params;

    // ensureDaLiveAuth and getGitHubServices declare narrowed parameters
    // (exactly the fields they read), so this partial context needs no cast.
    const handlerContext = { context, logger };

    const daLiveAuthService = getDaLiveAuthService(context);
    const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
    const daLiveContentOps = new DaLiveContentOperations(tokenProvider, logger);
    const { tokenService: githubTokenService, fileOperations: githubFileOps } =
        getGitHubServices(handlerContext);
    const helixService = new HelixService(logger, githubTokenService, tokenProvider);

    const reportProgress = (info: { operation: string; message: string }): void => {
        onProgress?.(info.message);
    };

    // Deliberately NOT withDaLiveAuthRetry (daLiveAuthRetry.ts), examined
    // 2026-08-22: that wrapper THROWS on a failed re-auth, collapsing "user
    // cancelled" and "re-auth failed" into one Error whose message a caller
    // would have to parse. This headless service's contract is result objects
    // with a typed `cancelled` flag (the MCP tool surfaces it), so the loop
    // stays local. The retry SEMANTICS match the wrapper's on purpose: only
    // DaLiveAuthError retries, bounded attempts, re-auth via ensureDaLiveAuth.
    let attempt = 0;
    while (true) {
        try {
            const result = await executeEdsPipeline(
                {
                    repoOwner: params.repoOwner,
                    repoName: params.repoName,
                    daLiveOrg: params.daLiveOrg,
                    daLiveSite: params.daLiveSite,
                    templateOwner: params.templateOwner,
                    templateRepo: params.templateRepo,
                    includeBlockLibrary: true,
                    skipContent: true,
                    skipPublish: false,
                    // Load-bearing: pass an empty array (truthy in JS) so
                    // executeEdsPipeline rebuilds from the USER's repo's
                    // component-definition.json — not the template's. Blocks
                    // promoted via the MCP tool live there. Without this flag,
                    // the rebuild reads the template comp-def and silently
                    // drops every promoted block from the library.
                    blockCollectionIds: [],
                },
                { daLiveContentOps, githubFileOps, helixService, logger },
                reportProgress,
            );

            if (!result.success) {
                return { success: false, error: result.error || 'Block library refresh failed' };
            }
            return { success: true, libraryPaths: result.libraryPaths };
        } catch (error) {
            if (error instanceof DaLiveAuthError && attempt < MAX_RETRIES) {
                attempt++;
                logger.warn(
                    `${LOG_PREFIX} DA.live token expired, attempting re-auth (attempt ${attempt})`,
                );
                onProgress?.('DA.live session expired. Please re-authenticate...');
                const authResult = await ensureDaLiveAuth(handlerContext, LOG_PREFIX);
                if (!authResult.authenticated) {
                    return authResult.cancelled
                        ? {
                              success: false,
                              cancelled: true,
                              error: 'Refresh cancelled — DA.live re-authentication required',
                          }
                        : {
                              success: false,
                              error: `DA.live re-authentication failed: ${authResult.error}`,
                          };
                }
                onProgress?.('Resuming block library refresh...');
                continue;
            }
            logger.error(
                `${LOG_PREFIX} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}
