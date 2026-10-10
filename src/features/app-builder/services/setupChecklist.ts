/**
 * An integration's demo setup checklist (AB-26x): the steps its catalog entry declares
 * (`setupSteps`), each with where the SC is on it (`appBuilderComponents[id].setupSteps`).
 *
 * The steps are demo setup that Commerce needs and no API can do, so Demo Builder lists
 * them and the SC does them in Commerce Admin (owner, 2026-09-25: the checklist lives in
 * Demo Builder, not the integration; a prospect handed the integration reads its README).
 *
 * Pure, over the bundled catalog (the webview-safe lookup `integrationCardModel` already
 * uses): the flyout draws it with nothing from the extension, and the extension's handlers
 * and agent tools read it the same way.
 *
 * @module features/app-builder/services/setupChecklist
 */

import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, SetupCheckOutcome, SetupStepRecord } from '@/types/base';

/**
 * What a check concluded, for a record saved before the outcome was kept (2026-10-01): a
 * passing check marked the step done and a failing one opened it, so the state says which.
 */
function inferredOutcome(saved: SetupStepRecord): SetupCheckOutcome {
    return saved.state === 'done' ? 'passed' : 'failed';
}

/** What the step's last check concluded, or undefined when no check has run. */
function lastCheckOf(saved: SetupStepRecord | undefined): SetupCheckOutcome | undefined {
    if (!saved?.note) return undefined;
    return saved.lastCheck ?? inferredOutcome(saved);
}

/**
 * Whether a step reads as done: marked done, and its last check did not come back unable to
 * tell. A check that could not tell must never read as done (Justrite 2026-10-10: a step
 * saved done, then checked "could not", previewed as done and would have skipped seven
 * attribute sets without `erp_owner`).
 *
 * This is the SAVED, no-network answer: what the card's "n of m done" line and the guide show
 * before a check runs. "Prepare this store" never reads it; it checks the store fresh.
 */
export function isStepDone(saved: SetupStepRecord | undefined): boolean {
    return saved?.state === 'done' && lastCheckOf(saved) !== 'unknown';
}

/** The state the checklist reports: dismissed stays, done only when the check agrees, else open. */
function stateOf(saved: SetupStepRecord | undefined): SetupChecklistItem['state'] {
    if (saved?.state === 'dismissed') return 'dismissed';
    return isStepDone(saved) ? 'done' : 'open';
}

/** The placeholder a step's `enter` value carries for the ERP it is entered for. */
const ERP_NAME = '<ERP name>';

/**
 * A step's values with each ERP's own name filled in: one value per ERP for a value naming
 * the placeholder ("<ERP name> Warehouse" -> "Justrite Warehouse", "Accuform Warehouse"),
 * the trailing "ERP" dropped as the ERP's list id drops it. The placeholder stays when the
 * integration has no ERP yet, which is still the instruction (owner, 2026-10-01).
 */
function withErpNames(values: string[], erpNames: readonly string[]): string[] {
    if (erpNames.length === 0) return values;
    const short = erpNames.map((name) => name.replace(/\s+ERP$/iu, '').trim() || name);
    return values.flatMap((value) => (value.includes(ERP_NAME) ? short.map((name) => value.replace(ERP_NAME, name)) : [value]));
}

/**
 * The checklist for one component, or undefined when its entry declares no steps.
 *
 * @param id - the component's id
 * @param state - its saved record (the catalog id, and where the SC is on each step)
 * @param erpNames - the names of the ERPs it uses, for a value entered once per ERP
 * @returns the steps with their state
 */
export function setupChecklistOf(
    id: string,
    state: Pick<AppBuilderComponentState, 'catalogId' | 'setupSteps' | 'storePreparation'>,
    erpNames: readonly string[] = [],
): SetupChecklistItem[] | undefined {
    const steps = getAppBuilderComponentEntry(state.catalogId ?? id)?.setupSteps;
    if (!steps || steps.length === 0) return undefined;
    return steps.map((step) => {
        const saved = state.setupSteps?.[step.id];
        const lastCheck = lastCheckOf(saved);
        return {
            id: step.id,
            title: step.title,
            why: step.why,
            where: step.where,
            ...(step.label ? { label: step.label } : {}),
            ...(step.path ? { path: step.path } : {}),
            ...(step.enter ? { enter: withErpNames(step.enter, erpNames) } : {}),
            ...(step.then ? { then: step.then } : {}),
            ...(step.icon ? { icon: step.icon } : {}),
            ...(step.optional ? { optional: true } : {}),
            state: stateOf(saved),
            ...(saved?.note ? { note: saved.note } : {}),
            ...(lastCheck ? { lastCheck } : {}),
            checkState: lastCheck ?? 'unchecked',
            checkable: step.check !== undefined,
            ...(step.fix ? { fix: step.fix } : {}),
            applicable: step.fix !== undefined,
            ...(state.storePreparation?.steps[step.id] ? { fixApplied: true } : {}),
        };
    });
}

/**
 * The step to do next: the first one still to do (open, not optional), in the guide's
 * order. The flyout names
 * it, so the SC knows what is left without opening the guide (owner, 2026-10-01).
 *
 * @param items - the checklist
 * @returns that step's title, or undefined when none is open
 */
export function nextSetupStep(items: SetupChecklistItem[]): string | undefined {
    return items.find(isLeftToDo)?.title;
}
