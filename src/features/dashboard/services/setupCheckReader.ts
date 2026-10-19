/**
 * What the setup checks read Commerce with, and the ERP names a step's value is entered for:
 * shared by the checklist, "Prepare this store" and removal's undo of the store setup. Moved
 * out of the checklist's handlers (2026-10-19) so removal can use them without importing a
 * handler module, which imports removal back.
 *
 * @module features/dashboard/services/setupCheckReader
 */

import { buildCommerceEndpoints } from '@/features/ai/server/commerceEndpointsTool';
import { explainStatus, requestRest, resolveRestTarget } from '@/features/ai/server/commerceRestClient';
import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import type { CommerceRead, SetupCheckScope } from '@/features/app-builder/services/setupChecks';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/**
 * The names of the ERPs the integration uses, as their cards show them, for a step value
 * entered once per ERP (`setupChecklistOf`). The same lookups the ERP list is built from.
 */
export function erpNamesOf(project: Project, integrationId: string): string[] {
    const catalog = getAppBuilderComponentCatalog();
    return systemsUsedBy(project, integrationId, catalog).map(
        (id) => project.appBuilderComponents?.[id]?.name ?? catalogEntryFor(project, id, catalog)?.name ?? id,
    );
}

/**
 * The signed Commerce GET a check reads with, and the project's store scope. Shared with
 * "Prepare this store" (`storePreparationHandlers.ts`), which checks a step before it writes it.
 *
 * UNCUT and unbounded, unlike the agent tool's `sendRest`: that one cuts an answer at
 * 30,000 characters and pages a search at 20, which is right for a chat answer and fatal
 * for a check that parses the body (Justrite 2026-10-10: `products/attribute-sets/<id>/attributes`
 * answers more than that, and the attribute-set check died mid-JSON). The error lines keep
 * `sendRest`'s words, which the checks match on.
 */
export async function setupCheckReader(
    context: HandlerContext,
    project: Project,
    fetchImpl: typeof fetch = fetch,
): Promise<{ read: CommerceRead; scope: SetupCheckScope }> {
    const target = await resolveRestTarget(context, undefined, fetchImpl);
    const read = async (path: string): Promise<string> => {
        if ('refusal' in target) return target.refusal;
        const answer = await requestRest('GET', target, path, undefined, fetchImpl);
        if ('failed' in answer) return `Error: the request failed — ${answer.failed}`;
        return answer.ok
            ? answer.text
            : explainStatus(answer.status, answer.text, !target.clientId);
    };
    // The project's store, for a check of one website's own setting (Payment on Account).
    return { read, scope: { websiteCode: buildCommerceEndpoints(project).scope.websiteCode } };
}
