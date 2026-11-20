/**
 * The export screen's result: what the export did, per type. `exportResult` words it; the result
 * window draws its outcome and lines (`datapackResultWords`), and `ExportDatapackResult` is what it
 * adds under them: Save as file, once something was captured.
 *
 * The `reason` line is the point of this view. The service reports a failed export as an
 * all-zero count with no explanation unless `verbose` is asked for; the client asks, so the
 * explanation exists and belongs on screen. An ACO pack's outcome has the same shape.
 *
 * @module features/data-installer/ui/components/ExportDatapackResult
 */

import React from 'react';
import { plainFailure, plainLabelled } from '../../plainFailure';
import { type PlainText } from '@/core/utils/plainText';
import { dataTypeLabel } from '../dataTypeLabel';
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
function describeType(row: ExportTypeOutcome): PlainText {
    const label = dataTypeLabel(row.dataType);
    if (!row.success) {
        return plainLabelled(`${label} failed`, row.reason ?? 'The service gave no reason.');
    }
    // "Left out" is true of the service's exclusions and of an ACO pack's (downloadable and
    // grouped products) alike.
    const excluded = row.excluded > 0 ? ` (${row.excluded.toLocaleString('en-US')} left out)` : '';
    return plainFailure(`${label}: ${row.exported.toLocaleString('en-US')} exported${excluded}`);
}

/**
 * The outcome to show: the title says how it went, and the lines what each type did. Amber when
 * some of the types did not make it, since "Exported 1 of 2" is not a clean success.
 */
export function exportResult(outcome: ExportOutcome | null, error?: string): ResultContent {
    if (error) {
        return { variant: 'error', title: 'Export Failed', message: plainFailure(error) };
    }
    const perType = outcome?.perType ?? [];
    const details = perType.map(describeType);
    if (!outcome?.success) {
        return { variant: 'error', title: 'Export Incomplete', details };
    }
    const captured = perType.filter((row) => row.success);
    return {
        variant: captured.length === perType.length ? 'success' : 'warning',
        title: `Exported ${captured.length} of ${perType.length} Data Types`,
        details,
    };
}

/** What is left under the per-type lines: Save as file, once something was captured. */
export function ExportDatapackResult({ savable, source }: {
    savable: DatapackId | null;
    source: DatapackStoreName;
}): React.JSX.Element | null {
    return savable ? <SaveDatapackFileButton id={savable} source={source} /> : null;
}
