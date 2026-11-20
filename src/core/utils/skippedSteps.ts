/**
 * The storefront steps an SC skipped when a creation or an Edit paused on them (F307), kept
 * as Finish Setup steps so the dashboard shows each one with the tile that runs it.
 *
 * Owner, 2026-11-19: "every dot has a corresponding action for an SC to take". The other
 * steps a run can skip already have a dot that checks what is there: a mesh or integration
 * not deployed (the Integrations tile, whose screen deploys it), a datapack install that did
 * not finish (the Datapacks tile, from its install record) and the AI files (the AI badge,
 * Regenerate AI Files). Nothing checks for these, so they are recorded:
 *
 * - **Republish the Storefront**: uploading the settings, warming the product pages, the
 *   catalog menu. Republish runs all three, and clears the step when it finishes.
 * - **Reset the Storefront**: copying the storefront's pages, which only creation and Reset
 *   do. Reset rewrites the whole Finish Setup record, so it clears the step.
 *
 * @module core/utils/skippedSteps
 */

import { OPERATION_STAGES as S } from './operationStages';
import { RESET_STAGES } from './resetStages';
import type { Project } from '@/types/base';

/** Finish Setup's id for the skipped steps Republish runs. */
export const SKIPPED_REPUBLISH_STEP = 'skipped-republish';
/** Finish Setup's id for the skipped page copy Reset runs. */
export const SKIPPED_RESET_STEP = 'skipped-reset';

/** The steps Republish runs again. */
const REPUBLISH_RUNS: readonly string[] = [
    S.publishingSettings.label,
    S.warmingProductPages.label,
    S.addingCatalogMenu.label,
];

/** The steps only Reset runs again. */
const RESET_RUNS: readonly string[] = [RESET_STAGES.copyingContent.label];

/** Add `steps` to the record `id` holds, opening it again. */
function addTo(project: Project, id: string, steps: readonly string[]): void {
    if (steps.length === 0) return;
    const held = project.finishSetup?.[id]?.skipped ?? [];
    project.finishSetup = {
        ...project.finishSetup,
        [id]: { skipped: [...new Set([...held, ...steps])] },
    };
}

/**
 * Record the storefront steps the SC skipped as Finish Setup steps (the caller saves).
 *
 * @param project - the project, changed in place
 * @param skipped - every step the run skipped; those no button here re-runs are ignored
 */
export function recordSkippedSteps(project: Project, skipped: readonly string[]): void {
    addTo(
        project,
        SKIPPED_REPUBLISH_STEP,
        skipped.filter((step) => REPUBLISH_RUNS.includes(step)),
    );
    addTo(
        project,
        SKIPPED_RESET_STEP,
        skipped.filter((step) => RESET_RUNS.includes(step)),
    );
}

/**
 * Clear the skipped steps Republish ran (the caller saves).
 *
 * @param project - the project, changed in place
 * @returns whether there was one to clear
 */
export function clearRepublishedSteps(project: Project): boolean {
    if (!project.finishSetup?.[SKIPPED_REPUBLISH_STEP]) return false;
    const { [SKIPPED_REPUBLISH_STEP]: _done, ...rest } = project.finishSetup;
    project.finishSetup = Object.keys(rest).length > 0 ? rest : undefined;
    return true;
}
