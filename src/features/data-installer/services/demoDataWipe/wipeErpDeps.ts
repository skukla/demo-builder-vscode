/**
 * Which ERP integration a wipe calls, built from the local projects ("One action, ERP included",
 * owner 2026-10-30). One Commerce instance runs one ERP integration (AB-78), and it serves every
 * website of it, so the one to call is found among ALL local projects, this one included: the
 * deployed ERP integration of a project on the same Commerce instance (`erpIntegrationHolder`, the
 * same match the add's one-per-instance refusal makes). Its project being another one is fine here.
 *
 * A composition file (ADR-015): it wires the integration's client (`ErpIntegrationClient`, the one
 * the ERP reset calls), the sign-in its actions take (`resolveAppManagementAuth`, as `openErpCall`)
 * and the fill the ERP reset runs after its wipe (`fillEveryErp`) into the link `wipeErp.ts` uses.
 *
 * @module features/data-installer/services/demoDataWipe/wipeErpDeps
 */

import { type WipeErp, type WipeErpLink, wipeErpOf } from './wipeErp';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { ErpIntegrationClient, deriveErpActionUrl } from '@/features/app-builder/services/erpIntegrationClient';
import { erpIntegrationHolder, erpIntegrationIdOf } from '@/features/app-builder/services/erpIntegrationOnSameCommerce';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { fillEveryErp, fillWarnings, summarizeFills } from '@/features/project-creation/services/erpFillForProject';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const NO_SIGN_IN = 'Adobe sign-in required';

/** The integration's ERPs' names by their list id: the key its close's `erpRemoved` uses. */
function erpNamesOf(holder: Project, integrationId: string, catalog: ReturnType<typeof getAppBuilderComponentCatalog>): Record<string, string> {
    const names: Record<string, string> = {};
    for (const id of systemsUsedBy(holder, integrationId, catalog)) {
        names[erpListIdOf(holder, id, catalog) ?? id] = holder.appBuilderComponents?.[id]?.name ?? id;
    }
    return names;
}

/** Fill every ERP the integration serves from Commerce again: what went wrong, or what to know. */
function refillOf(context: HandlerContext, holder: Project, integrationId: string): WipeErpLink['refill'] {
    return async (onProgress) => {
        const authManager = context.authManager;
        if (!authManager) return { failed: NO_SIGN_IN };
        const getAuth = () => resolveAppManagementAuth(holder, authManager);
        const outcomes = await fillEveryErp(holder, integrationId, { authManager, credentials: context.context?.secrets, getAuth, onProgress });
        const summary = summarizeFills(outcomes);
        if (summary.status === 'failed') return { failed: summary.detail };
        const warning = fillWarnings(outcomes.map((o) => ({ name: o.name, ...(o.status === 'filled' ? { warning: o.warning } : {}) })));
        return warning ? { warning } : {};
    };
}

/**
 * The ERP integration serving the instance `project` points at, from any local project, as the
 * wipe uses it; undefined when none runs one there.
 *
 * @param others - every other project on this machine (`loadOtherProjects`)
 */
export function findWipeErp(context: HandlerContext, project: Project, others: readonly Project[]): WipeErp | undefined {
    const catalog = getAppBuilderComponentCatalog();
    const holder = erpIntegrationHolder(project, catalog, [project, ...others.filter((o) => o.path !== project.path)]);
    const integrationId = holder ? erpIntegrationIdOf(holder, catalog) : undefined;
    const urls = integrationId ? holder?.appBuilderComponents?.[integrationId]?.deployedUrls : undefined;
    if (!holder || !integrationId || !deriveErpActionUrl(urls, 'status')) return undefined;
    const client: WipeErpLink['client'] = async () => {
        const auth = context.authManager ? await resolveAppManagementAuth(holder, context.authManager) : undefined;
        return auth ? new ErpIntegrationClient(urls, auth) : { refusal: NO_SIGN_IN };
    };
    return wipeErpOf({
        project: { displayName: getProjectDisplayName(holder), name: holder.name },
        integrationId,
        erpNames: erpNamesOf(holder, integrationId, catalog),
        client,
        refill: refillOf(context, holder, integrationId),
    });
}
