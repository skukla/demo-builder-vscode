/**
 * The export screen's result view: what the export did, per type. Moved out of
 * the export form (now `ServiceExportModal`) unchanged when the ACO choice took that file past
 * its size limit (datapack-engine step 14 item 19).
 *
 * The `reason` line is the point of this view. The service reports a failed export as an
 * all-zero count with no explanation unless `verbose` is asked for; the client asks, so the
 * explanation exists and belongs on screen. An ACO pack's outcome has the same shape.
 *
 * @module features/data-installer/ui/components/ExportDatapackResult
 */

import React from 'react';
import { dataTypeLabel } from '../dataTypeLabel';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';

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
        return `${label}: failed — ${row.reason ?? 'the service gave no reason'}`;
    }
    // "Left out" is true of the service's exclusions and of an ACO pack's (downloadable and
    // grouped products) alike.
    const excluded = row.excluded > 0 ? ` (${row.excluded} left out)` : '';
    return `${label}: ${row.exported} exported${excluded}`;
}

export function ExportDatapackResult({
    outcome,
    error,
}: {
    outcome: ExportOutcome | null;
    error?: string;
}): React.JSX.Element {
    if (error) {
        return <StatusDisplay variant="error" title="The export could not run" message={error} />;
    }
    const perType = outcome?.perType ?? [];
    const captured = perType.filter((row) => row.success);
    return (
        <StatusDisplay
            variant={outcome?.success ? 'success' : 'error'}
            title={
                outcome?.success
                    ? `Exported ${captured.length} of ${perType.length} data types`
                    : 'The export did not complete'
            }
            details={perType.map(describeType)}
        />
    );
}
