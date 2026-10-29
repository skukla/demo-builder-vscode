/**
 * The org step on its own: a refusal when the project's Adobe org is not the one the signed-in
 * token reaches (adobe-org-context, through `detectProjectOrgMismatch`).
 *
 * Moved here from the dashboard's App Builder guard chain (2026-10-28), which still runs it and
 * re-exports it, so the datapack engine can ask the same question without loading the
 * dashboard's handlers. Unchanged in what it does.
 *
 * @module features/authentication/services/projectOrgGuard
 */

import type { OrgAwareAuthManager } from './detectProjectOrgMismatch';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * A refusal when the project's Adobe org is not the one the signed-in token reaches; undefined
 * when it is, or when the check cannot tell (not signed in: the auth step owns that case).
 *
 * Used by the App Builder guard chain (`runGuards`), the extension's update check (AB-73), which
 * asks this one step while listing every project's integration updates, and the datapack
 * engine before it writes into the project's store (DI-5).
 *
 * @param context - the handler context (its logger)
 * @param project - the project whose org is checked
 * @param authManager - the signed-in session the token comes from
 */
export async function orgGuard(
    context: Pick<HandlerContext, 'logger'>,
    project: Project,
    authManager: OrgAwareAuthManager,
): Promise<{ error: string } | undefined> {
    const { detectProjectOrgMismatch } = await import('./detectProjectOrgMismatch');
    const orgContext = await detectProjectOrgMismatch(authManager, project, context.logger);
    if (orgContext && !orgContext.reachable) {
        return {
            error: 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.',
        };
    }
    return undefined;
}
