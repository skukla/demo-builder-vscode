/**
 * What "Save Changes to My Luma" reads (step-04 S2; decisions Phase 7b, J3-1; P4-Q3): what its
 * install record lists, by type (`get-datapack-removal-scope`), and the SC's changes, counted by type
 * (`get-datapack-removal-changes`), both sent once as the window opens; and, from Review Records, the
 * datapack's records (`get-datapack-records`), read once. Two reads are enough: what the datapack
 * holds, and what changed in it.
 *
 * @module features/data-installer/ui/components/save/useSaveSummary
 */

import { useEffect, useMemo, useState } from 'react';
import type { DatapackRemovalChanges, DatapackRemovalScope } from '../../../removalChanges';
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
    /** Review Records is open. */
    reviewing: boolean;
    records: Record<string, string[]> | null;
    recordsReading: boolean;
    review: () => void;
    back: () => void;
}

/** The datapack as the reads name it: its store only when it is the library. */
function packFields(pack: PackBeingSaved): DatapackRecordsRequest {
    return {
        datapackName: pack.id.name,
        version: pack.id.version,
        ...(pack.source === 'library' ? { source: 'library' as const } : {}),
    };
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
    const [reviewing, setReviewing] = useState(false);
    const loadScope = scope.load;
    const loadChanges = changes.load;
    useEffect(() => {
        loadScope({ datapackName: pack.id.name, version: pack.id.version });
        loadChanges(packFields(pack));
    }, [loadScope, loadChanges, pack]);
    const held = scope.value?.kinds;
    const changed = changes.value?.kinds;
    const rows = useMemo(() => saveRows(held ?? [], changed ?? []), [held, changed]);
    const problem = problemOf(
        scope.failure !== null || (scope.settled && !held),
        changes.failure !== null,
    );
    return {
        ready: scope.settled && changes.settled,
        rows,
        ...(problem ? { problem } : {}),
        reviewing,
        records: records.value?.records ?? null,
        recordsReading: !records.settled,
        review: () => {
            setReviewing(true);
            if (!records.settled && !records.loading) records.load(packFields(pack));
        },
        back: () => setReviewing(false),
    };
}
