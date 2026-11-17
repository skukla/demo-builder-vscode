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
 *
 * Pure: the caller reads the install record and hands its step in.
 *
 * @module features/dashboard/services/finishSetup
 */

import { rootStepItem } from '@/features/data-installer/services/demoBuilderEngine/packRootCheck';
import { PACK_ROOT_STEP_ID, type PackRootStep } from '@/features/data-installer/services/demoBuilderEngine/packRootStep';
import { REPUBLISH_CODE_STEP } from '@/features/eds/services/storefront/codeStepRecord';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { FinishSetupRecord, Project } from '@/types/base';

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

/** The datapack's root step, with the SC's Skip or Mark as Done from the project laid over it. */
function rootStep(step: PackRootStep, record: FinishSetupRecord | undefined): SetupChecklistItem {
    const item = rootStepItem(step);
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
    return [
        ...(code ? [code] : []),
        ...(packRoot ? [rootStep(packRoot, records[PACK_ROOT_STEP_ID])] : []),
    ];
}
