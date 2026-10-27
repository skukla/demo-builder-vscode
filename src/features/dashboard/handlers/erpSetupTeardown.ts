/**
 * Undo what Demo Builder set up in Commerce for the ERP integration, before it is removed:
 * the `erp_owner` tags its ERPs' products carry, `erp_owner` on the attribute sets Demo Builder
 * added it to, and what the demo setup's Apply changed. Removing a single ERP clears that ERP's
 * own tags.
 *
 * Why here and first: the undo of each lived on the integration's card, and the record of the
 * old values on its project entry, so removing the integration took both with it and left the
 * store with changes nothing could put back (Justrite, 2026-10-19: 139 tagged products, the
 * attribute on 12 sets and the preparation, all orphaned). It runs before the removal, while
 * the integration's Commerce access still stands. Reuses the undo each card action runs.
 *
 * @module features/dashboard/handlers/erpSetupTeardown
 */

import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { productBulkFollow } from '@/features/app-builder/services/commerceBulk';
import { listAssignableProducts } from '@/features/app-builder/services/erpAssignSelection';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { removeOwnerFromSets } from '@/features/app-builder/services/erpOwnerAttributeSets';
import { runSetupCheck } from '@/features/app-builder/services/setupChecks';
import { undoPreparation, type PreparationDeps } from '@/features/app-builder/services/storePreparation/storePreparationEngine';
import { getAppBuilderComponentCatalog, getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { erpNamesOf, setupCheckReader } from '@/features/dashboard/services/setupCheckReader';
import { openCommerce, writeOwnerValues, type CommerceClient } from '@/features/project-creation/services/erpAssignProducts';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';

/** What the undo did, and what it could not, in sentences. */
export interface TeardownOutcome {
    done: string[];
    failed: string[];
}

type Report = (stage: string, step?: string, position?: OperationPosition) => void;

/** One removal's undo: where it runs, Commerce opened once, and what it has done so far. */
interface TeardownRun {
    context: HandlerContext;
    project: Project;
    id: string;
    commerce: CommerceClient;
    report: Report;
    out: TeardownOutcome;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The ERPs (component ids) whose tags go: every one the integration serves, the ERP removed, or none. */
function tagOwnersOf(integration: boolean, served: string[], isErp: boolean, id: string): string[] {
    if (integration) return served;
    return isErp ? [id] : [];
}

/** The ERP list ids whose tags go: every ERP the integration serves, or the one ERP removed. */
function listIdsFor(project: Project, id: string): { listIds: string[]; integration: boolean } {
    const catalog = getAppBuilderComponentCatalog();
    const served = systemsUsedBy(project, id, catalog);
    const state = getAppBuilderComponent(project, id);
    const integration = served.length > 0 || Boolean(state?.storePreparation || state?.erpOwnerSets);
    return { listIds: tagOwnersOf(integration, served, Boolean(state?.usedBy), id).flatMap((erp) => erpListIdOf(project, erp, catalog) ?? []), integration };
}

/** Clear `erp_owner` on every product tagged for one of these ERPs, in one bulk call. */
async function clearTags({ commerce, report, out }: TeardownRun, listIds: readonly string[]): Promise<void> {
    const stage = OPERATION_STAGES.undoingStoreSetup.label;
    report(stage, 'Reading which products are tagged for its ERPs');
    const tagged = (await listAssignableProducts(commerce.get)).filter((row) => listIds.includes(row.owner));
    if (tagged.length === 0) return;
    report(stage, `Clearing erp_owner on ${tagged.length} products`);
    const bulk = await writeOwnerValues(commerce, tagged.map((row) => ({ sku: row.sku, value: '' })), productBulkFollow((step) => report(stage, step)));
    const left = bulk.failed.length + bulk.open;
    if (left > 0) out.failed.push(`${plural(left, 'product keeps', 'products keep')} its erp_owner tag.`);
    else out.done.push(`Cleared the erp_owner tag on ${plural(tagged.length, 'product', 'products')}.`);
}

/** Take `erp_owner` out of the sets Demo Builder added it to. */
async function removeSets({ commerce, project, id, report, out }: TeardownRun): Promise<void> {
    const record = getAppBuilderComponent(project, id)?.erpOwnerSets;
    if (!record || record.sets.length === 0) return;
    report(OPERATION_STAGES.undoingStoreSetup.label, 'Taking erp_owner out of attribute sets');
    const result = await removeOwnerFromSets(commerce.send, record.sets);
    if (result.error) out.failed.push(`erp_owner is still in an attribute set: ${result.error}`);
    if (result.changed.length > 0) out.done.push(`Took erp_owner out of ${plural(result.changed.length, 'attribute set', 'attribute sets')}.`);
}

/** Put back what the demo setup's Apply changed, from its record, as a step's Undo does. */
async function undoPrepared({ context, project, id, commerce, report, out }: TeardownRun): Promise<void> {
    const state = getAppBuilderComponent(project, id);
    const record = state?.storePreparation;
    if (!state || !record) return;
    const steps = getAppBuilderComponentEntry(state.catalogId ?? id)?.setupSteps ?? [];
    const { read, scope } = await setupCheckReader(context, project);
    const erpNames = erpNamesOf(project, id);
    const stage = OPERATION_STAGES.undoingStoreSetup.label;
    const deps: PreparationDeps = {
        commerce,
        websiteCode: scope.websiteCode,
        erpNames,
        runCheck: (check) => runSetupCheck(check, read, { ...scope, erpNames }),
        onProgress: (step, what) => report(stage, `${step.title}: ${what}`),
    };
    const outcome = await undoPreparation(steps, record, deps);
    const rejected = outcome.reports.flatMap((step) => step.rejected.map((why) => `${step.title}: ${why}`));
    if (rejected.length > 0) out.failed.push(`Some of the demo setup was not undone (${rejected.join('; ')}).`);
    const undone = outcome.reports.filter((step) => step.state === 'undone').length;
    if (undone > 0) out.done.push(`Undid ${plural(undone, 'demo setup step', 'demo setup steps')}.`);
}

/**
 * Undo the integration's store setup, or one ERP's tags; nothing for any other component.
 *
 * @param context - the handler context
 * @param project - the project, before the removal
 * @param id - the component being removed
 * @param report - the stage reporter
 * @returns what was undone and what was not; undefined when there is nothing to undo
 */
export async function undoErpSetup(context: HandlerContext, project: Project, id: string, report: Report): Promise<TeardownOutcome | undefined> {
    const { listIds, integration } = listIdsFor(project, id);
    if (!integration && listIds.length === 0) return undefined;
    const out: TeardownOutcome = { done: [], failed: [] };
    if (!context.authManager) return { done: [], failed: ['Adobe sign-in is required to undo its store setup.'] };
    report(OPERATION_STAGES.undoingStoreSetup.label);
    const commerce = await openCommerce(project, context.authManager, context.context?.secrets);
    if ('refusal' in commerce) return { done: [], failed: [commerce.refusal] };
    const run: TeardownRun = { context, project, id, commerce, report, out };
    try {
        // Tags first: Commerce drops a set's values with the attribute, and the sets wait for no tag.
        if (listIds.length > 0) await clearTags(run, listIds);
        if (integration) {
            await removeSets(run);
            await undoPrepared(run);
        }
    } catch (error) {
        out.failed.push(error instanceof Error ? error.message : String(error));
    }
    return out;
}
