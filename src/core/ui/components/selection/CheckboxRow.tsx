/**
 * One checkbox in a list: a name, a quieter second line, and why it cannot change when
 * it is locked.
 *
 * Extracted 2026-10-20 (PL-80) from `ApiAccessPicker`'s row, when the Updates modal on the
 * projects list needed the same row. Its classes had lived in the project-creation
 * feature's `add-integration-flow.css`, which the projects list bundle does not load, so
 * the row would have rendered unstyled there (ADR-017 §6). The rules moved unchanged, in
 * the same layer, to `core/ui/styles/checkbox-row.css`, which each host bundle imports.
 *
 * @module core/ui/components/selection/CheckboxRow
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';

export interface CheckboxRowProps {
    /** The name, in the primary register. */
    label: string;
    /** A quieter second word or two after it: an API code, "3 commits behind". */
    detail?: string;
    /** Why the row cannot change, shown after the detail. */
    reason?: string;
    isSelected: boolean;
    isDisabled?: boolean;
    onChange: () => void;
}

/** One row of a checkbox list. */
export function CheckboxRow({
    label,
    detail,
    reason,
    isSelected,
    isDisabled,
    onChange,
}: CheckboxRowProps): React.ReactElement {
    return (
        <div className="checkbox-row">
            <Checkbox isSelected={isSelected} isDisabled={isDisabled} onChange={onChange}>
                <span className="checkbox-row-label">{label}</span>
                {detail !== undefined && <span className="checkbox-row-detail">{detail}</span>}
                {reason !== undefined && <span className="checkbox-row-reason">{reason}</span>}
            </Checkbox>
        </div>
    );
}
