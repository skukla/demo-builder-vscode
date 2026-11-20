/**
 * What "Save Changes to My Luma" reads (step-04 S2; decisions Phase 7b, J3-1; P4-Q3): what its
 * install record lists, by type (`get-datapack-removal-scope`), and the SC's changes, counted by type
 * and the records added by hand since the install (`get-datapack-removal-changes` with `added`,
 * step-07 E1), both sent once as the window opens. Two reads are enough: what the datapack holds,
 * and what changed in it. The datapack's records (`get-datapack-records`) are read only when the
 * install record is empty, to count what it holds. No Review Records (walk F216, owner 2026-11-17):
 * it listed the datapack's old names under an Update title; the counts say what the save takes.
 *
 * @module features/data-installer/ui/components/save/useSaveSummary
 */

import { useEffect, useMemo } from 'react';
import type { DatapackRemovalChanges, DatapackRemovalScope, RecordedKind } from '../../../removalChanges';
import { useDataInstallerRequest } from '../../hooks/useDataInstallerRequest';
import type { TypeRow } from '../job/installRows';
import type { PackBeingSaved } from './packBeingSaved';
import { saveRows } from './saveRows';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackRecordsRequest, DatapackRecordsResult } from '@/types/webviewRequests';

const READ_CHANGES = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };
const RECORD_UNREAD = "What the datapack installed couldn't be read.";
const CHANGES_UNCHECKED = "Your changes couldn't be checked.";

export interface SaveSummary {
    /** Both reads have answered, either way. */
    ready: boolean;
    rows: TypeRow[];
    /** What could not be read, as the problem line under the table says it. */
    problem?: string;
}

/** The datapack as the reads name it: its store only when it is the library. */
function packFields(pack: PackBeingSaved): DatapackRecordsRequest {
    return {
        datapackName: pack.id.name,
        version: pack.id.version,
        ...(pack.source === 'library' ? { source: 'library' as const } : {}),
    };
}

/** What the datapack holds, by type, counted from its records (`get-datapack-records`). */
function kindsOfRecords(value: DatapackRecordsResult | null | undefined): RecordedKind[] | undefined {
    if (!value) return undefined;
    return Object.entries(value.records).map(([kind, names]) => ({ kind, count: names.length }));
}

/** The problem line: the record first, since the table stands on it. */
function problemOf(scopeFailed: boolean, changesFailed: boolean): string | undefined {
    if (scopeFailed) return RECORD_UNREAD;
    return changesFailed ? CHANGES_UNCHECKED : undefined;
}

/** @param pack - the datapack being saved into. Must be stable. */
export function useSaveSummary(pack: PackBeingSaved): SaveSummary {
    const scope = useDataInstallerRequest<DatapackRemovalScope>('get-datapack-removal-scope');
    const changes = useDataInstallerRequest<DatapackRemovalChanges>(
        'get-datapack-removal-changes',
        READ_CHANGES,
    );
    const records = useDataInstallerRequest<DatapackRecordsResult>('get-datapack-records');
    const loadScope = scope.load;
    const loadChanges = changes.load;
    useEffect(() => {
        loadScope({ datapackName: pack.id.name, version: pack.id.version });
        loadChanges({ ...packFields(pack), added: true });
    }, [loadScope, loadChanges, pack]);
    // An install that created nothing leaves an empty record (walk F186): what the datapack holds
    // then comes from its own records, read now rather than at Review Records.
    const recordEmpty = scope.value?.kinds?.length === 0;
    const loadRecords = records.load;
    useEffect(() => {
        if (recordEmpty) loadRecords(packFields(pack));
    }, [recordEmpty, loadRecords, pack]);
    const held = recordEmpty ? kindsOfRecords(records.value) : scope.value?.kinds;
    const changed = changes.value?.kinds;
    const added = changes.value?.added;
    const rows = useMemo(() => saveRows(held ?? [], changed ?? [], added ?? []), [held, changed, added]);
    const problem = problemOf(
        scope.failure !== null || (scope.settled && !held),
        changes.failure !== null,
    );
    return {
        ready: scope.settled && changes.settled && (!recordEmpty || records.settled),
        rows,
        ...(problem ? { problem } : {}),
    };
}
