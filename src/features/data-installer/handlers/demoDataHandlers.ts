/**
 * Clearing a demo's data from the store (datapack-engine step 10; datapack-simplification step 06):
 * two handlers, which the agent tools and the Data Installer's "Clear Demo Data" both reach; no
 * reset offers it (owner, 2026-11-12). The unit is the WEBSITE, always whole: Clear Demo Data
 * covers every website the project uses (`readWipeClaims`, project scope).
 *
 * - `check-demo-data` (`demoDataCheck.ts`): what clearing the project's websites would do, as one row
 *   and one full record list per data type (`ClearCheck`), made as if the project's datapack were
 *   already uninstalled (step 06, C3). Reads only. The check failing as a whole (signed out, offline)
 *   answers the failure codes the Datapacks failure treatment reads (`renderDataInstallerFailure`).
 * - `clear-demo-data` (`demoDataClear.ts`): confirm-gated, handed the token of the list shown; it
 *   uninstalls the datapack first, then clears, held to that list. From the Data Installer's button
 *   (`progress: 'modal'`) it runs in the screen's progress window, one row per step.
 *
 * Both read every other project on this machine (`readWipeClaims`): what any project's install records
 * list on the chosen websites is left, and so is any company, catalog, group, attribute set or
 * attribute a record of any website lists.
 *
 * Both find the ERP integration serving the instance, from any local project (`findWipeErp`): the
 * clearing closes every order itself, and when the integration sends some chosen websites' orders to
 * an ERP, its ERP is brought in line and filled again from Commerce after the clearing ("One action,
 * ERP included", owner 2026-10-30; Commerce is the source system, 2026-11-11).
 *
 * Clear Commerce Instance (step 06, C4) goes through the same check, handed `websites` (`[]`: the
 * instance's websites with the projects using each; codes: the list for clearing them, whoever put
 * the data there; `demoDataInstanceCheck.ts`), and its own clearing, `clear-commerce-instance`
 * (`demoDataInstanceClear.ts`), which also needs `understood`. Its plans are kept apart.
 *
 * A third, `open-commerce-admin`, opens the project's Commerce Admin through the house opener
 * (`openCommerceAdmin`): the window's way to a type Commerce refused to read.
 *
 * Both open the project's own signed Commerce access (`projectCommerce`, Store: `all`), after the
 * sign-in is checked against the org that owns the store (`orgGuard`, adobe-org-context).
 *
 * @module features/data-installer/handlers/demoDataHandlers
 */

import { projectCommerce } from '../services/buildDatapackEngine';
import { nodeRecordFiles } from '../services/demoBuilderEngine/installRecord';
import { findWipeErp } from '../services/demoDataWipe/wipeErpDeps';
import { checkDemoData } from './demoDataCheck';
import { clearDemoData } from './demoDataClear';
import { checkInstance, instanceChoices } from './demoDataInstanceCheck';
import { clearInstance } from './demoDataInstanceClear';
import { type DemoDataDeps, NO_PROJECT, type ShownPlans } from './demoDataStore';
import { ownNames } from './packSave';
import { readRemovalChangesOf } from './removalChanges';
import { loadOtherProjects } from '@/core/state/otherProjects';
import { openCommerceAdmin } from '@/core/utils/commerceAdmin';
import { DEMO_DATA_CLEAR_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
import type { ClearInstanceRequest, DemoDataRequest } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

export type { DemoDataDeps } from './demoDataStore';

/** What opening the Admin came to, as the window's problem line says it when it did not open. */
async function openAdmin(deps: DemoDataDeps, context: HandlerContext): Promise<HandlerResponse> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return NO_PROJECT;
    const opening = await deps.openAdmin(project);
    if (opening.outcome === 'opened') return { success: true };
    return { success: false, error: opening.outcome === 'no-url' ? 'No Admin Panel URL is set for this project.' : "This project's Admin Panel URL is not valid." };
}

const isCodeList = (value: unknown): value is string[] => Array.isArray(value) && value.every((code) => typeof code === 'string' && code !== '');

/** The check, by what it was handed: the project's websites, the instance's websites, or the websites named. */
function check(deps: DemoDataDeps, plans: { project: ShownPlans; instance: ShownPlans }, context: HandlerContext, payload?: DemoDataRequest): Promise<HandlerResponse> {
    const websites = payload?.websites;
    if (websites === undefined) return checkDemoData(deps, plans.project, context);
    if (!isCodeList(websites)) return Promise.resolve({ success: false, error: 'Name the websites by their codes.', code: ErrorCode.INVALID_OPERATION });
    return websites.length === 0 ? instanceChoices(deps, context) : checkInstance(deps, plans.instance, context, websites);
}

/**
 * The handlers over the deps given: the check, the clearing, and Open Commerce Admin for a type
 * Commerce refused to read and for what a clearing left to the Admin (step 06, C2b and C3).
 *
 * @param deps - Commerce access, the org check, the record files, the other projects and the removal
 */
export function createDemoDataHandlers(deps: DemoDataDeps) {
    const plans = { project: new Map(), instance: new Map() } as const satisfies Record<string, ShownPlans>;
    return defineHandlers({
        'check-demo-data': (context: HandlerContext, payload?: DemoDataRequest) => check(deps, plans, context, payload),
        'clear-demo-data': narrateOutcomeToModal<DemoDataRequest>(
            (context, payload) => clearDemoData(deps, plans.project, context, payload),
            () => DEMO_DATA_CLEAR_OPERATION_ID,
        ),
        'clear-commerce-instance': narrateOutcomeToModal<ClearInstanceRequest>(
            (context, payload) => clearInstance(deps, plans.instance, context, payload),
            () => DEMO_DATA_CLEAR_OPERATION_ID,
        ),
        'open-commerce-admin': (context: HandlerContext) => openAdmin(deps, context),
    });
}
/** The project's own access, the org check against the store's org, the records on disk, every other local project, and the engine's removal. */
export const DEFAULT_DEMO_DATA_DEPS: DemoDataDeps = {
    commerce: (context, project) => projectCommerce({ project, authManager: context.authManager, secrets: context.context?.secrets })(),
    guard: async (context, project) => (context.authManager ? (await orgGuard(context, project, context.authManager))?.error : undefined),
    files: nodeRecordFiles,
    others: (context, project) => loadOtherProjects(context, project.path),
    erp: findWipeErp,
    // No button spinner waits on it, so the notification shows Chrome starting (`openCommerceAdmin`).
    openAdmin: (project) => openCommerceAdmin(project, { notify: true }),
    remove: (project, context, report, given, leaving) => removeProjectSampleDataOutcome(project, context, report, { given }, leaving),
    changes: (context, project) => readRemovalChangesOf(context, project),
    ownNames: (context) => ownNames(context),
};

export const demoDataHandlers = createDemoDataHandlers(DEFAULT_DEMO_DATA_DEPS);
