/**
 * Storefront Setup Handlers
 *
 * Message handlers for storefront setup wizard step operations.
 * Manages GitHub repo creation, DA.live content population, and Helix configuration
 * during the storefront-setup step, including cancel/cleanup handling.
 *
 * Phase execution logic lives in storefrontSetupPhases.ts.
 *
 * Renamed from edsPreflightHandlers.ts to better reflect the step's purpose.
 *
 * @module features/eds/handlers/storefrontSetupHandlers
 */

import * as vscode from 'vscode';
import { CleanupService } from '../services/cleanupService';
import { ConfigurationService } from '../services/configurationService';
import {
    createDaLiveTokenProvider,
    createDaLiveServiceTokenProvider,
} from '../services/daLiveContentOperations';
import { DaLiveOrgOperations } from '../services/daLiveOrgOperations';
import { GitHubRepoOperations } from '../services/githubRepoOperations';
import { GitHubTokenService } from '../services/githubTokenService';
import { ToolManager } from '../services/toolManager';
import type { EdsMetadata, EdsCleanupOptions } from '../services/types';
import {
    ensureDaLiveAuth,
    explainAbsentOverlay,
    getDaLiveAuthService,
    resolveByomOverlayConfig,
} from './edsHelpers';
import { rehydratePackageDerivedConfig } from './storefrontSetupConfigRehydration';
import { executeStorefrontSetupPhases } from './storefrontSetupPhases';
import type { StorefrontSetupResult } from './storefrontSetupTypes';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { hasMeshInDependencies } from '@/core/constants';
import { redactUrlUserParam } from '@/core/utils/maskEmail';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { StorefrontSetupCompletePayload, StorefrontSetupErrorPayload, StorefrontSetupProgressPayload } from '@/types/webviewPayloads';
import type {
    StorefrontSetupCancelPayload,
    StorefrontSetupPartialState,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';

// ==========================================================
// Types
// ==========================================================


// The request wire shapes live in @/types/webviewRequests — ONE declaration
// shared with the wizard's StorefrontSetupStep (which used to carry its own
// PartialState twin). Re-exported here for the phase modules' existing imports.
export type {
    StorefrontSetupCancelPayload,
    StorefrontSetupPartialState,
    StorefrontSetupStartPayload,
} from '@/types/webviewRequests';


// ==========================================================
// Handlers
// ==========================================================

/**
 * Handle cancel request for storefront setup operations
 *
 * This handler:
 * 1. Shows confirmation dialog if resources exist
 * 2. Aborts running operations via AbortController
 * 3. Cleans up created resources (GitHub repo, DA.live content)
 * 4. Notifies UI of cancel completion
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Cancel payload with partial state info
 * @returns Success if cancel handled properly
 */
export async function handleCancelStorefrontSetup(
    context: HandlerContext,
    payload?: StorefrontSetupCancelPayload,
): Promise<HandlerResponse> {
    const partialState = payload?.partialState;
    const edsConfig = payload?.edsConfig;

    context.logger.info('[Storefront Setup] Cancel requested');

    // Check if any resources were created
    const hasCreatedResources = partialState?.repoCreated || partialState?.contentCopied;

    if (hasCreatedResources) {
        // Show confirmation dialog
        const confirm = await vscode.window.showWarningMessage(
            'Cancelling will delete the GitHub repository and DA.live content created so far. Continue?',
            { modal: true },
            'Yes, Cancel',
        );

        if (confirm !== 'Yes, Cancel') {
            // No push here: the cancel request arrives on webview unmount, so
            // there is nobody left to hear a 'storefront-setup-cancel-aborted'
            // message — the old send had no listener anywhere (deleted by the
            // 2026-08-21 channel inventory).
            context.logger.debug('[Storefront Setup] Cancel aborted by user');
            return { success: true };
        }
    }

    // Abort any running operations
    const abortController = context.sharedState.storefrontSetupAbortController as
        | AbortController
        | undefined;
    if (abortController) {
        context.logger.debug('[Storefront Setup] Aborting running operations');
        abortController.abort();
        context.sharedState.storefrontSetupAbortController = undefined;
    }

    // Clean up created resources
    if (hasCreatedResources && partialState) {
        try {
            await context.sendMessage('storefront-setup-progress', {
                phase: 'cancelling',
                message: 'Cleaning up resources...',
                progress: 0,
            } satisfies StorefrontSetupProgressPayload);

            const cleanupResult = await cleanupStorefrontSetupResources(
                context,
                partialState,
                edsConfig,
            );

            if (cleanupResult.success) {
                context.logger.info('[Storefront Setup] Cleanup completed successfully');
            } else {
                context.logger.warn(
                    '[Storefront Setup] Cleanup completed with errors:',
                    cleanupResult.error,
                );
            }
        } catch (error) {
            // Log error but don't fail - cleanup is best effort
            context.logger.error('[Storefront Setup] Cleanup failed', error as Error);
        }
    }

    // No 'storefront-setup-cancelled' push: same reason as above — the webview
    // that asked for the cancel is already gone, and no listener ever existed.
    return { success: true };
}

/**
 * Handle start request for storefront setup operations
 *
 * Executes the EDS setup phases that need to happen BEFORE project creation:
 * 1. GitHub repository creation (from template)
 * 2. Helix 5 configuration (fstab.yaml)
 * 3. Code bus synchronization verification
 * 4. DA.live content population
 *
 * The executor will skip these phases when `preflightComplete` is true.
 *
 * @param context - Handler context
 * @param payload - Start payload with project and EDS config
 * @returns Success with setup results
 */
/** What the caller should do with a finished setup run. */
export type SetupOutcome = 'complete' | 'awaiting-github-app' | 'error';

/**
 * Classify a setup result.
 *
 * Three outcomes, not two. Collapsing "stopped so the user can install the App"
 * into "failed" is what replaced the install dialog with the failure screen: the
 * dialog message is sent first, then the error message overwrote it a moment
 * later, and the resume handler could never fire.
 *
 * Decided by the flag, never by the error text — that wording changed twice in
 * one release, and matching on it would have broken silently each time.
 */
export function classifySetupResult(result: StorefrontSetupResult): SetupOutcome {
    if (result.success) return 'complete';
    if (result.awaitingGitHubApp) return 'awaiting-github-app';
    return 'error';
}

export async function handleStartStorefrontSetup(
    context: HandlerContext,
    payload?: StorefrontSetupStartPayload,
): Promise<HandlerResponse> {
    if (!payload?.projectName || !payload?.edsConfig) {
        context.logger.error('[Storefront Setup] Missing required parameters');
        await context.sendMessage('storefront-setup-error', {
            message: 'Missing required parameters',
            error: 'Project name and EDS config are required',
        } satisfies StorefrontSetupErrorPayload);
        return { success: false, error: 'Missing required parameters' };
    }

    const { projectName } = payload;
    context.logger.info(`[Storefront Setup] Starting for project: ${projectName}`);

    // Edit mode rebuilds edsConfig from project metadata, which carries no
    // package-derived settings — restore them before any phase reads them.
    const edsConfig = await rehydratePackageDerivedConfig(
        payload.edsConfig,
        payload.selectedPackage,
        payload.selectedStack,
        context.logger,
    );

    // Create AbortController for cancel support
    const abortController = new AbortController();
    context.sharedState.storefrontSetupAbortController = abortController;

    // Pre-flight: Check Adobe I/O authentication when mesh is included
    const needsMesh = hasMeshInDependencies(payload.dependencies ?? []);
    if (needsMesh) {
        if (!context.authManager) {
            context.logger.error('[Storefront Setup] AuthenticationService not available');
            await context.sendMessage('storefront-setup-error', {
                message: 'Authentication required',
                error: 'Please authenticate with Adobe before starting storefront setup',
            } satisfies StorefrontSetupErrorPayload);
            return { success: false, error: 'AuthenticationService not available' };
        }

        const adobeResult = await ensureAdobeIOAuth({
            authManager: context.authManager,
            logger: context.logger,
            logPrefix: '[Storefront Setup]',
            warningMessage: 'Adobe sign-in required for storefront setup.',
        });
        if (!adobeResult.authenticated) {
            await context.sendMessage('storefront-setup-error', {
                message: 'Authentication required',
                error: adobeResult.cancelled
                    ? 'Adobe sign-in was cancelled.'
                    : 'Adobe sign-in failed. Please try again.',
            } satisfies StorefrontSetupErrorPayload);
            return { success: false, error: 'Adobe authentication required' };
        }
    } else {
        context.logger.info('[Storefront Setup] No mesh selected — skipping Adobe I/O auth check');
    }

    // Pre-flight: Check DA.live authentication (with inline re-auth)
    const daLiveResult = await ensureDaLiveAuth(context, '[Storefront Setup]');
    if (!daLiveResult.authenticated) {
        await context.sendMessage('storefront-setup-error', {
            message: 'DA.live authentication expired',
            error: daLiveResult.cancelled
                ? 'DA.live sign-in was cancelled.'
                : daLiveResult.error || 'Your DA.live session has expired.',
        } satisfies StorefrontSetupErrorPayload);
        return { success: false, error: 'DA.live authentication required' };
    }

    // Compose the BYOM overlay URL the Configuration Service will register.
    // VS Code setting `demoBuilder.byom.overlayUrl` takes precedence over any
    // value baked into demo-packages.json. The helper stamps `?org=...&site=...`
    // onto the URL so the shared multi-tenant `render-pdp` action can identify
    // which storefront's `/products/default` template to fetch (Helix does not
    // forward `x-forwarded-host` or registration-set auth headers through the
    // overlay path; query string is the only confirmed transport).
    const resolvedOverlayUrl = resolveByomOverlayConfig(
        edsConfig.byomOverlayUrl,
        edsConfig.daLiveOrg,
        edsConfig.daLiveSite,
    );
    const effectiveEdsConfig = {
        ...edsConfig,
        byomOverlayUrl: resolvedOverlayUrl,
        // Decide WHY there is no overlay here, where the settings were already
        // read, and hand the phases a plain string. Phases must not read VS Code
        // config: phase 3 does this work inside the Configuration Service
        // try/catch, so a config read that throws (or a test that mocks only
        // `vscode.window`) surfaces as a bogus "Config Service failed" warning.
        ...(resolvedOverlayUrl ? {} : { byomAbsentReason: explainAbsentOverlay() }),
    };

    try {
        // Execute storefront setup phases
        const result = await executeStorefrontSetupPhases(
            context,
            effectiveEdsConfig,
            abortController.signal,
            {
                selectedBlockLibraries: payload.selectedBlockLibraries,
                customBlockLibraries: payload.customBlockLibraries,
                packageId: payload.selectedPackage,
            },
        );

        const outcome = classifySetupResult(result);

        // Awaiting installation: the install dialog is already up and the resume
        // handler takes over from here. Emitting an error tears the dialog down
        // and leaves the user with nothing to act on.
        if (outcome === 'awaiting-github-app') {
            context.logger.info(
                '[Storefront Setup] Paused — waiting for AEM Code Sync installation',
            );
            return { success: false, error: result.error };
        }

        if (outcome === 'complete') {
            // "Complete" has to mean it. A storefront whose BYOM overlay never
            // registered is built, published and browsable — and cannot serve a
            // single product detail page. Reported as plain success (2026-07-28)
            // after four minutes of writes, leaving a silent defect the user
            // found later. The repo URL still ships: everything except
            // PDPs works, and withholding it would be the opposite lie.
            const caveats = result.pdpCaveats ?? [];
            const hasCaveats = caveats.length > 0;
            // Redacted for the same reason as the BYOM toast: a 403 caveat embeds
            // the Code Sync setup link, which carries the signed-in address.
            context.logger.info(
                hasCaveats
                    ? redactUrlUserParam(
                          `[Storefront Setup] Finished WITH ERRORS: ${result.repoUrl} — ` +
                              caveats.join(' '),
                      )
                    : `[Storefront Setup] Complete: ${result.repoUrl}`,
            );
            await context.sendMessage('storefront-setup-complete', {
                message: hasCaveats
                    ? 'Storefront created, but product detail pages will not load.'
                    : 'Storefront setup completed successfully!',
                ...(hasCaveats && { warnings: caveats }),
                githubRepo: result.repoUrl,
                daLiveSite: `https://da.live/${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`,
                repoOwner: result.repoOwner,
                repoName: result.repoName,
                // Note: previewUrl/liveUrl not sent - derived from githubRepo by typeGuards
            } satisfies StorefrontSetupCompletePayload);
            return { success: true, data: result };
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        context.logger.error(`[Storefront Setup] Failed: ${errorMessage}`);
        await context.sendMessage('storefront-setup-error', {
            message: 'Storefront setup failed',
            error: errorMessage,
        } satisfies StorefrontSetupErrorPayload);
        return { success: false, error: errorMessage };
    } finally {
        context.sharedState.storefrontSetupAbortController = undefined;
    }
}

// ==========================================================
// Helper Functions
// ==========================================================

/**
 * Clean up resources created during storefront setup
 *
 * @param context - Handler context
 * @param partialState - Tracking state of created resources
 * @param edsConfig - EDS configuration for DA.live info
 * @returns Cleanup result
 */
async function cleanupStorefrontSetupResources(
    context: HandlerContext,
    partialState: StorefrontSetupPartialState,
    edsConfig?: { daLiveOrg?: string; daLiveSite?: string },
): Promise<{ success: boolean; error?: string }> {
    context.logger.debug('[Storefront Setup] Starting resource cleanup');

    try {
        // Build metadata from partial state
        const githubRepo =
            partialState.repoOwner && partialState.repoName
                ? `${partialState.repoOwner}/${partialState.repoName}`
                : partialState.repoUrl?.replace('https://github.com/', '');

        const metadata: EdsMetadata = {
            githubRepo,
            daLiveOrg: edsConfig?.daLiveOrg,
            daLiveSite: edsConfig?.daLiveSite,
        };

        const options: EdsCleanupOptions = {
            deleteGitHub: partialState.repoCreated,
            deleteDaLive: partialState.contentCopied,
            deleteConfigService: partialState.repoCreated, // Clean up Config Service if repo was created
            archiveInsteadOfDelete: false, // Full delete for setup
        };

        // Create cleanup service with required dependencies
        const cleanupService = await createCleanupService(context);
        const result = await cleanupService.cleanupEdsResources(metadata, options);

        // Check if any operation failed
        const failures = [];
        if (!result.github.success && !result.github.skipped) {
            failures.push(`GitHub: ${result.github.error}`);
        }
        if (!result.daLive.success && !result.daLive.skipped) {
            failures.push(`DA.live: ${result.daLive.error}`);
        }

        if (failures.length > 0) {
            return { success: false, error: failures.join('; ') };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Create CleanupService with all required dependencies
 *
 * @param context - Handler context for services
 * @returns Configured CleanupService
 */
async function createCleanupService(context: HandlerContext): Promise<CleanupService> {
    // Fail fast — all downstream services require AuthenticationService
    if (!context.authManager) {
        throw new Error('AuthenticationService required for cleanup');
    }

    // Create service dependencies
    const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
    const githubRepoOps = new GitHubRepoOperations(githubTokenService, context.logger);

    // Create TokenProvider adapter from AuthenticationService if available
    const tokenProvider = createDaLiveTokenProvider(context.authManager);

    const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, context.logger);

    // IMPORTANT: HelixService also needs DA.live token provider for x-content-source-authorization
    // DA.live uses separate IMS auth from Adobe Console - must use DA.live token
    const daLiveAuthService = getDaLiveAuthService(context.context);
    const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
    const toolManager = new ToolManager(context.logger);
    const configurationService = new ConfigurationService(daLiveTokenProvider, context.logger);

    return new CleanupService(
        githubRepoOps,
        daLiveOrgOps,
        toolManager,
        context.logger,
        configurationService,
    );
}
