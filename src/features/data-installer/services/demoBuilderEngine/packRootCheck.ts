/**
 * The pack's one Admin step, read and checked without installing again (datapack-engine step 12):
 * what the pack's flyout shows, and its Check. The check is the install's own
 * (`checkPackRoot`, read-only: `GET store/storeGroups`, the store's `root_category_id`); only the
 * install record is written, to say where the step stands and what the check concluded (done, not
 * done, or could not tell: the step's dialog says each differently).
 *
 * @module features/data-installer/services/demoBuilderEngine/packRootCheck
 */

import { type RecordFiles, nodeRecordFiles, openInstallRecord, readInstallRecord } from './installRecord';
import { type PackRootStep, type RootCheck, checkPackRoot, packRootGuideStep } from './packRootStep';
import type { SetupCheckState, SetupChecklistItem } from '@/types/appBuilderComponents';
import type { SetupCheckOutcome } from '@/types/base';
import type { CommerceGet } from '@/types/commerceWire';
import type { DatapackId } from '@/types/datapack';

/** What reading or checking the step needs: the project's store, and where its records are. */
export interface RootCheckDeps {
    commerce: () => Promise<{ get: CommerceGet } | { refusal: string }>;
    projectPath: string;
    files?: RecordFiles;
}

/**
 * What the step's last check concluded: as recorded, else (a record kept before the conclusion
 * was) as its note says, done or not; nothing when no check has run.
 */
function lastCheckOf(step: PackRootStep): SetupCheckOutcome | undefined {
    if (step.lastCheck) return step.lastCheck;
    if (step.note === undefined) return undefined;
    return step.state === 'done' ? 'passed' : 'failed';
}

/** The step as the setup guide lists one: its words, where it stands, and that Demo Builder can check it. */
export function rootStepItem(step: PackRootStep): SetupChecklistItem {
    const lastCheck = lastCheckOf(step);
    const checkState: SetupCheckState = lastCheck ?? 'unchecked';
    return {
        ...packRootGuideStep(step),
        state: step.state,
        ...(step.note ? { note: step.note } : {}),
        ...(lastCheck ? { lastCheck } : {}),
        checkable: true,
        checkState,
    };
}

/** What a check concluded: done, not done, or it could not tell. */
function outcomeOf(found: RootCheck): SetupCheckOutcome {
    if (found.done === undefined) return 'unknown';
    return found.done ? 'passed' : 'failed';
}

/** Done when the check passed, open when it failed, as it was when it could not tell. */
function stateAfter(step: PackRootStep, found: RootCheck): PackRootStep['state'] {
    if (found.done === undefined) return step.state;
    return found.done ? 'done' : 'open';
}

/** The step the pack's install record holds, or undefined when it left none. Reads no store. */
export async function recordedRootStep(files: RecordFiles, projectPath: string, pack: DatapackId): Promise<PackRootStep | undefined> {
    return (await readInstallRecord(files, projectPath, pack))?.rootStep;
}

/**
 * Check the step against the store and write down what was found: done when the store shows the
 * pack's root, open again when it does not, unchanged (with the note) when the check could not tell.
 *
 * @returns the step as it now stands, or undefined when the pack left none
 * @throws Error with the refusal when the project's store cannot be opened
 */
export async function checkRecordedRootStep(deps: RootCheckDeps, pack: DatapackId): Promise<PackRootStep | undefined> {
    const files = deps.files ?? nodeRecordFiles;
    const step = await recordedRootStep(files, deps.projectPath, pack);
    if (!step) return undefined;
    const commerce = await deps.commerce();
    if ('refusal' in commerce) throw new Error(commerce.refusal);
    const found = await checkPackRoot(commerce.get, step);
    const checked: PackRootStep = { ...step, state: stateAfter(step, found), note: found.note, lastCheck: outcomeOf(found) };
    const recorder = await openInstallRecord(files, deps.projectPath, pack, () => new Date().toISOString());
    await recorder.setRootStep(checked);
    return checked;
}
