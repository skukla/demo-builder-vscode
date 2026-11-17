/**
 * The install state of the project's pack (walk F218): when this engine installed it and whether an
 * update left data types on the older version. The Datapacks screen and the dashboard's Datapacks
 * tile read it alike, so the two dots cannot disagree.
 *
 * @module features/data-installer/services/demoBuilderEngine/installState
 */

import { nodeRecordFiles, readInstallRecord } from './installRecord';
import type { DatapackId } from '@/types/datapack';
/** When this engine installed the project's pack, and whether an update left data types behind. */
export interface InstallState {
    installedAt?: string;
    updateBehind?: boolean;
}

/**
 * The install state of the project's pack: nothing without a record, or one that cannot be read. The
 * Datapacks screen and the dashboard's Datapacks tile read it alike (walk F218).
 */
export async function installStateOf(projectPath: string | undefined, pack: DatapackId | undefined): Promise<InstallState> {
    if (!projectPath || !pack) return {};
    try {
        const record = await readInstallRecord(nodeRecordFiles, projectPath, pack);
        if (!record) return {};
        return { installedAt: record.startedAt, ...((record.behind ?? []).length > 0 ? { updateBehind: true } : {}) };
    } catch {
        return {};
    }
}
