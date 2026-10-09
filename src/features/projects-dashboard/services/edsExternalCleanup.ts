/**
 * What deleting an EDS project removes ONLINE, once the SC has said which.
 *
 * Two resources, in this order: the DA.live site (through the shared storefront
 * teardown, which also takes the pages off the CDN and retires the site's Admin
 * API key), then the GitHub repository. Each asks for its own sign-in only when
 * it actually runs, and each records what happened on the cleanup results rather
 * than throwing, so one failure never stops the local delete.
 *
 * Split from `projectDeletionService.ts` on 2026-10-09 (EDS-8). Its sign-in checks
 * are not the reset's: DA.live wraps the shared `ensureDaLiveAuth` guard into a
 * skipped result, and GitHub asks for a `delete_repo` session, where the reset
 * checks the Code Sync App.
 */

import * as vscode from 'vscode';
import type { CleanupOptions } from './deletionConfirmation';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import { ensureDaLiveAuth as ensureDaLiveAuthShared, getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthService } from '@/features/eds/services/daLive/daLiveAuthService';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveTokenProviders';
import { HelixService } from '@/features/eds/services/helix/helixService';
import type { extractEdsMetadata, CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import type { ProductPageRemovalResult } from '@/features/eds/services/storefront/productPageRemoval';
import { otherProjectsPublishingTo } from '@/features/eds/services/storefront/sharedRepoProjects';
import { tearDownStorefront } from '@/features/eds/services/storefront/storefrontTeardown';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

/**
 * The four Helix calls the CDN-unpublish step makes, out of a class with dozens.
 */
export interface DeletionHelix {
    listAllPages(org: string, site: string, path?: string): Promise<string[]>;
    unpublishPages(
        org: string,
        site: string,
        branch: string,
        webPaths: string[],
    ): Promise<{
        success: boolean;
        count: number;
        total: number;
        liveFailed: number;
        previewFailed: number;
    }>;
    deleteAdminApiKey(org: string, site: string): Promise<{ success: boolean; error?: string }>;
    listPublishedPaths(org: string, site: string, branch: string, pattern: string): Promise<string[]>;
}

/**
 * Service seam. Defaults to the real Helix, built from the DA.live credential this
 * deletion holds; production never passes it.
 *
 * `HelixService` is STATELESS — credentials arrive at construction and are never
 * mutated — so ADR-015 leaves the construction here. What it cost was test design,
 * and in this file it cost more than that. The suite's module mock supplied
 * `unpublishAllContent`, a method the source stopped calling, and supplied no
 * `initKeyStore` STATIC — so the key-store init threw a TypeError on the first line
 * of the try block, the catch swallowed it as a warning, and every Helix call in
 * this path was unreachable while 23 tests passed. Measured 2026-08-31 by planting a
 * throw inside the try: the suite stayed green.
 *
 * `initKeyStore` rides here for the same reason: it is a side effect this path
 * performs, and a test needs to say whether it happened rather than have it fail
 * invisibly.
 */
export interface DeletionServices {
    initKeyStore?: (
        secrets: vscode.SecretStorage,
        globalState: vscode.Memento,
    ) => Promise<void>;
    makeHelix?: (
        logger: Logger,
        daLiveTokenProvider: { getAccessToken: () => Promise<string | null> },
    ) => DeletionHelix;
}

/**
 * Ensure DA.live authentication, prompting user if needed.
 * Returns the auth service if authenticated, or null if auth was declined/failed.
 *
 * Delegates to the shared ensureDaLiveAuth guard from edsHelpers,
 * then wraps the result to match the caller's expected signature.
 */
async function ensureDaLiveAuth(
    context: HandlerContext,
    resourceName: string,
    results: CleanupResultItem[],
): Promise<DaLiveAuthService | null> {
    const authResult = await ensureDaLiveAuthShared(context, '[Delete Project]');

    if (authResult.authenticated) {
        return getDaLiveAuthService(context.context);
    }

    results.push({
        type: 'daLive',
        name: resourceName,
        success: false,
        skipped: true,
        error: authResult.error || 'Authentication required',
    });
    return null;
}

/**
 * Delete DA.live site content and clean up config
 */
async function performDaLiveCleanup(
    context: HandlerContext,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    options: CleanupOptions,
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
    services?: DeletionServices,
): Promise<void> {
    if (!options.deleteDaLiveSite || !edsMetadata?.daLiveOrg || !edsMetadata?.daLiveSite) return;

    progress.report({ message: 'Deleting the DA.live site' });
    const resourceName = `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`;

    try {
        const daLiveAuthService = await ensureDaLiveAuth(context, resourceName, results);
        if (!daLiveAuthService) return;

        const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);

        // The same four steps the agent's cleanup runs, in the same order — the
        // CDN unpublish lived only here until 2026-09-19 (AI-9).
        const torn = await tearDownStorefront(
            {
                daLiveOrg: edsMetadata.daLiveOrg,
                daLiveSite: edsMetadata.daLiveSite,
                githubRepo: edsMetadata.githubRepo,
            },
            {
                tokenProvider: daLiveTokenProvider,
                logger: context.logger,
                initKeyStore: async () => {
                    const initKeyStore =
                        services?.initKeyStore ??
                        ((secrets: vscode.SecretStorage, globalState: vscode.Memento) =>
                            HelixService.initKeyStore(secrets, globalState));
                    await initKeyStore(context.context.secrets, context.context.globalState);
                },
                makeHelix: services?.makeHelix,
                otherProjectsOnRepo: (repo) =>
                    otherProjectsPublishingTo(context.stateManager, repo, options.projectPath),
                onStep: (step) => progress.report({ message: step }),
            },
        );
        reportProductPages(torn.productPages, edsMetadata.githubRepo ?? resourceName, results);

        // Only when pages actually came down: nothing was published means nothing
        // to report as cleaned up.
        if ((torn.unpublishedPages ?? 0) > 0 && !torn.stillPublished) {
            results.push({
                type: 'helix',
                name: edsMetadata.githubRepo ?? resourceName,
                success: true,
            });
        }

        results.push({
            type: 'daLive',
            name: resourceName,
            success: torn.contentDeleted,
            error: torn.error,
        });
    } catch (error) {
        context.logger.error('[Delete Project] DA.live cleanup failed', error as Error);
        results.push({
            type: 'daLive',
            name: resourceName,
            success: false,
            error: (error as Error).message,
        });
    }
}

/**
 * Put the product pages' outcome on the cleanup results (EDS-26). Clean removal is a
 * success row; anything short of it — refused, live-only, could not list — is shown with
 * its sentence, so "deleted" is never said over pages that may still be up.
 */
function reportProductPages(
    productPages: ProductPageRemovalResult | undefined,
    site: string,
    results: CleanupResultItem[],
): void {
    if (!productPages || productPages.status === 'nothing') return;
    const clean = productPages.status === 'removed';
    results.push({
        type: 'helix',
        name: `product pages, ${site}`,
        success: clean,
        ...(clean ? {} : { error: productPages.summary }),
    });
}

/**
 * Delete GitHub repository with authentication handling
 */
async function performGitHubCleanup(
    context: HandlerContext,
    githubRepo: string,
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
): Promise<void> {
    progress.report({ message: 'Deleting the repository' });

    try {
        const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');
        const { tokenService, repoLifecycle } = getGitHubServices(context.context.secrets);

        const existingToken = await tokenService.getToken();
        if (!existingToken) {
            const authenticated = await promptGitHubAuth(tokenService, githubRepo, results);
            if (!authenticated) return;
        }

        const [owner, repo] = githubRepo.split('/');
        if (!owner || !repo) {
            results.push({ type: 'github', name: githubRepo, success: false, error: 'Invalid repository name format' });
            return;
        }

        await repoLifecycle.deleteRepository(owner, repo);
        results.push({ type: 'github', name: githubRepo, success: true });
        context.logger.info(`[Delete Project] Deleted GitHub repository: ${githubRepo}`);
    } catch (error) {
        context.logger.error('[Delete Project] GitHub cleanup failed', error as Error);
        results.push({ type: 'github', name: githubRepo, success: false, error: (error as Error).message });
    }
}

/**
 * Prompt user for GitHub authentication. Returns true if authenticated.
 */
async function promptGitHubAuth(
    tokenService: { storeToken: (data: { token: string; tokenType: string; scopes: string[] }) => Promise<void> },
    githubRepo: string,
    results: CleanupResultItem[],
): Promise<boolean> {
    const selection = await askDuringOperation(
        'GitHub authentication required to delete the repository.',
        'Sign In',
    );

    if (selection !== 'Sign In') {
        results.push({ type: 'github', name: githubRepo, success: false, skipped: true, error: 'Authentication required' });
        return false;
    }

    try {
        const session = await vscode.authentication.getSession('github', ['repo', 'delete_repo'], { createIfNone: true });
        if (session) {
            await tokenService.storeToken({ token: session.accessToken, tokenType: 'bearer', scopes: ['repo', 'delete_repo'] });
        }
        return true;
    } catch {
        results.push({ type: 'github', name: githubRepo, success: false, skipped: true, error: 'Authentication failed' });
        return false;
    }
}

/**
 * Perform EDS external resource cleanup
 */
export async function performEdsCleanup(
    context: HandlerContext,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    options: CleanupOptions,
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
    services?: DeletionServices,
): Promise<void> {
    // 1. Delete DA.live site
    await performDaLiveCleanup(context, edsMetadata, options, results, progress, services);

    // 2. Delete GitHub repository
    if (options.deleteGitHubRepo && edsMetadata?.githubRepo) {
        await performGitHubCleanup(context, edsMetadata.githubRepo, results, progress);
    }
}
