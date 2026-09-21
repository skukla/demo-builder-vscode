/**
 * Warm the org's Adobe API catalog in the background.
 *
 * `getServicesForOrg` is a single SDK call, but a highly variable one — 348ms
 * against a warm endpoint and 42s against a cold one, measured minutes apart on
 * the same 96-service org. The slow case is Adobe's, not ours: on 2026-09-21
 * Developer Console's own page took 55.6s for the same list on a cold load and
 * 0.5s once warm, and our direct call answered in 0.5s straight after. Past about
 * 60s Adobe's gateway answers 504 instead.
 *
 * Developer Console hides that by loading the list as soon as it opens, so it is
 * ready before anyone looks. This does the same: it runs when the dashboard opens
 * and again when the integrations surface opens. The fetcher caches per org for
 * 30 minutes and single-flights, so a second call joins the first or reads its
 * result — it never costs a second download.
 *
 * ONE retry after any failure, here and nowhere else. The fetcher itself never
 * retries a timeout, because a person waiting on the picker should not wait
 * twice. Nobody waits on this call, and a cold load that dies at the gateway has
 * usually warmed Adobe's side by the time it fails.
 *
 * Three things this must not do, in order of how badly they would bite:
 * - trigger interactive Adobe auth. `getTokenStatus` reads the token file
 *   directly (no CLI call, no browser), so both the guard and the skip are silent.
 * - block the surface. Fire-and-forget; callers never await it.
 * - surface an error. A warm-up has nothing to report; the consumer that needs
 *   the list fetches it and reports its own failure.
 *
 * Org-targeted like every other `aio`-backed read: an unwrapped call inherits the
 * CLI's process-global console selection and would warm the WRONG org's catalog —
 * worse than a cold cache, because the picker would then show it.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell/orgContextEnv';
import type { HandlerContext } from '@/types/handlers';

export async function warmOrgServicesCatalog(context: HandlerContext): Promise<void> {
    try {
        const project = await context.stateManager.getCurrentProject();
        const orgId = project?.adobe?.organization;
        if (!project || !orgId) return;

        const authManager = ServiceLocator.getAuthenticationService();
        const { isAuthenticated } = await authManager.getTokenStatus();
        if (!isAuthenticated) return;

        const fetch = () =>
            withOrgContext(buildOrgTargetFromProjectAdobe(project.adobe), () =>
                authManager.getServicesForOrg(orgId),
            );
        try {
            await fetch();
        } catch {
            context.logger.debug('[Integrations] API catalog warm-up failed — retrying once');
            await fetch();
        }
        context.logger.debug('[Integrations] API catalog prefetched');
    } catch {
        // Best-effort: the consumer that actually needs it will fetch and report.
    }
}
