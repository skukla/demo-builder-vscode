/**
 * Removing a pack by its install record, as the engine's one removal path: a removal job
 * (`startDelete`) and an import that replaces the demo's pack (walk F97) both run it, so the two
 * cannot remove differently. Moved out of `engine.ts`, which was at its size limit.
 *
 * @module features/data-installer/services/demoBuilderEngine/engineRemoval
 */

import type { DataTypeStatus, KeptRootStep } from '../../types';
import type { RecordFiles } from './installRecord';
import { refusedRemovalsLine } from './removalRuns';
import { containersLine } from './removers';
import { removePack } from './runPack';
import { settingsLine } from './storeConfigKind';
import type { DatapackId } from '@/types/datapack';

/**
 * A removal of a pack this engine has no record of (step 14 item 20, owner 2026-10-30): refused,
 * with nothing matched by name, and the SC pointed at "Clear demo data" (`demoDataWipe/wipePlan.ts`),
 * which clears what Demo Builder did not install. Agents reach it as `check_demo_data` and `clear_demo_data`.
 */
export const NO_RECORD =
    'Demo Builder did not install this datapack in this project, so it has no record of what the datapack made and uninstalls ' +
    'nothing by name. To clear what an earlier install left in Commerce, use Clear Demo Data on the Data Installer screen.';

/** What a removal did, as the job reports it. */
export interface RecordedRemoval {
    /** What it kept, refused or put back, in one line; absent when there is nothing to say. */
    note?: string;
    /** It kept containers holding the SC's things, or Commerce refused some, so part is still in the store. */
    leftInStore: boolean;
    /** Commerce refused to take some of it out: still in the store and on the record, and named in the note. */
    refused: boolean;
    /** The kept root's Admin step (step 12). */
    keptRoot?: KeptRootStep;
}

/**
 * Remove `pack` by its install record, throwing {@link NO_RECORD} when it has none.
 *
 * @param commerce - the project's signed Commerce access
 * @param target.progress - told how far it has got ("450 of 2,046 products removed")
 */
export async function removeRecordedPack(
    commerce: Parameters<typeof removePack>[0],
    files: RecordFiles,
    target: {
        projectPath: string;
        pack: DatapackId;
        log: (line: string) => void;
        progress: (line: string) => void;
    },
): Promise<RecordedRemoval> {
    const result = await removePack(commerce, files, target);
    if (result.noRecord) throw new Error(NO_RECORD);
    const lines = [
        containersLine(result.kept),
        refusedRemovalsLine(result.refused, 'Uninstalling'),
        settingsLine(result.settings, 'Put back'),
    ];
    return {
        note: lines.filter(Boolean).join(' ') || undefined,
        leftInStore: result.kept.length > 0 || result.refused.length > 0,
        refused: result.refused.length > 0,
        ...(result.keptRoot ? { keptRoot: result.keptRoot } : {}),
    };
}

/** The part of a job removing the pack an import replaces moves: its row's state and line. */
interface ReplacingJob {
    phase?: string;
    detail?: string;
    replacing?: DataTypeStatus;
}

/**
 * Remove the pack an import replaces (walk F97), its row moving as it runs: in progress with the
 * removal's count as its line, then done. A removal that throws, or that Commerce refused part of,
 * stops the import before anything is installed: the row is left in progress for the job's failure
 * to mark where it stopped, and the project keeps naming the old pack, whose record still lists what
 * stayed, so removing it again tries that again. Containers kept because they hold the SC's things
 * do not stop it: the note says which.
 *
 * @returns what the removal kept, refused or put back, in one line, for the install's note
 */
export async function removeReplacedPack(
    job: ReplacingJob,
    commerce: Parameters<typeof removePack>[0],
    files: RecordFiles,
    target: { projectPath: string; pack: DatapackId; log: (line: string) => void },
): Promise<string | undefined> {
    job.phase = undefined;
    job.replacing = 'processing';
    const progress = (line: string): void => void (job.detail = line);
    const removal = await removeRecordedPack(commerce, files, { projectPath: target.projectPath, pack: target.pack, log: target.log, progress });
    job.detail = undefined;
    if (removal.refused) throw new Error(`${removal.note ?? 'Commerce refused part of the uninstall.'} Nothing was installed.`);
    job.replacing = 'success';
    return removal.note;
}
