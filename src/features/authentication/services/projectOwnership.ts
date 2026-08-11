/**
 * Project Ownership
 *
 * Decides which Adobe Console projects the current user may delete: a project
 * is "owned" when its `who_created` matches the access token's `user_id`
 * claim (same `<IMS-user-GUID>@<authsrc>.e` format, compared
 * case-insensitively).
 *
 * FAIL CLOSED: any unknown — no token, undecodable token, missing
 * `who_created` — resolves to NOT owned. Used to stamp `deletable` on project
 * lists sent to the webview and by the delete handler's server-side gate.
 */

import { decodeImsUserId } from './imsTokenClaims';
import type { AdobeProject } from './types';

/** The narrow token surface this module needs from AuthenticationService. */
export interface OwnershipAuthService {
    getTokenManager(): {
        inspectToken(): Promise<{ valid: boolean; expiresIn: number; token?: string }>;
    };
}

/**
 * Resolve the current user's IMS user id from the CLI access token.
 *
 * @param authService - Provider of the token manager (optional; fail closed)
 * @returns The token's `user_id` claim, or `undefined` when no valid token
 *   is available — never throws
 */
export async function resolveCurrentImsUserId(
    authService: OwnershipAuthService | undefined,
): Promise<string | undefined> {
    try {
        const inspection = await authService?.getTokenManager().inspectToken();
        if (!inspection?.valid || !inspection.token) {
            return undefined;
        }
        return decodeImsUserId(inspection.token);
    } catch {
        return undefined;
    }
}

/**
 * Whether a project's `who_created` names the given user (case-insensitive).
 * Either side missing → NOT owned (fail closed).
 */
export function isProjectOwnedBy(
    whoCreated: string | undefined,
    userId: string | undefined,
): boolean {
    if (!whoCreated || !userId) {
        return false;
    }
    return whoCreated.toLowerCase() === userId.toLowerCase();
}

/**
 * Stamp each project with `deletable` (ownership match against the current
 * token user). Returns new objects; never mutates the input.
 *
 * @param authService - Provider of the token manager (optional; fail closed)
 * @param projects - Projects as fetched (may carry `who_created`)
 * @returns The same projects with `deletable` stamped
 */
export async function stampProjectsDeletable(
    authService: OwnershipAuthService | undefined,
    projects: AdobeProject[],
): Promise<AdobeProject[]> {
    const userId = await resolveCurrentImsUserId(authService);
    return projects.map((project) => ({
        ...project,
        deletable: isProjectOwnedBy(project.who_created, userId),
    }));
}

/** Ownership verification needs the token surface plus an org-scoped project list. */
export interface OwnershipProjectSource extends OwnershipAuthService {
    getProjects(options: { orgId: string }): Promise<AdobeProject[]>;
}

/**
 * SECURITY GATE: verify the current token user created the target project,
 * fetching `who_created` independently from the Console list (never trusting
 * webview-supplied data). Any unknown — invalid token, project not in the org
 * list, missing `who_created`, fetch failure — resolves to false.
 *
 * @param authService - Token + project-list provider (optional; fail closed)
 * @param target - The org and project the caller wants to delete
 * @returns True only for a verified ownership match — never throws
 */
export async function verifyProjectOwnership(
    authService: OwnershipProjectSource | undefined,
    target: { orgId: string; projectId: string },
): Promise<boolean> {
    try {
        const userId = await resolveCurrentImsUserId(authService);
        if (!userId || !authService) {
            return false;
        }
        const projects = await authService.getProjects({ orgId: target.orgId });
        const project = projects.find((candidate) => candidate.id === target.projectId);
        return isProjectOwnedBy(project?.who_created, userId);
    } catch {
        return false;
    }
}
