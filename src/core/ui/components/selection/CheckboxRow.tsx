/**
 * One checkbox in a list: a name, a quieter second line, and why it cannot change when
 * it is locked.
 *
 * Extracted 2026-10-20 (PL-80) from `ApiAccessPicker`'s row, when the Updates modal on the
 * projects list needed the same row. Its classes had lived in the project-creation
 * feature's `add-integration-flow.css`, which the projects list bundle does not load, so
 * the row would have rendered unstyled there (ADR-017 §6). The rules moved unchanged, in
 * the same layer, to `core/ui/styles/checkbox-row.css`, which each host bundle imports.
 * `isIndeterminate` was added 2026-10-30 for the Data Installer's "Clear demo data", where a
 * website's row stands for all of its stores. `help` was added 2026-11-18 (walk F231) for a
 * sentence explaining the box: it sits on its own line under the name, as a form's help text
 * does, where `detail` is a word or two beside it.
 *
 * @module core/ui/components/selection/CheckboxRow
 */

import { Checkbox } from '@adobe/react-spectrum';
import React from 'react';

export interface CheckboxRowProps {
    /** The name, in the primary register. */
    label: string;
    /** A quieter second word or two after it: an API code, "Newer version". */
    detail?: string;
    /** A sentence on what the box does, on its own line under the name. */
    help?: string;
    /** Why the row cannot change, shown after the detail. */
    reason?: string;
    isSelected: boolean;
    /** Some, not all, of what the row stands for is ticked (a website with some of its stores). */
    isIndeterminate?: boolean;
    isDisabled?: boolean;
    onChange: () => void;
}

/** One row of a checkbox list. */
export function CheckboxRow({
    label,
    detail,
    help,
    reason,
    isSelected,
    isIndeterminate,
    isDisabled,
    onChange,
}: CheckboxRowProps): React.ReactElement {
    return (
        <div className="checkbox-row">
            <Checkbox isSelected={isSelected} isIndeterminate={isIndeterminate} isDisabled={isDisabled} onChange={onChange}>
                <span className="checkbox-row-label">{label}</span>
                {detail !== undefined && <span className="checkbox-row-detail">{detail}</span>}
                {reason !== undefined && <span className="checkbox-row-reason">{reason}</span>}
                {help !== undefined && <span className="choice-help">{help}</span>}
            </Checkbox>
        </div>
    );
}
