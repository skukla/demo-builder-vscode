/**
 * A list of checkboxes for what an export can take several of: its store views and data types
 * (owner, 2026-11-02: cards are for choosing one thing). `CheckboxRow`, the row the API picker, the
 * Updates modal and the store's own items use; a long list scrolls inside the dialog.
 *
 * @module features/data-installer/ui/components/create-flow/stages/CheckRows
 */

import React from 'react';
import { dataTypeLabel } from '../../../dataTypeLabel';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';

export interface CheckRowOption {
    id: string;
    name: string;
    detail?: string;
}

/** Data type codes as rows: the code is the id sent, the name only what is shown. */
export const typeOptions = (types: readonly string[]): CheckRowOption[] =>
    types.map((type) => ({ id: type, name: dataTypeLabel(type) }));

export interface CheckRowsProps {
    options: readonly CheckRowOption[];
    picked: readonly string[];
    onToggle: (id: string, on: boolean) => void;
}

export function CheckRows({ options, picked, onToggle }: CheckRowsProps): React.ReactElement {
    return (
        <div className="datapack-check-rows">
            {options.map(({ id, name, detail }) => {
                const on = picked.includes(id);
                return <CheckboxRow key={id} label={name} detail={detail} isSelected={on} onChange={() => onToggle(id, !on)} />;
            })}
        </div>
    );
}
