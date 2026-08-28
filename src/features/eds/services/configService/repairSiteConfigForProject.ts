/**
 * Assemble the dependencies {@link repairSiteConfig} needs, for one project.
 *
 * ## Why this is its own module
 *
 * {@link repairSiteConfig} is deliberately pure — it takes a
 * `ConfigurationService`, a token provider, an email and an overlay resolver,
 * and touches no VS Code API. That is what makes it testable without a DA.live
 * round trip. But it also means every caller has to build those five things,
 * and there is exactly one correct way to build them.
 *
 * The `Repair Site Configuration` command was the only caller and assembled
 * them inline. Adding a second one (the MCP tool) meant either duplicating the
 * assembly or extracting it. Duplicated, the two would drift on the one detail
 * below that fails silently.
 *
 * ## The detail that fails silently
 *
 * The VS Code setting wins, but the demo package's own `byomOverlayUrl` is the
 * fallback when that setting is blank or invalid. Without it, a blanked setting
 * registers the site with NO overlay — and the read-back then reports
 * `verified`, because there was no overlay to look for. A caller that forgot
 * this would report a successful repair on a storefront that still cannot serve
 * a product detail page.
 *
 * ## What stays with the caller
 *
 * Progress REPORTING. This module forwards `onProgress` and knows nothing about
 * notifications, so the command can render `withProgress` and a tool can drop
 * the messages on the floor.
 *
 * @module features/eds/services/configService/repairSiteConfigForProject
 */

import type * as vscode from 'vscode';
import { getDaLiveAuthService, resolveByomOverlayConfig } from '@/features/eds/handlers/edsHelpers';
import { ConfigurationService } from '@/features/eds/services/configService/configurationService';
import {
    repairSiteConfig,
    type RepairSiteConfigResult,
} from '@/features/eds/services/configService/repairSiteConfigHeadless';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveContentOperations';
import { resolveStorefrontConfig } from '@/features/eds/services/reset/edsResetParams';
import {
    findStorefrontNameMismatch,
    migrateStorefrontNameForProject,
} from '@/features/eds/services/storefront/storefrontNameMigrationForProject';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/**
 * Re-run one project's Configuration Service registration.
 *
 * @param project - the project whose storefront config needs repairing
 * @param context - extension context, for the DA.live credential
 * @param logger - where the registrar writes its protocol trace
 * @param onProgress - optional; receives the registrar's own step messages
 * @returns the headless service's result, unchanged
 */
export async function repairSiteConfigForProject(
    project: Project,
    context: vscode.ExtensionContext,
    logger: Logger,
    persist: (project: Project) => Promise<unknown>,
    onProgress?: (message: string) => void | Promise<void>,
): Promise<RepairSiteConfigResult> {
    // Migrate-first (decided 2026-08-23): on an unmigrated legacy project the
    // manifest's daLiveSite differs from the repo name, and registering off it
    // repairs the storefront INTO the mismatched state — repair was the last
    // path that skipped the heal reset already runs. Run the same migration
    // first; a failed migration aborts, because a repair that re-registers the
    // broken name is not a repair. This can rename the DA site and delete the
    // old site root — the repair surfaces' copy says so.
    const mismatch = findStorefrontNameMismatch(project);
    if (mismatch) {
        const migration = await migrateStorefrontNameForProject(
            mismatch,
            context,
            logger,
            persist,
            onProgress,
        );
        if (!migration.migrated) {
            return {
                status: 'failed',
                verified: false,
                error: `storefront name migration failed before repair: ${migration.error ?? 'unknown'}`,
            };
        }
    }

    const { byomOverlayUrl } = resolveStorefrontConfig(project);
    const daLiveAuth = getDaLiveAuthService(context);
    const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuth);
    const userEmail = await daLiveAuth.getUserEmail();

    return repairSiteConfig({
        project,
        configurationService: new ConfigurationService(tokenProvider, logger),
        tokenProvider,
        logger,
        userEmail: userEmail || undefined,
        resolveOverlayUrl: (org, site) => resolveByomOverlayConfig(byomOverlayUrl, org, site),
        onProgress,
    });
}
