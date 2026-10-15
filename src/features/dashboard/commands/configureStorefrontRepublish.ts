/**
 * Configure's storefront Republish and the prompt that offers it (EDS-44).
 *
 * The prompt says when the store changed: the Republish it offers will then replace the
 * storefront's product and category pages with the new store's. The Republish reports
 * one stage per step — the config, then, only after a store change whose config the CDN
 * took, the store-change service's three (`storeScopePages.ts`) — and comes back with
 * that service's one sentence.
 *
 * It lives beside `configure.ts` rather than in it because that file is far past its
 * size limit. This file is the boundary: it fetches the session clients the
 * store-change service needs. `ConfigureProjectWebviewCommand` shows the outcome.
 *
 * @module features/dashboard/commands/configureStorefrontRepublish
 */

import { runPendingBlockLibraryWork, type BlockLibraryWorkParts } from './configureBlockLibraryExecutor';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { OperationOutcome, ReportStage } from '@/core/vscode/withOperationProgress';
import { ensureDaLiveAuth, getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveTokenProviders';
import {
    extractRepublishParams,
    republishStorefrontConfig,
    type RepublishResult,
} from '@/features/eds/services/storefront/storefrontRepublishService';
import { detectStorefrontChanges } from '@/features/eds/services/storefront/storefrontStalenessDetector';
import { hasCatalogPagesPending, isStoreScopeChange } from '@/features/eds/services/storefront/storeScopeChange';
import { replaceStoreScopePages } from '@/features/eds/services/storefront/storeScopePages';
import { createStoreScopePagesDeps } from '@/features/eds/services/storefront/storeScopePagesDeps';
import type { Project } from '@/types/base';

/** The same sentence on both prompts: what a store change does to the pages. */
const PAGES_REPLACED = "product and category pages are replaced with the new store's.";

/** Whether the saved settings name another store than the one the storefront last published. */
function storeChanged(project: Project): boolean {
    const { changedEnvVars } = detectStorefrontChanges(project, project.componentConfigs ?? {});
    return isStoreScopeChange(changedEnvVars ?? []);
}

/**
 * The words of the prompt that offers the storefront Republish after a save. The
 * buttons do not change; the pending block library work is added by the caller.
 *
 * @param project - the saved project
 * @param withMesh - the combined mesh and storefront prompt, rather than the storefront's own
 */
export function storefrontPrompt(project: Project, withMesh: boolean): string {
    const changed = storeChanged(project);
    if (withMesh) {
        return changed
            ? `The store changed. Apply changes to mesh and storefront? The storefront's ${PAGES_REPLACED}`
            : 'Configuration saved. Apply changes to mesh and storefront?';
    }
    return changed
        ? `The store changed. Republish the storefront? Its ${PAGES_REPLACED}`
        : 'Configuration saved. Republish storefront to apply changes.';
}

/** What a Configure Republish did. */
export interface ConfigureRepublishOutcome extends OperationOutcome {
    published: RepublishResult;
    /** After a store change: the one sentence on the new store's pages. */
    storePages?: string;
}

/** After a store change whose config the CDN took: the old store's pages out, the new store's in. */
async function replacePagesAfterStoreChange(
    project: Project,
    parts: BlockLibraryWorkParts,
    published: RepublishResult,
    report: ReportStage,
): Promise<string | undefined> {
    if (!published.success || published.cdnError || !hasCatalogPagesPending(project)) return undefined;
    // The storefront the config was just published to, read the same way.
    const target = extractRepublishParams(project);
    if (!target.success) return undefined;
    const { context, stateManager, logger } = parts;
    const { tokenService, fileOperations } = getGitHubServices(context.secrets);
    const deps = createStoreScopePagesDeps({
        project,
        target: {
            repoOwner: target.repoOwner,
            repoName: target.repoName,
            daLiveOrg: target.daLiveOrg,
            daLiveSite: target.daLiveSite,
        },
        daLiveTokenProvider: createDaLiveServiceTokenProvider(getDaLiveAuthService(context)),
        githubTokenService: tokenService,
        githubFiles: fileOperations,
        stateManager,
        persist: (p) => stateManager.saveProject(p),
        logger,
    });
    const { sentence } = await replaceStoreScopePages(project, deps, report);
    return sentence;
}

/**
 * Configure's Republish: the pending block library work (EDS-39), the config, and —
 * after a store change — the pages.
 *
 * @param project - the saved project
 * @param parts - what the command builds its collaborators from
 * @param report - where each stage is shown (`withOperationProgress`)
 */
export async function republishFromConfigure(
    project: Project,
    parts: BlockLibraryWorkParts,
    report: ReportStage,
): Promise<ConfigureRepublishOutcome> {
    const { context, stateManager, logger } = parts;
    // Block libraries first (EDS-39): add what is selected, remove what is not.
    await runPendingBlockLibraryWork(project, parts, (line) => report(line));

    const stage = OPERATION_STAGES.publishingConfig.label;
    report(stage);
    const published = await republishStorefrontConfig({
        persist: (p) => stateManager.saveProject(p),
        project,
        secrets: context.secrets,
        logger,
        onProgress: (message) => report(stage, message),
        // The CDN publish needs the DA.live session (PL-76). Without it the push
        // reached GitHub and the CDN kept the old config.
        ensureDaLiveSession: () => ensureDaLiveAuth({ context, logger }, '[Configure]'),
    });

    const storePages = await replacePagesAfterStoreChange(project, parts, published, report);
    return {
        success: published.success,
        ...(published.error ? { error: published.error } : {}),
        published,
        ...(storePages ? { storePages } : {}),
    };
}
