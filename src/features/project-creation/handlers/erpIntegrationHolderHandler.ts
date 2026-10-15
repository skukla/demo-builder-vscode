/**
 * `check-erp-integration-holder` — does another local project already run an ERP
 * integration on this Commerce instance? (AB-78)
 *
 * One Commerce instance runs one ERP integration. The Add Integration modal greys
 * the ERP integration out on a yes, in the wizard and on the dashboard; the wizard
 * also holds Continue when one is already selected. It RETURNS the answer
 * (Pattern B); nothing is pushed. Reads local project files only.
 *
 * The wizard names the instance by its choices, since no project exists yet; the
 * dashboard sends nothing, and the open project is asked about.
 *
 * @module features/project-creation/handlers/erpIntegrationHolderHandler
 */

import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import {
    erpIntegrationHolder,
    oneErpIntegrationPerInstance,
} from '@/features/app-builder/services/erpIntegrationOnSameCommerce';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { loadOtherProjects } from '@/features/dashboard/handlers/replaceDeployedElsewhere';
import type { CommerceSource } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type {
    CheckErpIntegrationHolderRequest,
    CheckErpIntegrationHolderResponse,
} from '@/types/webviewRequests';

const NO_HOLDER: CheckErpIntegrationHolderResponse = { success: true, data: {} };

/** The instance asked about, and the project that may not be its own holder. */
async function subjectOf(
    context: HandlerContext,
    payload: CheckErpIntegrationHolderRequest | undefined,
): Promise<{ source: CommerceSource; selfPath?: string } | undefined> {
    if (payload?.backend) {
        return {
            source: {
                componentSelections: { backend: payload.backend },
                componentConfigs: payload.componentConfigs ?? {},
            },
            selfPath: payload.editProjectPath,
        };
    }
    const project = await context.stateManager.getCurrentProject();
    return project ? { source: project, selfPath: project.path } : undefined;
}

/**
 * Find the local project, if any, that already runs an ERP integration on the instance.
 *
 * @param context - handler context (state manager)
 * @param payload - the wizard's backend and values, or nothing for the open project
 * @returns the holder's name and the message, or an empty answer
 */
export async function handleCheckErpIntegrationHolder(
    context: HandlerContext,
    payload?: CheckErpIntegrationHolderRequest,
): Promise<CheckErpIntegrationHolderResponse> {
    const subject = await subjectOf(context, payload);
    if (!subject) return NO_HOLDER;
    const projects = await loadOtherProjects(context, subject.selfPath);
    const holder = erpIntegrationHolder(subject.source, getAppBuilderComponentCatalog(), projects);
    if (!holder) return NO_HOLDER;
    return {
        success: true,
        data: {
            holder: getProjectDisplayName(holder),
            message: oneErpIntegrationPerInstance(holder),
        },
    };
}
