/**
 * Storefront Setup Phase 1: GitHub Repository
 *
 * Handles GitHub repository creation, existing repo selection, and
 * pre-created repo assignment for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase1
 */

import { pinRepoToLkg } from '../services/lkgPinHelper';
import type { PatchReport } from '../services/patchReportHelper';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';

/**
 * Execute Phase 1: GitHub repository setup (create, use existing, or pre-created)
 */
export async function executePhaseGitHubRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    templateOwner: string,
    templateRepo: string,
    patchReport?: PatchReport,
): Promise<StorefrontSetupResult | null> {
    const logger = context.logger;
    if (signal.aborted) {
        throw new Error('Operation cancelled');
    }

    const repoMode = edsConfig.repoMode || 'new';
    const useExistingRepo = repoMode === 'existing' && (edsConfig.selectedRepo || edsConfig.existingRepo);
    const usePreCreatedRepo = repoMode === 'new' && !!edsConfig.createdRepo;

    if (usePreCreatedRepo && edsConfig.createdRepo) {
        repoInfo.repoOwner = edsConfig.createdRepo.owner;
        repoInfo.repoName = edsConfig.createdRepo.name;
        repoInfo.repoUrl = edsConfig.createdRepo.url;

        logger.info(`[Storefront Setup] Using pre-created repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`);
        await context.sendMessage('storefront-setup-progress', {
            phase: 'repository',
            message: `Using repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
            progress: 15,
            ...repoInfo,
        });
    } else if (useExistingRepo) {
        await executePhaseExistingRepo(context, edsConfig, services, repoInfo, templateOwner, templateRepo, patchReport);
    } else {
        await executePhaseNewRepo(context, edsConfig, services, repoInfo, signal, templateOwner, templateRepo, patchReport);
    }

    return null;
}

/**
 * Pin a thin-layer storefront's repo to LKG with canonical patches applied,
 * if `edsConfig.codePatchSource` is configured (i.e., the storefront is
 * thin-layer per ADR-006). No-op for forked storefronts. Errors propagate
 * — the caller decides whether to abort or proceed.
 */
async function pinIfThinLayer(
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    templateOwner: string,
    templateRepo: string,
    logger: HandlerContext['logger'],
    patchReport: PatchReport | undefined,
): Promise<void> {
    if (!edsConfig.codePatchSource || !edsConfig.codePatches) return;
    const { repoOwner, repoName } = repoInfo;
    if (!repoOwner || !repoName) return;  // Defensive — phases above populate both before this runs.
    await pinRepoToLkg(
        {
            repoOwner, repoName,
            templateOwner, templateRepo,
            codePatches: edsConfig.codePatches,
            codePatchSource: edsConfig.codePatchSource,
            patchReport,
        },
        services.githubFileOps,
        logger,
    );
}

/**
 * Handle existing repository setup (parse info, optional reset to template)
 */
async function executePhaseExistingRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    templateOwner: string,
    templateRepo: string,
    patchReport?: PatchReport,
): Promise<void> {
    const logger = context.logger;

    if (edsConfig.selectedRepo) {
        const selectedParts = edsConfig.selectedRepo.fullName.split('/');
        if (selectedParts.length !== 2 || !selectedParts[0] || !selectedParts[1]) {
            throw new Error('Selected repo fullName must be in owner/repo format');
        }
        const [owner, name] = selectedParts;
        repoInfo.repoOwner = owner;
        repoInfo.repoName = name;
        repoInfo.repoUrl = edsConfig.selectedRepo.htmlUrl;
    } else if (edsConfig.existingRepo) {
        const existingParts = edsConfig.existingRepo.split('/');
        if (existingParts.length !== 2 || !existingParts[0] || !existingParts[1]) {
            throw new Error('Existing repo must be in owner/repo format');
        }
        const [owner, name] = existingParts;
        repoInfo.repoOwner = owner;
        repoInfo.repoName = name;
        repoInfo.repoUrl = `https://github.com/${edsConfig.existingRepo}`;
    }

    logger.info(`[Storefront Setup] Using existing repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`);
    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository',
        message: `Using existing repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 5,
        ...repoInfo,
    });

    if (edsConfig.resetToTemplate) {
        logger.info('[Storefront Setup] Resetting repository to template...');
        await context.sendMessage('storefront-setup-progress', {
            phase: 'repository', message: 'Resetting repository to template...', progress: 6,
        });

        if (edsConfig.codePatchSource) {
            // Thin-layer flow: bulk Tree reset to canonical@LKG + apply canonical
            // patches in the same atomic commit. Mirrors the dashboard reset action.
            await pinIfThinLayer(edsConfig, services, repoInfo, templateOwner, templateRepo, logger, patchReport);
        } else {
            // Legacy/forked flow: simple resetToTemplate against template main.
            await services.githubRepoOps.resetToTemplate(
                repoInfo.repoOwner, repoInfo.repoName,
                templateOwner, templateRepo, 'main', 'chore: reset to template',
            );
        }
        logger.info('[Storefront Setup] Repository reset to template');
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository', message: 'Repository ready', progress: 15, ...repoInfo,
    });
}

/**
 * Handle new repository creation from template
 */
async function executePhaseNewRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    signal: AbortSignal,
    templateOwner: string,
    templateRepo: string,
    patchReport?: PatchReport,
): Promise<void> {
    const logger = context.logger;

    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository', message: 'Creating GitHub repository from template...', progress: 5,
    });

    logger.info(`[Storefront Setup] Creating repository: ${repoInfo.repoName}`);

    const repo = await services.githubRepoOps.createFromTemplate(
        templateOwner, templateRepo, repoInfo.repoName, edsConfig.isPrivate ?? false,
    );

    repoInfo.repoUrl = repo.htmlUrl;
    const createdParts = repo.fullName.split('/');
    if (createdParts.length !== 2 || !createdParts[0] || !createdParts[1]) {
        throw new Error('Created repo fullName must be in owner/repo format');
    }
    const [owner, name] = createdParts;
    repoInfo.repoOwner = owner;
    repoInfo.repoName = name;

    logger.info(`[Storefront Setup] Repository created: ${repoInfo.repoUrl}`);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository', message: 'Waiting for repository content...', progress: 10, ...repoInfo,
    });

    await services.githubRepoOps.waitForContent(repoInfo.repoOwner, repoInfo.repoName, signal);

    // ADR-006 Step 4b: pin freshly-created thin-layer repos to LKG with
    // canonical-phase patches applied. `generate-from-template` produces at
    // canonical HEAD; this follow-up Tree reset brings the repo to byte-
    // identical parity with what a reset would produce. No-op for forked
    // storefronts (codePatchSource absent).
    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository', message: 'Pinning to verified canonical state...', progress: 12,
    });
    await pinIfThinLayer(edsConfig, services, repoInfo, templateOwner, templateRepo, logger, patchReport);

    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository', message: 'Repository ready', progress: 15, ...repoInfo,
    });
}
