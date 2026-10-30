/**
 * The pack's one Admin step, read and checked without installing again (datapack-engine step 12):
 * what the pack's flyout shows, and its Check. The check is the install's own
 * (`checkPackRoot`, read-only: `GET store/storeGroups`, the store's `root_category_id`); only the
 * install record is written, to say where the step stands.
 *
 * @module features/data-installer/services/demoBuilderEngine/packRootCheck
 */

import { type RecordFiles, nodeRecordFiles, openInstallRecord, readInstallRecord } from './installRecord';
import { type PackRootStep, type RootCheck, checkPackRoot, packRootGuideStep } from './packRootStep';
import type { SetupCheckState, SetupChecklistItem } from '@/types/appBuilderComponents';
import type { CommerceGet } from '@/types/commerceWire';
import type { DatapackId } from '@/types/datapack';

/** What reading or checking the step needs: the project's store, and where its records are. */
export interface RootCheckDeps {
    commerce: () => Promise<{ get: CommerceGet } | { refusal: string }>;
    projectPath: string;
    files?: RecordFiles;
}

/** What the step's last check concluded, as the guide says it. */
function checkStateOf(step: PackRootStep): SetupCheckState {
    if (step.note === undefined) return 'unchecked';
    return step.state === 'done' ? 'passed' : 'failed';
}

/** The step as the setup guide lists one: its words, where it stands, and that Demo Builder can check it. */
export function rootStepItem(step: PackRootStep): SetupChecklistItem {
    return { ...packRootGuideStep(step), state: step.state, ...(step.note ? { note: step.note } : {}), checkable: true, checkState: checkStateOf(step) };
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
    const checked: PackRootStep = { ...step, state: stateAfter(step, found), note: found.note };
    const recorder = await openInstallRecord(files, deps.projectPath, pack, () => new Date().toISOString());
    await recorder.setRootStep(checked);
    return checked;
}
