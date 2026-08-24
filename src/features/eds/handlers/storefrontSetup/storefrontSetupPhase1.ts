/**
 * Storefront Setup Phase 1: GitHub Repository
 *
 * Handles GitHub repository creation, existing repo selection, and
 * pre-created repo assignment for storefront setup.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupPhase1
 */

import { pinRepoToLkg } from '../../services/patches/lkgPinHelper';
import type { PatchReport } from '../../services/patches/patchReportHelper';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import { checkGitHubAppForExistingRepo } from './storefrontSetupPhaseHelpers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

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
    const useExistingRepo =
        repoMode === 'existing' && (edsConfig.selectedRepo || edsConfig.existingRepo);
    const usePreCreatedRepo = repoMode === 'new' && !!edsConfig.createdRepo;

    if (usePreCreatedRepo && edsConfig.createdRepo) {
        repoInfo.repoOwner = edsConfig.createdRepo.owner;
        repoInfo.repoName = edsConfig.createdRepo.name;
        repoInfo.repoUrl = edsConfig.createdRepo.url;

        logger.info(
            `[Storefront Setup] Using pre-created repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
        );
        await context.sendMessage('storefront-setup-progress', {
            phase: 'repository',
            message: 'Using repository...',
            subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
            progress: 10,
            ...repoInfo,
        } satisfies StorefrontSetupProgressPayload);

        // ADR-006 Step 4b applies here too: the wizard's "Create Repository"
        // button creates the repo BEFORE storefront setup runs, so this branch
        // sees the repo at template HEAD with no canonical patches applied.
        // Without the pin step, canonical-phase patches (e.g., b2b's
        // product-link-sku-encoding / product-link-sku-slash-encoding /
        // aem-assets-sku-sanitization) silently do NOT apply — only block-phase
        // patches (which run later in the pipeline) land. No-op for forked
        // storefronts (codePatchSource absent).
        await announcePinAndComplete(
            context,
            edsConfig,
            services,
            repoInfo,
            templateOwner,
            templateRepo,
            patchReport,
        );
    } else if (useExistingRepo) {
        return executePhaseExistingRepo(
            context,
            edsConfig,
            services,
            repoInfo,
            templateOwner,
            templateRepo,
            patchReport,
        );
    } else {
        await executePhaseNewRepo(
            context,
            edsConfig,
            services,
            repoInfo,
            signal,
            templateOwner,
            templateRepo,
            patchReport,
        );
    }

    return null;
}

/**
 * Wrap `pinIfThinLayer` with the surrounding "Pinning... → Repository ready"
 * progress messages so the wizard's repository phase tells a consistent
 * story for both the `usePreCreatedRepo` branch (repo created by the
 * wizard's "Create Repository" button before storefront setup runs) and
 * the `executePhaseNewRepo` branch (repo created inside Phase 1 itself).
 * Both paths land on a fresh template HEAD that needs the same Step 4b pin.
 *
 * Not used by `executePhaseExistingRepo` — that path has its own
 * "Resetting repository to template..." progress message and reset-vs-pin
 * branching, and is only reached when the user explicitly asked to reset
 * an already-populated repo.
 */
async function announcePinAndComplete(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    templateOwner: string,
    templateRepo: string,
    patchReport: PatchReport | undefined,
): Promise<void> {
    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository',
        message: 'Pinning to verified canonical state...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 12,
    } satisfies StorefrontSetupProgressPayload);
    await pinIfThinLayer(
        edsConfig,
        services,
        repoInfo,
        templateOwner,
        templateRepo,
        context.logger,
        patchReport,
    );
    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository',
        message: 'Repository ready',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 15,
        ...repoInfo,
    } satisfies StorefrontSetupProgressPayload);
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
    if (!edsConfig.codePatchSource || !edsConfig.codePatches) {
        // Logged, never silent. This guard disabled the whole code-patch
        // subsystem for every edit-mode run since before beta.121, and the
        // absence of any log is what hid it.
        logger.info(
            '[Storefront Setup] No code patches configured for this storefront — skipping patch step',
        );
        return;
    }
    const { repoOwner, repoName } = repoInfo;
    if (!repoOwner || !repoName) return; // Defensive — phases above populate both before this runs.
    await pinRepoToLkg(
        {
            repoOwner,
            repoName,
            templateOwner,
            templateRepo,
            codePatches: edsConfig.codePatches,
            codePatchSource: edsConfig.codePatchSource,
            patchReport,
        },
        services.githubFileOps,
        logger,
    );
}

/**
 * Handle existing repository setup (parse info, gate on the App, optional reset).
 *
 * WHERE the AEM Code Sync gate runs depends on whether the repo is being reset,
 * because that decides whether the question can be answered at all.
 *
 * - **No reset.** The repo is already a storefront, so Helix has a site and the
 *   status endpoint answers. The gate runs before the first write, which is the
 *   job it was moved here for: it used to run in Phase 2 (progress 28), after
 *   fstab.yaml, block collections and the vendored smart-404 / Quick Edit
 *   scripts had all landed in a repo the user asked to preserve.
 * - **Reset.** The repo is NOT a storefront yet, so there is no site and the
 *   endpoint returns `404 no such site` whatever the App is doing. The gate runs
 *   AFTER the reset, which is the first moment it can succeed.
 *
 * The reset case does give up the "learn before your repo is written to"
 * guarantee — but only where that guarantee was already hollow, since the check
 * could not have told them anything, and only where the user has explicitly
 * ticked reset and consented to the rewrite.
 *
 * Returning a result aborts the pipeline.
 *
 * @returns an early result when the App is missing or unverifiable, else null
 */
async function executePhaseExistingRepo(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices,
    repoInfo: RepoInfo,
    templateOwner: string,
    templateRepo: string,
    patchReport?: PatchReport,
): Promise<StorefrontSetupResult | null> {
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

    logger.info(
        `[Storefront Setup] Using existing repository: ${repoInfo.repoOwner}/${repoInfo.repoName}`,
    );
    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository',
        message: 'Using existing repository...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 5,
        ...repoInfo,
    } satisfies StorefrontSetupProgressPayload);

    // Check BEFORE the first write ONLY when the repo can already answer.
    //
    // `admin.hlx.page/status` reports on the SITE, not the App. A repo that is
    // not a storefront yet has no site, so it answers `404 no such site` however
    // the App is configured — measured on skukla/kukla-bodea 2026-08-20, where
    // the App was demonstrably installed (GitHub listed the repo) and the status
    // endpoint 404'd anyway, 28 minutes after a successful code-sync trigger.
    //
    // Checking a to-be-reset repo here therefore cannot succeed, and the failure
    // wears the one costume we keep having to remove: "install the App". So the
    // check moves below the reset for that case, where the repo has fstab.yaml
    // and Helix can finally answer.
    //
    // When the user DECLINED the reset the repo is already a storefront, so the
    // check both works and still does its original job — stopping Phase 2 from
    // writing into a repo they asked to preserve. It stays here for them.
    if (!edsConfig.resetToTemplate) {
        const appGateResult = await checkGitHubAppForExistingRepo(context, services, repoInfo);
        if (appGateResult) return appGateResult;
    }

    if (edsConfig.resetToTemplate) {
        logger.info('[Storefront Setup] Resetting repository to template...');
        await context.sendMessage('storefront-setup-progress', {
            phase: 'repository',
            message: 'Resetting repository to template...',
            subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
            progress: 6,
        } satisfies StorefrontSetupProgressPayload);

        if (edsConfig.codePatchSource) {
            // Thin-layer flow: bulk Tree reset to canonical@LKG + apply canonical
            // patches in the same atomic commit. Mirrors the dashboard reset action.
            await pinIfThinLayer(
                edsConfig,
                services,
                repoInfo,
                templateOwner,
                templateRepo,
                logger,
                patchReport,
            );
        } else {
            // Legacy/forked flow: simple resetToTemplate against template main.
            await services.githubRepoOps.resetToTemplate(
                repoInfo.repoOwner,
                repoInfo.repoName,
                templateOwner,
                templateRepo,
                'main',
                'chore: reset to template',
            );
        }
        logger.info('[Storefront Setup] Repository reset to template');

        // NOW the repo is a storefront, so the question is answerable. The reset
        // push is also what makes it answerable: the AEM Code Sync webhook fires
        // on that push and Helix registers the site, so `afterReset` lets the
        // resolver wait out the gap rather than read a not-yet-registered site as
        // a missing App.
        const appGateResult = await checkGitHubAppForExistingRepo(context, services, repoInfo, {
            afterReset: true,
        });
        if (appGateResult) return appGateResult;
    }

    await context.sendMessage('storefront-setup-progress', {
        phase: 'repository',
        message: 'Repository ready',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 15,
        ...repoInfo,
    } satisfies StorefrontSetupProgressPayload);

    return null;
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
        phase: 'repository',
        message: 'Creating GitHub repository from template...',
        subMessage: repoInfo.repoName,
        progress: 5,
    } satisfies StorefrontSetupProgressPayload);

    logger.info(`[Storefront Setup] Creating repository: ${repoInfo.repoName}`);

    // edsConfig.daLiveOrg is the namespace picked in the wizard. It serves
    // as the GitHub-side target for the new repo (personal user or team org)
    // and is the same value that DA.live writes target. Passing undefined
    // when daLiveOrg is empty preserves the legacy default of "create under
    // the authenticated user" — defensive against any state that escapes
    // the picker (e.g., direct invocation paths).
    const repo = await services.githubRepoOps.createFromTemplate(
        templateOwner,
        templateRepo,
        repoInfo.repoName,
        edsConfig.isPrivate ?? false,
        edsConfig.daLiveOrg || undefined,
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
        phase: 'repository',
        message: 'Waiting for repository content...',
        subMessage: `${repoInfo.repoOwner}/${repoInfo.repoName}`,
        progress: 10,
        ...repoInfo,
    } satisfies StorefrontSetupProgressPayload);

    await services.githubRepoOps.waitForContent(repoInfo.repoOwner, repoInfo.repoName, signal);

    // ADR-006 Step 4b: pin freshly-created thin-layer repos to LKG with
    // canonical-phase patches applied. `generate-from-template` produces at
    // canonical HEAD; this follow-up Tree reset brings the repo to byte-
    // identical parity with what a reset would produce. No-op for forked
    // storefronts (codePatchSource absent).
    await announcePinAndComplete(
        context,
        edsConfig,
        services,
        repoInfo,
        templateOwner,
        templateRepo,
        patchReport,
    );
}
