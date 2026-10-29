/**
 * Start the "Add another ERP" store read in the background when a project screen opens, so the
 * dialog finds it done, or joins it part way.
 *
 * The read is kept by the extension ({@link readErpOwnershipOptionsShared}), not by the screen
 * that started it: leaving the dashboard for Integrations, or closing either, does not stop it.
 *
 * What it must not do, as {@link warmCommerceSignIn}: open a browser (`getTokenStatus` reads the
 * token file, and `resolveAppManagementAuth` reads the token it finds), block the screen
 * (callers never await it), or report anything (the dialog reads again and says what went
 * wrong).
 *
 * Only for an integration that serves ERPs: nothing else reads what the ERPs own.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { formatDuration } from '@/core/utils/timeFormatting';
import { deriveErpActionUrl } from '@/features/app-builder/services/erpIntegrationClient';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { readErpOwnershipOptionsShared } from '@/features/project-creation/services/erpOwnershipOptionsShared';
import { readErpOwnershipOptionsForProject } from '@/features/project-creation/services/erpOwnershipSync';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** The project's integrations that deploy ERP actions. */
function erpIntegrationIds(project: Project): string[] {
    return Object.entries(project.appBuilderComponents ?? {})
        .filter(([, component]) => component.kind === 'integration')
        .filter(([, component]) => Boolean(deriveErpActionUrl(component.deployedUrls, 'status')))
        .map(([id]) => id);
}

export async function warmErpOwnershipOptions(context: HandlerContext): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        const ids = project ? erpIntegrationIds(project) : [];
        if (!project || ids.length === 0) return;

        const authManager = ServiceLocator.getAuthenticationService();
        const { isAuthenticated } = await authManager.getTokenStatus();
        if (!isAuthenticated) return;
        const auth = await resolveAppManagementAuth(project, authManager);
        if (!auth) return;

        const started = Date.now();
        await Promise.all(ids.map(async (id) => {
            const options = await readErpOwnershipOptionsShared(project, id, () =>
                readErpOwnershipOptionsForProject(project, id, auth, authManager, context.context?.secrets),
            );
            if ('refusal' in options) return;
            const took = formatDuration(Date.now() - started);
            context.logger.debug(`[Integrations] Store read for Add another ERP ready (${took})`);
        }));
    } catch {
        // Best-effort: the dialog reads the store itself and reports.
    }
}
