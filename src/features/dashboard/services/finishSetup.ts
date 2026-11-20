/**
 * The project's Finish Setup steps (PL-101): what a run left for the SC, as the setup guide
 * lists steps (`SetupChecklistItem`), so the guide, its Check and the dashboard need no second
 * implementation. Two kinds today:
 *
 * - **Republish the Code** — code files a creation or reset left that the live site did not
 *   serve yet, from the project's record (`Project.finishSetup`, `codeStepRecord.ts`).
 *   Demo Builder can do it (Republish), so it is applicable; its Check looks at those files.
 * - **Set the Root Category** — the one Admin step a datapack can leave, from the pack's install
 *   record (`recordedRootStep`), with any Skip or Mark as Done the SC gave it on the project.
 * - **Republish the Storefront** and **Reset the Storefront** — storefront steps the SC skipped
 *   when a creation or Edit paused on them (F307, `skippedSteps.ts`). The button runs them and
 *   clears the step, so neither has a Check.
 *
 * Pure: the caller reads the install record and hands its step in.
 *
 * @module features/dashboard/services/finishSetup
 */

import { isLeftToDo } from '@/core/ui/components/integrations/setupLeftToDo';
import { SKIPPED_REPUBLISH_STEP, SKIPPED_RESET_STEP } from '@/core/utils/skippedSteps';
import { rootStepItem } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import { PACK_ROOT_STEP_ID, type PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import { REPUBLISH_CODE_STEP } from '@/features/eds/services/storefront/codeStepRecord';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { FinishSetupRecord, Project } from '@/types/base';
import type { FinishSetupStatus } from '@/types/webviewPayloads';

/** Why the code step matters, naming the files in the SC's words. */
function codeWhy(files: readonly string[]): string {
    const which =
        files.length === 1 ? files[0] : `${files.length} code files (${files.join(', ')})`;
    const have = files.length === 1 ? 'has it' : 'has them';
    return `The live site does not serve ${which} as the storefront's repository ${have} yet, so the storefront still runs the old code.`;
}

/** Republish the Code, from its record; nothing when the record names no file to check. */
function codeStep(record: FinishSetupRecord | undefined): SetupChecklistItem | undefined {
    const files = record?.files;
    if (!files || files.length === 0) return undefined;
    return {
        id: REPUBLISH_CODE_STEP,
        title: 'Republish the Code',
        why: codeWhy(files),
        where: 'Project Dashboard > Republish',
        path: ['Project Dashboard', 'Republish'],
        then: 'Check this step once the publish finishes.',
        state: record.state ?? 'open',
        ...(record.note ? { note: record.note } : {}),
        ...(record.lastCheck ? { lastCheck: record.lastCheck } : {}),
        checkState: record.lastCheck ?? 'unchecked',
        checkable: true,
        applicable: true,
    };
}

/** What a skipped-steps item says, and the tile that runs them. */
interface SkippedItemText {
    id: string;
    title: string;
    tile: string;
    why: (steps: string) => string;
}

const SKIPPED_ITEMS: readonly SkippedItemText[] = [
    {
        id: SKIPPED_REPUBLISH_STEP,
        title: 'Republish the Storefront',
        tile: 'Republish',
        why: (steps) => `Skipped while the project was set up: ${steps}. Republish runs them.`,
    },
    {
        id: SKIPPED_RESET_STEP,
        title: 'Reset the Storefront',
        tile: 'Reset',
        why: () => "The storefront's pages were not copied while the project was set up. Reset copies them.",
    },
];

/** A skipped-steps item, from its record; nothing when the record names no step. */
function skippedItem(text: SkippedItemText, record: FinishSetupRecord | undefined): SetupChecklistItem | undefined {
    const steps = record?.skipped;
    if (!steps || steps.length === 0) return undefined;
    return {
        id: text.id,
        title: text.title,
        why: text.why(steps.join(', ')),
        where: `Project Dashboard > ${text.tile}`,
        path: ['Project Dashboard', text.tile],
        then: `This step finishes when ${text.tile} does.`,
        state: record.state ?? 'open',
        checkState: 'unchecked',
        checkable: false,
        applicable: true,
    };
}

/** The datapack's root step, with the SC's Skip or Mark as Done from the project laid over it. */
function rootStep(step: PackRootStep, record: FinishSetupRecord | undefined): SetupChecklistItem {
    // The guide's rail names a step by its label: the pack's "Root category" read as a noun
    // among actions, so the rail falls back to the step's title here.
    const { label: _label, ...item } = rootStepItem(step);
    return record?.state ? { ...item, state: record.state } : item;
}

/**
 * The steps a run left, in the order the guide shows them: the code first, then the datapack's.
 * A finished step is kept, shown done, until the next creation or reset replaces the record.
 *
 * @param project - the project, whose `finishSetup` record holds the code step and the SC's states
 * @param packRoot - the step the project's datapack install record holds, if any
 */
export function finishSetupOf(
    project: Project,
    packRoot: PackRootStep | undefined,
): SetupChecklistItem[] {
    const records = project.finishSetup ?? {};
    const code = codeStep(records[REPUBLISH_CODE_STEP]);
    const skipped = SKIPPED_ITEMS.flatMap((text) => skippedItem(text, records[text.id]) ?? []);
    return [
        ...(code ? [code] : []),
        ...skipped,
        ...(packRoot ? [rootStep(packRoot, records[PACK_ROOT_STEP_ID])] : []),
    ];
}

/** Whether one of the steps, by id, is still to do. */
function due(items: SetupChecklistItem[], id: string): boolean {
    return items.some((item) => item.id === id && isLeftToDo(item));
}

/**
 * The steps as the dashboard shows them: the list, how many remain, and which tile's fix is due
 * (Republish for the code and skipped storefront steps, Reset for skipped pages, Manage
 * Commerce for the root category).
 *
 * @param items - the steps, from {@link finishSetupOf}
 * @returns undefined when no run left a step
 */
export function finishSetupStatus(items: SetupChecklistItem[]): FinishSetupStatus | undefined {
    if (items.length === 0) return undefined;
    return {
        items,
        remaining: items.filter(isLeftToDo).length,
        ...(due(items, REPUBLISH_CODE_STEP) ? { republishDue: true as const } : {}),
        ...(due(items, SKIPPED_REPUBLISH_STEP) ? { republishSkipped: true as const } : {}),
        ...(due(items, SKIPPED_RESET_STEP) ? { resetDue: true as const } : {}),
        ...(due(items, PACK_ROOT_STEP_ID) ? { adminDue: true as const } : {}),
    };
}
