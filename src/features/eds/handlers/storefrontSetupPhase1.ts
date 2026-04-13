/**
 * Storefront Setup Phase 1: GitHub Repository
 *
 * Handles GitHub repository creation, existing repo selection, and
 * pre-created repo assignment for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetupPhase1
 */

import type { HandlerContext } from '@/types/handlers';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';

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
        await executePhaseExistingRepo(context, edsConfig, services, repoInfo, templateOwner, templateRepo);
    } else {
        await executePhaseNewRepo(context, edsConfig, services, repoInfo, signal, templateOwner, templateRepo);
    }

    return null;
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

        await services.githubRepoOps.resetToTemplate(
            repoInfo.repoOwner, repoInfo.repoName,
            templateOwner, templateRepo, 'main', 'chore: reset to template',
        );
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

    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository', message: 'Repository ready', progress: 15, ...repoInfo,
    });
}
