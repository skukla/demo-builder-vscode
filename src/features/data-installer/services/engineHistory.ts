/**
 * Demo Builder's engine's installs and runs, as rows the "installed" and "activity" reads can
 * show beside the service's (datapack step 14, item 17).
 *
 * The service tracks installs per store and logs every run; those two reads used to answer only
 * that, so a pack our engine installed was missing from both. Ours are per project: one install
 * record per pack (`installRecord.ts`) and the activity log (`engineActivityLog.ts`). This turns
 * them into the same row shapes, tagged `source: 'demo-builder'`, filtered the way the service
 * filters its own.
 *
 * A record is "installed" for as long as it is there, including one a failed install left: the
 * store holds what it lists, and removal takes that away. The project's Commerce instance is the
 * record's, so a project with no instance to name (`deriveImportInstance`) lists no installed rows.
 *
 * @module features/data-installer/services/engineHistory
 */

import type { ActivityEntry, InstalledDatapack } from '../types';
import type { InstallRecord } from './demoBuilderEngine/installRecord';
import type { EngineActivityEntry } from './engineActivityLog';
import type { DatapackId } from '@/types/datapack';

/** The filters both reads take, as their payloads name them. */
export interface HistoryFilter {
    commerceInstance?: string;
    datapackName?: string;
    version?: string;
    operationMode?: string;
}

function matchesPack(id: DatapackId, filter: HistoryFilter): boolean {
    if (filter.datapackName !== undefined && id.name !== filter.datapackName) return false;
    return filter.version === undefined || id.version === filter.version;
}

function matchesInstance(instance: string | undefined, filter: HistoryFilter): boolean {
    return filter.commerceInstance === undefined || instance === filter.commerceInstance;
}

/** Newest first, by an ISO timestamp; one without a time goes last. */
function newestFirst<T>(rows: T[], at: (row: T) => string | undefined): T[] {
    return [...rows].sort((a, b) => (at(b) ?? '').localeCompare(at(a) ?? ''));
}

/**
 * The packs the project's records say are installed, newest first.
 *
 * @param records - every install record beside the project (`readProjectRecords`)
 * @param projectInstance - the project's Commerce instance, which each record was written into
 */
export function engineInstalledRows(
    records: InstallRecord[],
    projectInstance: string | undefined,
    filter: HistoryFilter,
): InstalledDatapack[] {
    if (!projectInstance || !matchesInstance(projectInstance, filter)) return [];
    const rows = records
        .filter((record) => matchesPack(record.pack, filter))
        .map(
            (record): InstalledDatapack => ({
                commerceInstance: projectInstance,
                id: { name: record.pack.name, version: record.pack.version },
                dataTypes: [...new Set(record.created.map((object) => object.kind))],
                art: {},
                installedAt: record.startedAt,
                source: 'demo-builder',
                objectCount: record.created.length,
            }),
        );
    return newestFirst(rows, (row) => row.installedAt);
}

/**
 * The project's activity log as activity rows, newest first.
 *
 * @param entries - the log, newest first (`readEngineActivity`)
 * @param projectInstance - the instance for an entry written without one
 */
export function engineActivityRows(
    entries: EngineActivityEntry[],
    projectInstance: string | undefined,
    filter: HistoryFilter,
): ActivityEntry[] {
    return entries
        .map((entry) => ({ entry, instance: entry.commerceInstance ?? projectInstance }))
        .filter(({ entry, instance }) => matchesPack(entry.pack, filter) && matchesInstance(instance, filter))
        .filter(({ entry }) => filter.operationMode === undefined || entry.operation === filter.operationMode)
        .map(
            ({ entry, instance }): ActivityEntry => ({
                id: { name: entry.pack.name, version: entry.pack.version },
                dataTypes: [...entry.dataTypes],
                ...(instance ? { commerceInstance: instance } : {}),
                mode: entry.operation,
                source: 'demo-builder',
                outcome: entry.outcome,
                ...(entry.detail ? { detail: entry.detail } : {}),
                at: entry.finishedAt,
                activationId: entry.activationId,
            }),
        );
}
