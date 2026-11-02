/**
 * The export screen's result: what the export did, per type. `exportResult` words it, because its
 * outcome is the dialog's title; `ExportDatapackResult` is the body under that title.
 *
 * The `reason` line is the point of this view. The service reports a failed export as an
 * all-zero count with no explanation unless `verbose` is asked for; the client asks, so the
 * explanation exists and belongs on screen. An ACO pack's outcome has the same shape.
 *
 * @module features/data-installer/ui/components/ExportDatapackResult
 */

import React from 'react';
import { dataTypeLabel } from '../dataTypeLabel';
import { DatapackResultBody } from './DatapackResultBody';
import type { ResultContent } from './importResult';
import { SaveDatapackFileButton } from './SaveDatapackFileButton';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What one data type's export did, as the handler reports it. */
interface ExportTypeOutcome {
    dataType: string;
    success: boolean;
    exported: number;
    excluded: number;
    reason?: string;
}

export interface ExportOutcome {
    success: boolean;
    perType: ExportTypeOutcome[];
}

/** One line per type: what it captured, or why it did not. */
function describeType(row: ExportTypeOutcome): string {
    const label = dataTypeLabel(row.dataType);
    if (!row.success) {
        return `${label} failed: ${row.reason ?? 'the service gave no reason'}`;
    }
    // "Left out" is true of the service's exclusions and of an ACO pack's (downloadable and
    // grouped products) alike.
    const excluded = row.excluded > 0 ? ` (${row.excluded.toLocaleString('en-US')} left out)` : '';
    return `${label}: ${row.exported.toLocaleString('en-US')} exported${excluded}`;
}

/**
 * The outcome to show: the title says how it went, and the lines what each type did. Amber when
 * some of the types did not make it, since "Exported 1 of 2" is not a clean success.
 */
export function exportResult(outcome: ExportOutcome | null, error?: string): ResultContent {
    if (error) {
        return { variant: 'error', title: 'The export could not run', message: error };
    }
    const perType = outcome?.perType ?? [];
    const details = perType.map(describeType);
    if (!outcome?.success) {
        return { variant: 'error', title: 'The export did not complete', details };
    }
    const captured = perType.filter((row) => row.success);
    return {
        variant: captured.length === perType.length ? 'success' : 'warning',
        title: `Exported ${captured.length} of ${perType.length} data types`,
        details,
    };
}

/** What is left under the title: the per-type lines, and Save as file once something was captured. */
export function ExportDatapackResult({ result, savable, source }: {
    result: ResultContent;
    savable: DatapackId | null;
    source: DatapackStoreName;
}): React.JSX.Element {
    return (
        <>
            <DatapackResultBody result={result} />
            {savable ? <SaveDatapackFileButton id={savable} source={source} /> : null}
        </>
    );
}
