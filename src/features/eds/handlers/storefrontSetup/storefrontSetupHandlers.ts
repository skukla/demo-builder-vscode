/**
 * Storefront Setup Handlers
 *
 * Message handlers for storefront setup wizard step operations.
 * Manages GitHub repo creation, DA.live content population, and Helix configuration
 * during the storefront-setup step. A stopped run removes what it made
 * (storefrontSetupStop.ts).
 *
 * Phase execution logic lives in storefrontSetupPhases.ts.
 *
 * Renamed from edsPreflightHandlers.ts to better reflect the step's purpose.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupHandlers
 */

import * as vscode from 'vscode';
import { ensureDaLiveAuth, explainAbsentOverlay, resolveByomOverlayConfig } from '../edsHelpers';
import { rehydratePackageDerivedConfig } from './storefrontSetupConfigRehydration';
import { executeStorefrontSetupPhases, type StorefrontSetupResult } from './storefrontSetupPhases';
import { announceStop, removeWhatSetupMade } from './storefrontSetupStop';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { hasMeshInDependencies } from '@/core/constants';
import { claimCreationStop } from '@/features/project-creation/handlers/creationStop';
import { creationPath } from '@/features/project-creation/handlers/executorPreflight';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type {
    StorefrontSetupCompletePayload,
    StorefrontSetupErrorPayload,
} from '@/types/webviewPayloads';
import type { StorefrontSetupCancelPayload, StorefrontSetupStartPayload } from '@/types/webviewRequests';

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
 * The wizard's cancel: the Publish Storefront step was left while setup ran.
 *
 * Asks first when the run has made something, then stops the run. It removes nothing
 * itself: the run does, once its running step has ended, from its own record of what it
 * made (`storefrontSetupStop.ts`, F275), the same way an agent's stop does. Until
 * 2026-11-18 this deleted things at once, from the webview's guess at what existed,
 * while the step carried on.
 *
 * @param context - Handler context with logging and messaging
 * @param payload - Cancel payload: the webview's view of what the run has made
 * @returns Success once the question is answered and the run told to stop
 */
export async function handleCancelStorefrontSetup(
    context: HandlerContext,
    payload?: StorefrontSetupCancelPayload,
): Promise<HandlerResponse> {
    const partialState = payload?.partialState;
    context.logger.info('[Storefront Setup] Cancel requested');

    if (partialState?.repoCreated || partialState?.contentCopied) {
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

    const abortController = context.sharedState.storefrontSetupAbortController;
    if (abortController) {
        context.logger.debug('[Storefront Setup] Stopping after the current step');
        abortController.abort();
        context.sharedState.storefrontSetupAbortController = undefined;
    }
    // No 'storefront-setup-cancelled' push: the webview that asked for the cancel is
    // already gone, and no listener ever existed.
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
/**
 * The card's headline. PDP caveats mean product pages will not load at all;
 * an added demo's dry-check caveats mean some things may not work on this
 * demo, which is a different sentence.
 */
function completionMessage(pdpBlocked: boolean, hasCaveats: boolean): string {
    if (pdpBlocked) return 'Storefront created, but product detail pages will not load.';
    if (hasCaveats) return 'Storefront created. A few things to know about this demo.';
    return 'Storefront setup completed successfully!';
}

/**
 * What setup found that creation records on the project it makes: setup has no project of its own
 * to write to, since in the wizard it runs before the project exists. Each only when there is one.
 */
function recordedByCreation(result: StorefrontSetupResult): Partial<StorefrontSetupCompletePayload> {
    return {
        ...(result.brokenLinks?.length ? { brokenLinks: result.brokenLinks } : {}),
        installedBlockLibraries: result.installedBlockLibraries,
        storefrontBuildComplete: result.storefrontBuildComplete,
        // Saved as the project's Republish the Code step (PL-101).
        ...(result.codeNotServed?.length ? { codeNotServed: result.codeNotServed } : {}),
        // An imported project's commit, for Reset to restore (EDS-72).
        ...(result.bundleImport ? { bundleImport: result.bundleImport } : {}),
    };
}

/** The caveats after the PDP ones: what the content pipeline could not do (EDS-55). */
function otherCaveats(result: { pipelineWarnings?: string[] }): string[] {
    return [...(result.pipelineWarnings ?? [])];
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

    // The project's creation stop: the one the agent's run already holds, or a new one, so
    // the wizard's Cancel and cancel_project_creation both reach this run (F275).
    const stop = claimCreationStop(creationPath({ projectName: payload.projectName }));
    context.sharedState.storefrontSetupAbortController = stop.controller;
    const onStop = (): void => void announceStop(context);
    stop.signal.addEventListener('abort', onStop, { once: true });
    try {
        return await runStorefrontSetup(context, payload, stop.signal);
    } finally {
        stop.signal.removeEventListener('abort', onStop);
        stop.release();
        if (context.sharedState.storefrontSetupAbortController === stop.controller) {
            context.sharedState.storefrontSetupAbortController = undefined;
        }
    }
}

/**
 * The run itself, under its stop. Stopped, it ends after the running step and removes what
 * it made (`storefrontSetupStop.ts`), answering CANCELLED with what it could not remove.
 */
async function runStorefrontSetup(
    context: HandlerContext,
    payload: StorefrontSetupStartPayload,
    signal: AbortSignal,
): Promise<HandlerResponse> {
    const { projectName } = payload;
    context.logger.info(`[Storefront Setup] Starting for project: ${projectName}`);

    // Edit mode rebuilds edsConfig from project metadata, which carries no
    // package-derived settings — restore them before any phase reads them.
    const edsConfig = rehydratePackageDerivedConfig(
        payload.edsConfig,
        { selectedPackage: payload.selectedPackage, selectedStack: payload.selectedStack, demo: payload.demo },
        context.logger,
    );

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

    // Pre-flight: Check DA.live authentication (with inline re-auth). The guard asks
    // IMS, so a locally-valid token IMS no longer accepts is caught here rather than
    // as "missing permission" 403s mid-pipeline.
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
        // The added demo's row rides the one config the phases read (D2).
        ...(payload.demo ? { demo: payload.demo } : {}),
    };

    try {
        // Execute storefront setup phases
        const result = await executeStorefrontSetupPhases(
            context,
            effectiveEdsConfig,
            signal,
            {
                selectedBlockLibraries: payload.selectedBlockLibraries,
                customBlockLibraries: payload.customBlockLibraries,
                packageId: payload.selectedPackage,
            },
        );

        if (!result.success && signal.aborted) {
            return stoppedAnswer(context, effectiveEdsConfig, result, payload.nobodyToAsk === true);
        }
        // Two outcomes. There used to be a third, "awaiting the GitHub App", when
        // a missing App ENDED the run at the install dialog; since EDS-20
        // (2026-09-25) the run pauses inside the phase and resumes on its own, so
        // a result is either the finished storefront or a failure to report.
        if (result.success) {
            // "Complete" has to mean it. A storefront whose BYOM overlay never
            // registered is built, published and browsable — and cannot serve a
            // single product detail page. Reported as plain success (2026-07-28)
            // after four minutes of writes, leaving a silent defect the user
            // found later. The repo URL still ships: everything except
            // PDPs works, and withholding it would be the opposite lie.
            const pdpCaveats = result.pdpCaveats ?? [];
            const caveats = [...pdpCaveats, ...otherCaveats(result)];
            const hasCaveats = caveats.length > 0;
            context.logger.info(
                hasCaveats
                    ? `[Storefront Setup] Finished WITH ERRORS: ${result.repoUrl} — ${caveats.join(' ')}`
                    : `[Storefront Setup] Complete: ${result.repoUrl}`,
            );
            await context.sendMessage('storefront-setup-complete', {
                message: completionMessage(pdpCaveats.length > 0, hasCaveats),
                ...(hasCaveats && { warnings: caveats }),
                githubRepo: result.repoUrl,
                daLiveSite: `https://da.live/${edsConfig.daLiveOrg}/${edsConfig.daLiveSite}`,
                repoOwner: result.repoOwner,
                repoName: result.repoName,
                ...recordedByCreation(result),
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
    }
}

/**
 * The answer of a stopped run, once what it made is removed. No error push: the step that
 * asked for the stop is gone, and a new one on the wizard must not hear this run's end.
 */
async function stoppedAnswer(
    context: HandlerContext,
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    result: StorefrontSetupResult,
    nobodyToAsk: boolean,
): Promise<HandlerResponse> {
    context.logger.info('[Storefront Setup] Stopped; removing what it made');
    const { left } = await removeWhatSetupMade(context, edsConfig, result, nobodyToAsk);
    if (left.length) context.logger.warn(`[Storefront Setup] Left after the stop: ${left.join('; ')}`);
    const error = left.length
        ? `Storefront setup stopped. Not removed: ${left.join('; ')}`
        : 'Storefront setup stopped. What it made was removed.';
    return { success: false, error, code: ErrorCode.CANCELLED, data: { left } };
}
