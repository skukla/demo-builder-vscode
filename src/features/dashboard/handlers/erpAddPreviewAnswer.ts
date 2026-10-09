/**
 * What `addErp` answers WITHOUT `confirm` (AB-75): the preview of what every ERP will own once
 * the new one is added, the same `previewErpAdd` the "Add another ERP" dialog shows, so an
 * agent can show the user the numbers before it adds. Reads the store and each ERP's rule
 * through the integration; deploys nothing and saves nothing.
 *
 * @module features/dashboard/handlers/erpAddPreviewAnswer
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { ownsNothingNext, previewErpAdd } from '@/features/app-builder/services/erpAddPreview';
import { erpListIdFor } from '@/features/app-builder/services/erpListId';
import { defaultOwnsRule } from '@/features/app-builder/services/erpOwnership';
import { resolveAppManagementAuth } from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { readErpOwnershipOptionsForProject } from '@/features/project-creation/services/erpOwnershipSync';
import type { Project } from '@/types/base';
import type { ErpOwnsRule } from '@/types/erpOwnership';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse } from '@/types/handlers';

/** The add as planned: where, under which name, with which rule (absent = the default). */
export interface AddToPreview {
    project: Project;
    integrationId: string;
    name: string;
    owns?: ErpOwnsRule;
}

/**
 * Preview an add. A store or integration that cannot be read is a refusal in words.
 *
 * @returns `{ confirmed: false, owns, preview, next? }`
 */
export async function previewErpAddAnswer(add: AddToPreview): Promise<HandlerResponse> {
    const authManager = ServiceLocator.getAuthenticationService();
    const auth = await resolveAppManagementAuth(add.project, authManager);
    if (!auth) return { success: false, error: 'Adobe sign-in required to preview the add.', code: ErrorCode.AUTH_REQUIRED };
    let options;
    try {
        options = await readErpOwnershipOptionsForProject(add.project, add.integrationId, auth, authManager);
    } catch (error) {
        return { success: false, error: `Could not read the store: ${error instanceof Error ? error.message : String(error)}` };
    }
    if ('refusal' in options) return { success: false, error: options.refusal, code: ErrorCode.CONFIG_INVALID };
    const listId = erpListIdFor(add.name, options.takenListIds);
    const owns = add.owns ?? defaultOwnsRule({ listId });
    const preview = previewErpAdd(options.products, { websites: options.websites, erps: options.erps }, { erp: listId, name: add.name, owns });
    const next = ownsNothingNext(preview, owns);
    return { success: true, data: { confirmed: false, name: add.name, listId, owns, preview, ...(next ? { next } : {}) } };
}
