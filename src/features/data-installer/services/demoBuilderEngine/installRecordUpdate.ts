/**
 * What an update does to the install record (step-07 U1, J9): carry it over to the newer version, and
 * note the data types an update left on the older one. Beside `installRecord.ts`, which owns the
 * record's shape and its file.
 *
 * @module features/data-installer/services/demoBuilderEngine/installRecordUpdate
 */

import { InstallRecordError, type RecordFiles, forgetInstallRecord, readInstallRecord, writeInstallRecord } from './installRecord';
import type { DatapackId } from '@/types/datapack';

const packLabel = (pack: DatapackId): string => `${pack.name}@${pack.version}`;

/**
 * Copy a pack's record onto a newer version of the same pack (step-07 U1, Update): what the older
 * version made, and the fingerprints that say what the SC edited since, become the newer version's,
 * so installing it compares against them. The older record stays: the caller forgets it once the
 * project names the newer version, so the record and the project never disagree. A newer version
 * that already has a record (an update that stopped part way) is not overwritten.
 *
 * @returns whether a record was copied
 */
export async function copyInstallRecord(files: RecordFiles, projectPath: string, from: DatapackId, to: DatapackId): Promise<boolean> {
    if (from.name !== to.name) throw new InstallRecordError(`${packLabel(from)} cannot be updated to ${packLabel(to)}: they are different datapacks.`);
    if ((await readInstallRecord(files, projectPath, to)) !== undefined) return false;
    const record = await readInstallRecord(files, projectPath, from);
    if (!record) return false;
    await writeInstallRecord(files, projectPath, { ...record, pack: { name: to.name, version: to.version } });
    return true;
}

/**
 * Move a pack's record onto a newer version: copy it (`copyInstallRecord`), then forget the older one.
 * The engine's own carry for an update (`ImportRequest.updates`); the update handler copies first, so
 * here it finds the newer record there and moves nothing.
 *
 * @returns whether a record was moved
 */
export async function carryInstallRecord(files: RecordFiles, projectPath: string, from: DatapackId, to: DatapackId): Promise<boolean> {
    if (!(await copyInstallRecord(files, projectPath, from, to))) return false;
    await forgetInstallRecord(files, projectPath, from);
    return true;
}

/**
 * Add data types to a pack's update note (`behind`): an update job that did not end in success leaves
 * the types it asked for on the note, so the dot stays and Update offers them again.
 */
export async function addUpdateBehind(files: RecordFiles, projectPath: string, pack: DatapackId, types: readonly string[]): Promise<void> {
    const record = await readInstallRecord(files, projectPath, pack);
    if (!record) return;
    const behind = [...new Set([...(record.behind ?? []), ...types])];
    await writeInstallRecord(files, projectPath, { ...record, behind });
}

/**
 * Note on a pack's record the data types an update leaves on the older version (step-07 U1), or
 * clear the note with none. Nothing for a pack with no record.
 */
export async function markUpdateBehind(files: RecordFiles, projectPath: string, pack: DatapackId, types: readonly string[]): Promise<void> {
    const record = await readInstallRecord(files, projectPath, pack);
    if (!record) return;
    const { behind: _was, ...rest } = record;
    await writeInstallRecord(files, projectPath, types.length > 0 ? { ...rest, behind: [...types] } : rest);
}
