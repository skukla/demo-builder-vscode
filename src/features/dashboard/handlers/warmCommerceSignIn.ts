/**
 * Sign in to Commerce in the background, so the first thing that reads the store does not wait.
 *
 * The REST client signs with the integration workspace's credential. With none kept from an
 * earlier session it reads that credential from Adobe Console, and on Justrite that took about
 * two minutes (2026-10-18): Add another ERP showed "Reading the store" for all of it. Once
 * signed, the token is held in memory and the credential is kept across reloads, so this costs
 * nothing the next time.
 *
 * The same sign-in the setup guide starts when it opens (`prepareSetupChecks`), and it shares
 * the client's single flight: a dialog opened while this runs joins it rather than starting
 * another.
 *
 * What it must not do, as {@link warmOrgServicesCatalog}: open a browser (`getTokenStatus`
 * reads the token file and nothing else), block the screen (callers never await it), or
 * report anything (whatever needs the store reads it and says what went wrong).
 *
 * Only for a project with an integration: nothing else on these screens reads the store.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { formatDuration } from '@/core/utils/timeFormatting';
import { resolveRestTarget } from '@/features/ai/server/commerceRestClient';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** Whether the project has an integration, the only thing here that reads the store. */
function hasIntegration(project: Project): boolean {
    return Object.values(project.appBuilderComponents ?? {}).some((component) => component.kind === 'integration');
}

export async function warmCommerceSignIn(context: HandlerContext): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        if (!project || !hasIntegration(project)) return;

        const { isAuthenticated } = await ServiceLocator.getAuthenticationService().getTokenStatus();
        if (!isAuthenticated) return;

        const started = Date.now();
        const target = await resolveRestTarget(context, undefined, fetch);
        if ('refusal' in target) return;
        context.logger.debug(`[Integrations] Commerce sign-in ready (${formatDuration(Date.now() - started)})`);
    } catch {
        // Best-effort: whatever reads the store signs in itself and reports.
    }
}
