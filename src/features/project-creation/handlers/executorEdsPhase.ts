/**
 * Project Creation — the EDS phases.
 *
 * Post-clone metadata population (Phase 2 tail), config.json sync to GitHub +
 * CDN (Phase 5), and DA.live content setup with the B2B-readiness advisory
 * (Phase 5b). Extracted from `executor.ts` (2026-08-23 god-file
 * decomposition).
 *
 * @module features/project-creation/handlers/executorEdsPhase
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureEdsContent } from '../services';
import type { ProgressTracker } from './shared';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';
import { COMPONENT_IDS } from '@/core/constants';
import { parseGitHubUrl } from '@/core/utils';
import { detectB2bReadiness } from '@/features/eds/services/b2bReadinessDetection';
import { extractConfigParamsFromConfigs } from '@/features/eds/services/configGenerator';
import { syncConfigToRemote } from '@/features/eds/services/configSyncService';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/**
 * Populate EDS-specific metadata on the component instance after cloning.
 */
export async function populateEdsMetadata(
    context: HandlerContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
): Promise<void> {
    const instanceKeys = Object.keys(project.componentInstances || {});
    context.logger.debug(
        `[Project Creation] Component instances after clone: [${instanceKeys.join(', ')}]`,
    );
    context.logger.debug(
        `[Project Creation] EDS metadata check: isEdsStack=${isEdsStack}, hasEdsConfig=${!!typedConfig.edsConfig}`,
    );

    if (!isEdsStack || !typedConfig.edsConfig) return;

    context.logger.debug(
        `[Project Creation] EDS config values: repoUrl=${typedConfig.edsConfig.repoUrl}, githubOwner=${typedConfig.edsConfig.githubOwner}, repoName=${typedConfig.edsConfig.repoName}`,
    );

    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance) {
        context.logger.warn(
            `[Project Creation] EDS instance NOT found for key "${COMPONENT_IDS.EDS_STOREFRONT}" - metadata NOT populated`,
        );
        return;
    }

    // Derive githubRepo from repoUrl or explicit owner/name
    const repoInfo = typedConfig.edsConfig.repoUrl
        ? parseGitHubUrl(typedConfig.edsConfig.repoUrl)
        : null;
    const githubRepo = repoInfo
        ? `${repoInfo.owner}/${repoInfo.repo}`
        : typedConfig.edsConfig.githubOwner && typedConfig.edsConfig.repoName
          ? `${typedConfig.edsConfig.githubOwner}/${typedConfig.edsConfig.repoName}`
          : undefined;

    // Fetch template commit SHA for future update detection. For thin-layer
    // packages this reads the patches-repo LKG; for legacy/forked packages
    // it falls through to template HEAD. The lkgSource — when set — is
    // persisted alongside so the update checker can compare against the
    // same LKG file the create flow consulted.
    const lastSyncedCommit = await fetchTemplateCommitSha(context, typedConfig.edsConfig);

    const templateOwner = typedConfig.edsConfig.templateOwner;
    const templateRepo = typedConfig.edsConfig.templateRepo;
    const lkgSource = typedConfig.edsConfig.codePatchSource
        ? {
              owner: typedConfig.edsConfig.codePatchSource.owner,
              repo: typedConfig.edsConfig.codePatchSource.repo,
              // Carry lkgFile when present (b2b case) so update checks against
              // multi-canonical patches repos read the right per-ledger file.
              ...(typedConfig.edsConfig.codePatchSource.lkgFile
                  ? { lkgFile: typedConfig.edsConfig.codePatchSource.lkgFile }
                  : {}),
          }
        : undefined;

    edsInstance.metadata = {
        ...edsInstance.metadata,
        repoUrl: typedConfig.edsConfig.repoUrl,
        githubRepo,
        daLiveOrg: typedConfig.edsConfig.daLiveOrg,
        daLiveSite: typedConfig.edsConfig.daLiveSite,
        templateOwner,
        templateRepo,
        lastSyncedCommit,
        ...(lkgSource ? { lkgSource } : {}),
    };
    await context.stateManager.saveProject(project);
    context.logger.debug(
        `[Project Creation] Populated EDS metadata for ${COMPONENT_IDS.EDS_STOREFRONT}: githubRepo=${edsInstance.metadata?.githubRepo}`,
    );
}

/**
 * Fetch the canonical commit SHA to record as `lastSyncedCommit`.
 *
 * Thin-layer storefronts (package has `codePatchSource` configured per
 * ADR-006): read the verified canonical SHA from the patches repo's
 * `last-known-good` file (D2 — Chromium LKGR / Nix git-revision convention).
 * If unreachable, fall back to template HEAD with a warn line (D1
 * proceed-and-warn).
 *
 * Forked storefronts (no `codePatchSource`): unchanged — fetch the template
 * repo's `main` HEAD as `lastSyncedCommit`. Mixed fleets coexist during
 * migration.
 */
async function fetchTemplateCommitSha(
    context: HandlerContext,
    edsConfig: NonNullable<ProjectCreationConfig['edsConfig']>,
): Promise<string | undefined> {
    const { templateOwner, templateRepo, codePatchSource } = edsConfig;
    if (!templateOwner || !templateRepo) return undefined;

    // Thin-layer path: read LKG from patches repo. Fall back to template
    // HEAD on LKG fetch failure (warn already logged inside readLkgSha).
    if (codePatchSource) {
        const { readLkgSha } = await import('@/features/eds/services/patches/lkgReader');
        const lkg = await readLkgSha(
            {
                owner: codePatchSource.owner,
                repo: codePatchSource.repo,
                lkgFile: codePatchSource.lkgFile,
            },
            context.logger,
        );
        if (lkg) {
            context.logger.debug(
                `[Project Creation] Recorded LKG SHA: ${lkg.substring(0, 7)} (from ${codePatchSource.owner}/${codePatchSource.repo})`,
            );
            return lkg;
        }
        context.logger.warn(
            `[Project Creation] LKG unreachable for ${codePatchSource.owner}/${codePatchSource.repo} — falling back to template HEAD`,
        );
    }

    try {
        const { GitHubTokenService } = await import('@/features/eds/services/github/githubTokenService');
        const { GitHubFileOperations } = await import(
            '@/features/eds/services/github/githubFileOperations'
        );
        const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
        const githubFileOps = new GitHubFileOperations(githubTokenService, context.logger);
        const sha =
            (await githubFileOps.getLatestCommitSha(templateOwner, templateRepo, 'main')) ??
            undefined;
        context.logger.debug(
            `[Project Creation] Fetched template commit SHA: ${sha?.substring(0, 7)}`,
        );
        return sha;
    } catch (error) {
        context.logger.warn(
            `[Project Creation] Could not fetch template commit SHA: ${(error as Error).message}`,
        );
        return undefined;
    }
}

/**
 * Phase 5: Sync EDS config.json to GitHub and publish to CDN.
 */
export async function syncEdsConfigToRemote(
    context: HandlerContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
    edsComponentPath: string,
    progressTracker: ProgressTracker,
): Promise<void> {
    const edsSetupCompleteForSync = !!typedConfig.edsConfig?.preflightComplete;

    if (!isEdsStack || !edsSetupCompleteForSync) {
        logPhase5SkipReason(context, isEdsStack, typedConfig);
        return;
    }

    progressTracker('Syncing Config', 92, 'Pushing config.json to GitHub...');

    const repoUrl = typedConfig.edsConfig?.repoUrl;
    if (!repoUrl) {
        context.logger.warn('[Phase 5] No repo URL available, skipping config sync');
        return;
    }

    const repoInfo = parseGitHubUrl(repoUrl);
    if (!repoInfo) {
        context.logger.warn('[Phase 5] Could not parse repo URL, skipping config sync');
        return;
    }

    validateConfigJson(edsComponentPath);

    context.logger.info(`[Phase 5] Syncing config.json to ${repoInfo.owner}/${repoInfo.repo}`);

    const syncResult = await syncConfigToRemote({
        componentPath: edsComponentPath,
        repoOwner: repoInfo.owner,
        repoName: repoInfo.repo,
        logger: context.logger,
        secrets: context.context.secrets,
        authManager: context.authManager,
        onProgress: (message) => progressTracker('Syncing Config', 94, message),
        verifyBlockLibrary: true,
    });

    if (!syncResult.success) {
        throw new Error(
            `Commerce configuration failed: Could not sync config.json to GitHub. ` +
                `The storefront is live but Commerce features will not work. ` +
                `Error: ${syncResult.error}`,
        );
    }

    context.logger.info(
        `[Phase 5] Config synced: GitHub=${syncResult.githubPushed}, CDN=${syncResult.cdnPublished}, ` +
            `BlockLibrary=${syncResult.blockLibraryVerified ?? 'n/a'}`,
    );

    const { updateStorefrontState } = await import(
        '@/features/eds/services/storefront/storefrontStalenessDetector'
    );
    // NOTE: passes the project's CURRENT configs, not a snapshot from when
    // config.json was generated earlier in this run. Same latent pattern the
    // republish path hit on 2026-08-10 (see updateStorefrontState) — narrower
    // window here, but fixing it means threading the snapshot through the
    // pipeline. Tracked in .rptc/plans/pdp-prerender-validation/.
    updateStorefrontState(project, project.componentConfigs || {});
    project.edsStorefrontStatusSummary = 'published';
    await context.stateManager.saveProject(project);
}

/**
 * Log reason for skipping Phase 5 config sync.
 */
function logPhase5SkipReason(
    context: HandlerContext,
    isEdsStack: boolean,
    typedConfig: ProjectCreationConfig,
): void {
    if (!isEdsStack) {
        context.logger.debug('[Phase 5] Skipped - not an EDS stack');
    } else if (!typedConfig.edsConfig) {
        context.logger.debug('[Phase 5] Skipped - edsConfig not set');
    } else if (!typedConfig.edsConfig.preflightComplete) {
        context.logger.debug('[Phase 5] Skipped - preflight not completed');
    }
}

/**
 * Validate config.json exists and is valid JSON before syncing.
 */
function validateConfigJson(edsComponentPath: string): void {
    const configJsonPath = path.join(edsComponentPath, 'config.json');
    if (!fs.existsSync(configJsonPath)) {
        throw new Error(
            `Commerce configuration failed: config.json not found at ${configJsonPath}. ` +
                `Config generation may have failed in Phase 4.`,
        );
    }

    try {
        const configContent = fs.readFileSync(configJsonPath, 'utf-8');
        JSON.parse(configContent);
    } catch (parseError) {
        throw new Error(
            `Commerce configuration failed: config.json is invalid JSON. ` +
                `Error: ${(parseError as Error).message}`,
        );
    }
}

/**
 * Phase 5b: Ensure EDS content is set up (DA.live content for imports/creations).
 */
export async function setupEdsContent(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
    progressTracker: ProgressTracker,
): Promise<void> {
    if (!isEdsStack || !typedConfig.edsConfig?.contentSource || !typedConfig.edsConfig?.repoUrl) {
        return;
    }

    // B2B-readiness advisory (proceed-and-warn): a B2B-code storefront against a
    // backend without B2B enabled renders an empty B2B account experience. The
    // builder cannot enable B2B (no API — it's a backend prerequisite), so warn
    // only on a definitive negative; 'unknown' (older/SaaS schema) stays silent.
    if (typedConfig.edsConfig.templateRepo === 'boilerplate-b2b-template') {
        // Reuse the canonical config reader (same one envFileGenerator /
        // catalogPrewarmService use) — the GraphQL endpoint is already collected
        // as a project config setting; don't re-derive it. meshEndpoint omitted so
        // we probe the raw Commerce GraphQL the backend exposes.
        const { commerceEndpoint } = extractConfigParamsFromConfigs(
            typedConfig.componentConfigs as
                | Record<string, Record<string, string | number | boolean | undefined>>
                | undefined,
            undefined,
            typedConfig.components?.backend,
        );
        if (commerceEndpoint && (await detectB2bReadiness(commerceEndpoint)) === 'disabled') {
            const msg =
                'This B2B storefront is connected to a Commerce backend that does not have B2B enabled. ' +
                'The B2B account features (company, quotes, purchase orders, requisition lists) will not appear until ' +
                'B2B is enabled on the backend (Admin → Stores → Configuration → General → B2B Features → Enable Company).';
            context.logger.warn(`[Phase 5b] ${msg}`);
            void vscode.window.showWarningMessage(msg);
        }
    }

    try {
        const contentCopied = await ensureEdsContent(
            {
                repoUrl: typedConfig.edsConfig.repoUrl,
                daLiveOrg: typedConfig.edsConfig.daLiveOrg,
                daLiveSite: typedConfig.edsConfig.daLiveSite,
                contentSource: typedConfig.edsConfig.contentSource,
                accountContentSource: typedConfig.edsConfig.accountContentSource,
                contentPatches: typedConfig.edsConfig.contentPatches,
                contentPatchSource: typedConfig.edsConfig.contentPatchSource,
                templateOwner: typedConfig.edsConfig.templateOwner,
                templateRepo: typedConfig.edsConfig.templateRepo,
            },
            {
                logger: context.logger,
                secrets: context.context.secrets,
                extensionContext: context.context,
            },
            (message, subMessage) =>
                progressTracker('Setting Up Content', 95, subMessage || message),
        );

        if (contentCopied) {
            context.logger.info('[Phase 5b] Storefront content populated and published');
        }
    } catch (error) {
        context.logger.warn(`[Phase 5b] Content setup failed: ${(error as Error).message}`);
        context.logger.warn('[Phase 5b] Run EDS Reset from the dashboard to populate content');
    }
}
