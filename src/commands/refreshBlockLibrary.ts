/**
 * RefreshBlockLibraryCommand
 *
 * Dashboard kebab action (EDS-only) that re-syncs the DA.live authoring library
 * with the project's current `component-definition.json`. This is the destructive
 * full-rebuild path — for users who hand-edit `component-definition.json` outside
 * the AI promote flow and need the library to catch up.
 *
 * Runs `executeEdsPipeline` with:
 *   - `includeBlockLibrary: true` — build the DA.live library
 *   - `skipContent: true` — do NOT touch demo content (this is library-only)
 *   - `skipPublish: false` — publish the library so the change is live
 *
 * Recovery: on `DaLiveAuthError` (token expired mid-pipeline), prompts the user
 * to re-authenticate and retries the pipeline exactly once. Mirrors the proven
 * `edsResetService.runContentPipeline` retry pattern, scaled down to a single
 * retry (we are not running the full reset).
 *
 * Runs in the extension host (uses vscode-coupled services), NOT the MCP server.
 */

import { BaseCommand } from '@/core/base';
import { getLogger } from '@/core/logging';
import { ensureDaLiveAuth, getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import {
    createDaLiveServiceTokenProvider,
    DaLiveContentOperations,
} from '@/features/eds/services/daLiveContentOperations';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { extractResetParams } from '@/features/eds/services/edsResetParams';
import { HelixService } from '@/features/eds/services/helixService';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { HandlerContext } from '@/types/handlers';

const LOG_PREFIX = '[RefreshBlockLibrary]';

export class RefreshBlockLibraryCommand extends BaseCommand {
    public async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            await this.showWarning('No project loaded.');
            return;
        }

        const paramsResult = extractResetParams(project);
        if (!paramsResult.success) {
            await this.showError(`Cannot refresh block library: ${paramsResult.error}`);
            return;
        }
        const params = paramsResult.params;

        // Minimal HandlerContext for the auth retry helper — `ensureDaLiveAuth`
        // only reads `context` (ExtensionContext) and `logger`.
        const handlerContext = {
            context: this.context,
            logger: this.logger,
        } as unknown as HandlerContext;

        const daLiveAuthService = getDaLiveAuthService(this.context);
        const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
        const daLiveContentOps = new DaLiveContentOperations(tokenProvider, this.logger);
        const { tokenService: githubTokenService, fileOperations: githubFileOps } = getGitHubServices(handlerContext);
        const helixService = new HelixService(this.logger, githubTokenService, tokenProvider);

        try {
            await this.withProgress('Refreshing block library', async (progress) => {
                const reportProgress = (info: { operation: string; message: string }): void => {
                    progress.report({ message: info.message });
                };

                let attempt = 0;
                const maxRetries = 1;
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
                            { daLiveContentOps, githubFileOps, helixService, logger: this.logger },
                            reportProgress,
                        );

                        if (!result.success) {
                            throw new Error(result.error || 'Block library refresh failed');
                        }
                        return;
                    } catch (error) {
                        if (error instanceof DaLiveAuthError && attempt < maxRetries) {
                            attempt++;
                            this.logger.warn(`${LOG_PREFIX} DA.live token expired, attempting re-auth (attempt ${attempt})`);
                            progress.report({ message: 'DA.live session expired. Please re-authenticate...' });
                            const authResult = await ensureDaLiveAuth(handlerContext, LOG_PREFIX);
                            if (!authResult.authenticated) {
                                throw new Error(authResult.cancelled
                                    ? 'Refresh cancelled — DA.live re-authentication required'
                                    : `DA.live re-authentication failed: ${authResult.error}`);
                            }
                            progress.report({ message: 'Resuming block library refresh...' });
                            continue;
                        }
                        throw error;
                    }
                }
            });

            await this.showSuccessMessage('Block library refreshed.');
        } catch (error) {
            const logger = getLogger();
            logger.error(`${LOG_PREFIX} failed: ${error instanceof Error ? error.message : String(error)}`);
            await this.showError(
                `Failed to refresh block library: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }
}
