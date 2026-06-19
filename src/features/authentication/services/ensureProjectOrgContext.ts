/**
 * ensureProjectOrgContext — the reactive, action-time org-context gate.
 *
 * Sibling of `ensureAdobeIOAuth` (`@/core/auth/adobeAuthGuard`). Where the auth
 * guard handles an *expired/missing* token, this handles a *valid token that
 * reaches the wrong org*: IMS tokens are org-bound, so an existing project whose
 * Adobe org differs from the token's reachable org fails every Adobe op.
 *
 * It mirrors the auth guard's pause-and-prompt shape — `detect → (mismatch?)
 * "Switch IMS Org" / Cancel → forced login → re-verify` — so a gated action
 * (e.g. mesh deploy) can recover inline instead of dead-ending in a warning that
 * just points back at the dashboard banner.
 *
 * Lives in the authentication feature (not `core/auth`) because it depends on the
 * canonical `detectProjectOrgMismatch`, and `core/` may not import `@/features/*`.
 *
 * @module features/authentication/services/ensureProjectOrgContext
 */

import * as vscode from 'vscode';
import { detectProjectOrgMismatch, type OrgAwareAuthManager } from './detectProjectOrgMismatch';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/** Outcome of the gate. `reachable` true means the caller may proceed. */
export interface OrgContextGuardResult {
    /** True when the project's org is reachable now (proceed with the action). */
    reachable: boolean;
    /** True when the user dismissed the prompt without switching. */
    cancelled?: boolean;
    /** Name of the org the token currently reaches (for messaging). */
    currentOrg?: string;
}

/**
 * Auth surface the gate needs: the detector's `getOrganizations` plus the forced
 * sign-in. Kept structural (interface) so tests don't need the concrete service.
 */
export interface OrgContextAuthManager extends OrgAwareAuthManager {
    loginAndRestoreProjectContext(
        context: { organization?: string; projectId?: string; workspace?: string },
        force?: boolean,
    ): Promise<boolean>;
}

/** Build the mismatch prompt, naming the current org + project where known. */
function buildPrompt(projectName: string, currentOrg: string | undefined): string {
    if (currentOrg) {
        return `You're signed into ${currentOrg} — but "${projectName}" was created in a `
            + 'different Adobe organization. Switch organizations to continue.';
    }
    return `"${projectName}" was created in a different Adobe organization than the one `
        + 'you\'re signed into. Switch organizations to continue.';
}

/**
 * Ensure the current token reaches the project's Adobe org, prompting a forced
 * "Switch IMS Org" recovery on mismatch.
 *
 * @returns `{ reachable: true }` to proceed; `{ reachable: false, cancelled }`
 *   when the user declined or the switch didn't land in the right org.
 */
export async function ensureProjectOrgContext(options: {
    authManager: OrgContextAuthManager;
    project: Project;
    logger: Logger;
    logPrefix?: string;
}): Promise<OrgContextGuardResult> {
    const { authManager, project, logger, logPrefix = '[Auth]' } = options;

    const initial = await detectProjectOrgMismatch(authManager, project, logger);
    // No Adobe org, or the check couldn't run (non-fatal) — don't block the action.
    if (!initial) {
        return { reachable: true };
    }
    if (initial.reachable) {
        return { reachable: true, currentOrg: initial.currentOrg };
    }

    logger.warn(`${logPrefix} Project org not reachable by the current token`);

    const selection = await vscode.window.showWarningMessage(
        buildPrompt(project.name, initial.currentOrg),
        'Switch IMS Org',
        'Cancel',
    );
    if (selection !== 'Switch IMS Org') {
        return { reachable: false, cancelled: true, currentOrg: initial.currentOrg };
    }

    logger.info(`${logPrefix} Starting forced Adobe sign-in to switch organization`);
    // Telegraph the browser-launch delay: the forced login spins up the system
    // browser, which takes a moment with no other feedback. Reuse the same
    // notification-progress shape the Open-in-Browser actions use.
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Opening browser to switch organization…',
            cancellable: false,
        },
        () => authManager.loginAndRestoreProjectContext(
            {
                organization: project.adobe?.organization,
                projectId: project.adobe?.projectId,
                workspace: project.adobe?.workspace,
            },
            true, // force — present the IMS account/org chooser; never silently reuse the SSO tab
        ),
    );

    // Verify the landed org by re-running the canonical check.
    const after = await detectProjectOrgMismatch(authManager, project, logger);
    const reachable = after?.reachable ?? false;
    if (reachable) {
        logger.info(`${logPrefix} Organization switch successful`);
    } else {
        logger.warn(`${logPrefix} Still mismatched after the forced switch`);
    }
    return { reachable, currentOrg: after?.currentOrg ?? initial.currentOrg };
}
