/**
 * Wizard console API handlers — the API-access surface behind the Add
 * Integration modal's api-access stage.
 *
 * Why: the dashboard's `listConsoleApis` requires a current project (org from
 * `project.adobe`, guard chain over project state) — the wizard has none. This
 * handler lists the org's subscribable Adobe services from the auth service's
 * CACHED org instead, flagging as `locked` every code the reconcile union will
 * subscribe regardless of user choice (the selected catalog entries'
 * `requiredApis` + the baseline).
 *
 * Custom `owner-repo` integration ids resolve to no catalog entry and
 * contribute nothing to the locked set. No guard chain runs: there is no
 * project to guard; sign-in and org presence are the only preconditions.
 */

import { getAppBuilderComponentEntry } from '../services/appBuilderComponentCatalogLoader';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { computeRequiredApis } from '@/features/app-builder/services/apiSubscriber';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/**
 * Handle 'list-org-console-apis' — the org's subscribable Adobe services, each
 * flagged `locked: true` when the wizard's reconcile union already covers it
 * (selected catalog entries' requiredApis + baseline).
 */
export const handleListOrgConsoleApis: MessageHandler<{ componentIds?: string[] }> = async (
    _context,
    payload,
) => {
    const authService = ServiceLocator.getAuthenticationService();
    if (!(await authService.isAuthenticated())) {
        return { success: false, error: 'Adobe sign-in required to list Adobe APIs.' };
    }
    const org = authService.getCachedOrganization();
    if (!org?.id) {
        return {
            success: false,
            error: 'No Adobe organization selected. Complete Adobe sign-in first.',
        };
    }

    const entries = (payload?.componentIds ?? [])
        .map((id) => getAppBuilderComponentEntry(id))
        .filter((entry): entry is AppBuilderComponentCatalogEntry => entry !== undefined);
    const locked = new Set(computeRequiredApis(entries));

    try {
        const client = createApiSubscriberClient(authService);
        const services = await client.getServicesForOrg(org.id);
        return {
            success: true,
            data: {
                apis: services.map((s) => ({
                    code: s.code,
                    name: s.name,
                    locked: locked.has(s.code),
                })),
            },
        };
    } catch (err) {
        return { success: false, error: `Could not list Adobe APIs: ${toError(err).message}` };
    }
};
