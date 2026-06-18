/**
 * ensureProjectAdobeContext — the combined existing-project mesh pre-flight.
 *
 * Pairs the two gates an existing-project Adobe operation needs into ONE call so
 * they can't drift apart across entry points: `ensureAdobeIOAuth` (token valid?)
 * THEN `ensureProjectOrgContext` (token reaches the project's org?). Before this,
 * each site wired the two guards by hand — and the reset flows had the auth gate
 * but silently missed the org gate.
 *
 * Use this at every USER-INITIATED operation that runs an org-bound Adobe op
 * against an EXISTING project's stored org (mesh deploy/redeploy): the dashboard
 * deploy command and the project-reset flows. Do NOT use it in the creation flow
 * (the org there is derived from the current sign-in — nothing to mismatch), and
 * do NOT push it into the low-level `deployMeshComponent` primitive (creation
 * calls that too, and an interactive prompt there would fire spuriously).
 *
 * @module features/authentication/services/ensureProjectAdobeContext
 */

import { ensureProjectOrgContext, type OrgContextAuthManager } from './ensureProjectOrgContext';
import { ensureAdobeIOAuth, type AdobeAuthManager } from '@/core/auth/adobeAuthGuard';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

/** Combined outcome. `ready` true means authenticated AND org reachable — proceed. */
export interface ProjectAdobeContextResult {
    /** True when the caller may proceed with the Adobe operation. */
    ready: boolean;
    /** True when the user dismissed the sign-in or the switch prompt. */
    cancelled?: boolean;
    /** Which stage blocked when not ready — for tailored messaging. */
    blockedBy?: 'auth' | 'org';
    /** Name of the org the token currently reaches (when known). */
    currentOrg?: string;
}

/** Auth surface needed by both inner guards (auth check + forced switch). */
export type ProjectAdobeAuthManager = AdobeAuthManager & OrgContextAuthManager;

/**
 * Ensure the user is signed in AND the current token reaches the project's org,
 * prompting inline recovery for whichever is missing (Sign In / Switch IMS Org).
 */
export async function ensureProjectAdobeContext(options: {
    authManager: ProjectAdobeAuthManager;
    project: Project;
    logger: Logger;
    logPrefix?: string;
    warningMessage?: string;
}): Promise<ProjectAdobeContextResult> {
    const { authManager, project, logger, logPrefix, warningMessage } = options;

    const auth = await ensureAdobeIOAuth({
        authManager,
        logger,
        logPrefix,
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        warningMessage,
    });
    if (!auth.authenticated) {
        return { ready: false, cancelled: auth.cancelled, blockedBy: 'auth' };
    }

    const org = await ensureProjectOrgContext({ authManager, project, logger, logPrefix });
    if (!org.reachable) {
        return { ready: false, cancelled: org.cancelled, blockedBy: 'org', currentOrg: org.currentOrg };
    }

    return { ready: true, currentOrg: org.currentOrg };
}
