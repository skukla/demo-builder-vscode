/**
 * Dashboard Status Handlers
 *
 * The dashboard's status pipeline: `requestStatus` (the status payload plus the
 * on-open check orchestration, including the AI-context freshness wiring) and
 * the two authentication handlers (`reAuthenticate`, `switchOrg`) that end in a
 * status refresh. Extracted from `dashboardHandlers.ts` for the 500-line handler
 * cap; the parent re-exports everything here so import sites are unchanged.
 */

import * as path from 'path';
import { buildStatusPayload, deriveMeshStatus } from '../services/dashboardStatusService';
import { withBrowserSignInNotice } from '@/core/auth/browserSignInNotice';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { getMeshEndpoint } from '@/core/state/appBuilderComponentState';
import { verifyAiSetup } from '@/features/ai/aiSetupVerifier';
import { detectMcpDrift } from '@/features/ai/mcpDriftDetector';
import { handleForcedOrgSwitch } from '@/features/authentication/handlers/orgSwitchHandler';
import {
    handleRegenerateAiFiles,
    logAiVerification,
} from '@/features/dashboard/handlers/aiHandlers';
import { createAiContextFreshnessCheck } from '@/features/dashboard/services/onOpenChecks/aiContextFreshnessCheck';
import { createAiVerifyCheck } from '@/features/dashboard/services/onOpenChecks/aiVerifyCheck';
import { createMcpHealthCheck } from '@/features/dashboard/services/onOpenChecks/mcpHealthCheck';
import { createMeshVerifyCheck } from '@/features/dashboard/services/onOpenChecks/meshVerifyCheck';
import { runOnOpenChecks } from '@/features/dashboard/services/onOpenChecks/orchestrator';
import { createOrgContextCheck } from '@/features/dashboard/services/onOpenChecks/orgContextCheck';
import { detectFrontendChanges } from '@/features/mesh/services/stalenessDetector';
import {
    applicableMcpPackages,
    readInstalledMcpPackages,
} from '@/features/project-creation/services/aiBundle/aiDefaultsInstaller';
import { ErrorCode } from '@/types/errorCodes';
import { MessageHandler } from '@/types/handlers';
import { getMeshComponentInstance, isEdsProject } from '@/types/typeGuards';
import type { MeshStatus } from '@/types/webviewPayloads';

/**
 * Handle 'requestStatus' message - Send current project status
 *
 * Note: the dashboard's initial `init` payload (theme, project, hasMesh, isEds,
 * hasAdobeContext, …) is delivered once by BaseWebviewCommand via getInitialData
 * after the handshake. There is intentionally no `'ready'` handler that re-sends
 * a partial `init` — doing so previously clobbered rich fields (hasAdobeContext,
 * hasMesh, brand/stack names) that aren't ref-captured in the UI.
 */
export const handleRequestStatus: MessageHandler = async (context) => {
    context.logger.debug('[Dashboard] handleRequestStatus called');

    if (!context.panel) {
        return { success: false, error: 'No panel available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const meshComponent = getMeshComponentInstance(project);
    const frontendConfigChanged =
        project.status === 'running' ? detectFrontendChanges(project) : false;

    context.logger.debug(`[Dashboard] Status request: mesh=${meshComponent?.status || 'none'}`);

    // Determine mesh status from persisted state (no redundant re-checking).
    // The derivation itself lives in dashboardStatusService so the agent surface
    // reports the same mesh the same way; only the AUTH question differs, and it
    // stays here because only this caller may prompt.
    let meshStatus: MeshStatus = 'not-deployed';
    // Set when a deployed mesh should be background-verified on open (auth'd +
    // has a deployment record). The verify runs as the mesh-verify OnOpenCheck.
    let shouldVerifyMesh = false;

    if (meshComponent) {
        const settledWithoutAuth =
            meshComponent.status === 'deploying' || meshComponent.status === 'error';

        // Auth check — prompt for inline sign-in if not authenticated. Skipped for
        // the two states that are reported without waiting on auth, so a failed
        // deploy never costs the user a sign-in prompt to look at.
        let authenticated = false;
        if (!settledWithoutAuth) {
            const authManager = ServiceLocator.getAuthenticationService();
            const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
            const authResult = await ensureAdobeIOAuth({
                authManager,
                logger: context.logger,
                logPrefix: '[Dashboard]',
                projectContext: {
                    organization: project.adobe?.organization,
                    projectId: project.adobe?.projectId,
                    workspace: project.adobe?.workspace,
                },
                warningMessage: 'Adobe sign-in required to check mesh status.',
            });
            authenticated = authResult.authenticated;
        }

        const derived = deriveMeshStatus(project, authenticated);
        if (derived) {
            meshStatus = derived.status;
            shouldVerifyMesh = derived.shouldVerify;
        }
    }

    // Keyed-first (ADR-011 D3 Steps 07+09): the endpoint lives on the keyed
    // mesh appBuilderComponents entry (legacy meshState fallback inside).
    const meshEndpoint = getMeshEndpoint(project);
    const statusData = buildStatusPayload(
        project,
        frontendConfigChanged,
        meshComponent ? { status: meshStatus, endpoint: meshEndpoint } : undefined,
    );

    context.panel.webview.postMessage({
        type: 'statusUpdate',
        payload: statusData,
    });

    // On-open checks run through the orchestrator (fire-and-forget): each posts a
    // typed outcome on the single `checkResult` channel.
    //   - org-context: non-interactive (P1) — never a browser/stall on open; the
    //     slow/CLI path stays behind user actions (Switch IMS Org / Sign in).
    //   - mcp-health (EDS only): detects stale .mcp.json paths and VISIBLY auto-heals
    //     (P2) via the regenerate pipeline, replacing the silent MODULE_NOT_FOUND.
    //   - mesh-verify (only when a deployed mesh is auth-reachable): always posts a
    //     typed outcome (ok / warning-gone / unknown-transient), never a silent flip.
    //   - ai-verify: the single on-open AI verification (the hook no longer pulls it),
    //     surfacing which MCP/skill failed and why (P2). Spawns servers once.
    const checks = [
        createOrgContextCheck({
            authManager: ServiceLocator.getAuthenticationService(),
            stateManager: () => ServiceLocator.getStateManager(),
        }),
        createMcpHealthCheck({
            detectDrift: detectMcpDrift,
            heal: () => handleRegenerateAiFiles(context),
        }),
        // ai-context-freshness (all projects): both staleness axes — stamp-vs-constant
        // (did WE change the bundle?) and composition-vs-installed (did the PROJECT
        // gain a component whose tooling it never received?). Detect-only per the
        // OnOpenCheck P1 contract. Since ADR-013 only the COMPOSITION axis flips
        // the AI badge (surfacing "Regenerate AI files" — the real download); the
        // version axis is logged-only because the activation sweep
        // (`refreshAiBundlesOnActivation`) owns that repair silently.
        createAiContextFreshnessCheck({
            currentVersion: AI_CONTEXT_VERSION,
            applicablePackages: applicableMcpPackages,
            installedPackages: readInstalledMcpPackages,
        }),
        createAiVerifyCheck({
            // `recordedHashes` = the project's ADR-013 aiFileHashes (the check
            // passes them from ctx.project) → on-open inventory carries
            // `editedFiles` for the modal's "kept your version" flags.
            verify: async (p, recordedHashes) => {
                // dist path resolved lazily (inside the check) — server-side only.
                const extensionDistPath = path.join(context.context.extensionPath, 'dist');
                const result = await verifyAiSetup(p, extensionDistPath, recordedHashes);
                logAiVerification(context, result); // preserve the on-open observability
                return result;
            },
        }),
    ];
    if (shouldVerifyMesh) {
        // Single lazy import (resolved once) shared by both injected fns.
        const meshVerifier = await import('@/features/mesh/services/meshVerifier');
        checks.push(
            createMeshVerifyCheck({
                // Org-targeted: verifyMeshDeployment issues `aio api-mesh:describe`
                // (directly, and again via its mesh-id recovery). Unwrapped it
                // inherits the CLI's process-global console selection, and the
                // same describe that succeeds inside the deploy's wrapper returns
                // code=2 here — observed minutes apart against one mesh on
                // 2026-08-04, surfacing as "Verification failed" on every status
                // request.
                verify: (p) =>
                    withOrgContext(buildOrgTargetFromProjectAdobe(p.adobe), () =>
                        meshVerifier.verifyMeshDeployment(
                            p,
                            ServiceLocator.getCommandExecutor(),
                        ),
                    ),
                syncMeshStatus: (p, r) => meshVerifier.syncMeshStatus(p, r),
                markDirty: (key) => context.stateManager.markDirty(key),
            }),
        );
    }

    void runOnOpenChecks(
        {
            project,
            logger: context.logger,
            isEds: isEdsProject(project),
            postMessage: (type, payload) => context.panel?.webview.postMessage({ type, payload }),
        },
        checks,
    );

    return { success: true, data: statusData };
};

/**
 * Handle 'reAuthenticate' message - Re-authenticate with Adobe
 *
 * Called when user clicks "Sign in" link after session expired (needs-auth status).
 * Uses loginAndRestoreProjectContext to restore full project context after login,
 * then requests a status refresh to update the mesh status display.
 */
export const handleReAuthenticate: MessageHandler = async (context) => {
    context.logger.debug('[Dashboard] handleReAuthenticate called');

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const authManager = ServiceLocator.getAuthenticationService();

    context.logger.info('[Dashboard] Starting Adobe sign-in from re-authenticate link');
    // The browser opens on the other side of this call — telegraph it, exactly as
    // ensureAdobeIOAuth does. Without it the click looks inert until a browser
    // window appears unannounced.
    const loginSuccess = await withBrowserSignInNotice(() =>
        authManager.loginAndRestoreProjectContext({
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        }),
    );

    if (!loginSuccess) {
        context.logger.warn('[Dashboard] Sign-in failed or cancelled');
        return { success: false, error: 'Sign-in failed or cancelled' };
    }

    context.logger.info('[Dashboard] Sign-in successful, refreshing status');

    // Trigger status refresh by calling handleRequestStatus
    return handleRequestStatus(context);
};

/**
 * Handle 'switchOrg' message — the DASHBOARD's org-switch: forced sign-in, then
 * verify where the token actually landed.
 *
 * The sign-in itself belongs to authentication ({@link handleForcedOrgSwitch}) —
 * three panels need it. What is dashboard-specific is the second half: re-running
 * the status check re-runs the proactive org-mismatch detection, so if the user is
 * still in the wrong org (another browser tab reasserted it, say) the banner
 * persists with a no-loop hint instead of silently failing.
 *
 * The project guard stays here too. A dashboard org-switch without a project is
 * meaningless, whereas the wizard legitimately switches org before any project
 * exists — which the shared handler allows and this one does not.
 */
export const handleSwitchOrg: MessageHandler = async (context) => {
    context.logger.debug('[Dashboard] handleSwitchOrg called');

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project available', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const result = await handleForcedOrgSwitch(context);
    if (!result.success) {
        return result;
    }

    context.logger.info('[Dashboard] Forced sign-in complete, verifying organization');
    return handleRequestStatus(context);
};
